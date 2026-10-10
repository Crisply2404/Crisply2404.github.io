import * as THREE from 'three';
import type { BlockData } from './blocks';
import { VIEWPORT, type WasdOrientation } from './config';
import { ControlDiagram } from './control-preview';
import { navigationForce } from './navigation';
import { NavigationRipple } from './navigation-ripple';
import { VisualBuilder } from './objects';
import { PhysicsEngine, PlayerState } from './physics';
import { MonoRenderer } from './renderer';

interface BallDemo {
  content: THREE.Group;
  avatar: THREE.Group;
  physics: PhysicsEngine;
  player: PlayerState;
}

const stepDuration = 1 / 60;
const tutorialDuration = 14;
const moveTargets = [new THREE.Vector3(-32, 40.02, 0), new THREE.Vector3(-32, 40.02, -32),
  new THREE.Vector3(0, 40.02, -32), new THREE.Vector3(0, 40.02, 0)];
const moveKeys = ['w', 'd', 's', 'a'];

export class ControlTutorial {
  private readonly wrapper = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly rendering = new MonoRenderer(this.canvas);
  private readonly builder = new VisualBuilder(this.rendering);
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
  private readonly diagram = new ControlDiagram(this.builder);
  private readonly rotation = new THREE.Group();
  private readonly anchors = Array.from({ length: 5 }, () => new THREE.Group());
  private readonly keys = new Map<string, HTMLElement>();
  private readonly modeDots: HTMLElement[];
  private readonly mouseButton: HTMLElement;
  private readonly movement: BallDemo;
  private readonly jumping: BallDemo;
  private readonly clicking: BallDemo;
  private readonly ripple: NavigationRipple;
  private readonly mouseTarget = new THREE.Vector3(-40, 40.02, 0);
  private readonly resizeObserver = new ResizeObserver(() => this.resize());
  private elapsed = 0;
  private accumulator = 0;
  private renderAccumulator = 0;
  private tick = 0;
  private disposed = false;

  public constructor(root: HTMLElement) {
    this.wrapper.className = 'control-tutorial';
    this.wrapper.setAttribute('role', 'group'); this.wrapper.setAttribute('aria-label', 'Controls');
    this.canvas.className = 'tutorial-canvas'; this.canvas.setAttribute('aria-hidden', 'true');
    const inputs = document.createElement('div'); inputs.className = 'tutorial-inputs';
    inputs.innerHTML = `
      <div class="tutorial-input" data-control="move" role="img" aria-label="WASD: Move">
        <div class="tutorial-wasd"><kbd data-key="w">W</kbd><kbd data-key="a">A</kbd><kbd data-key="s">S</kbd><kbd data-key="d">D</kbd></div>
      </div>
      <div class="tutorial-input" data-control="jump" role="img" aria-label="Space: Jump"><kbd class="tutorial-wide-key" data-key="space">Space</kbd></div>
      <div class="tutorial-input" data-control="rotate" role="img" aria-label="Q / E or left / right arrow: Rotate view">
        <div class="tutorial-rotation-keys"><kbd data-key="q">Q</kbd><kbd data-key="e">E</kbd><kbd data-key="left">←</kbd><kbd data-key="right">→</kbd></div>
      </div>
      <div class="tutorial-input tutorial-tab" data-control="mode" role="img" aria-label="Tab: Switch control mode">
        <kbd class="tutorial-wide-key" data-key="tab">Tab ⇥</kbd><div class="tutorial-modes"><i></i><i></i><i></i></div>
      </div>
      <div class="tutorial-input" data-control="click" role="img" aria-label="Click the floor: Move">
        <div class="tutorial-mouse"><i class="tutorial-mouse-button"></i><i class="tutorial-mouse-wheel"></i></div>
      </div>`;
    this.wrapper.append(this.canvas, inputs); root.append(this.wrapper);
    for (const key of inputs.querySelectorAll<HTMLElement>('[data-key]')) this.keys.set(key.dataset.key!, key);
    this.modeDots = [...inputs.querySelectorAll<HTMLElement>('.tutorial-modes i')];
    this.mouseButton = inputs.querySelector<HTMLElement>('.tutorial-mouse-button')!;

    const walkingBlocks: BlockData[] = [[0, 0], [-1, 0], [0, -1], [-1, -1]]
      .map(([gx, gz]) => ({ gx, gy: 0, gz, type: 'standard' }));
    const jumpBlocks: BlockData[] = [{ gx: 0, gy: 0, gz: 0, type: 'standard' }];
    const clickingBlocks: BlockData[] = [-1, 0, 1].map((gx) => ({ gx, gy: 0, gz: 0, type: 'standard' }));
    this.movement = this.createBallDemo(walkingBlocks, new THREE.Vector3(0, 40.02, 0), new THREE.Vector3(-20, 20, -20));
    this.jumping = this.createBallDemo(jumpBlocks, new THREE.Vector3(0, 40.02, 0), new THREE.Vector3(0, 44, 0));
    this.clicking = this.createBallDemo(clickingBlocks, this.mouseTarget, new THREE.Vector3(0, 20, 0));
    this.ripple = new NavigationRipple(clickingBlocks); this.clicking.content.add(this.ripple);
    const steps = this.builder.createLevelMesh([
      { gx: 0, gy: 0, gz: 0, type: 'standard' }, { gx: 1, gy: 0, gz: 0, type: 'standard' },
      { gx: 1, gy: 1, gz: 0, type: 'standard' },
    ]);
    const ball = this.builder.createPlayerMesh(); ball.position.set(40, 80.02, 0);
    const rotatingContent = new THREE.Group(); rotatingContent.add(steps, ball); rotatingContent.position.set(-20, -28, 0);
    this.rotation.add(rotatingContent);
    const contents = [this.movement.content, this.jumping.content, this.rotation, this.diagram, this.clicking.content];
    this.anchors.forEach((anchor, index) => { anchor.add(contents[index]); this.scene.add(anchor); });
    this.camera.position.set(Math.sin(Math.PI / 4) * VIEWPORT.cameraDistance, VIEWPORT.cameraHeight,
      Math.cos(Math.PI / 4) * VIEWPORT.cameraDistance);
    this.camera.lookAt(0, 0, 0); this.camera.updateMatrixWorld();
    this.resize(); this.resizeObserver.observe(this.canvas);
  }

  public update(delta: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(delta) || delta < 0) throw new Error('Tutorial time must be finite and nonnegative');
    this.elapsed += delta;
    if (this.elapsed >= tutorialDuration) { this.dispose(); return; }
    this.accumulator += delta;
    this.renderAccumulator += delta;
    while (this.accumulator >= stepDuration) {
      this.animateStep(); this.accumulator -= stepDuration; this.tick += 1;
    }
    const phase = this.tick % 240;
    const turn = phase < 120 ? Math.PI / 2 : 0;
    this.rotation.rotation.y = THREE.MathUtils.damp(this.rotation.rotation.y, -turn, 12, delta);
    const mode = Math.floor(this.tick / 120) % 3 as WasdOrientation;
    this.diagram.setDirection(mode, Math.PI / 4);
    this.modeDots.forEach((dot, index) => dot.classList.toggle('is-active', index === mode));
    this.setKey('tab', this.tick % 120 < 12);
    this.setKey('q', phase < 12); this.setKey('left', phase < 12);
    this.setKey('e', phase >= 120 && phase < 132); this.setKey('right', phase >= 120 && phase < 132);
    this.wrapper.style.opacity = String(Math.min(1, this.elapsed / 0.25, (tutorialDuration - this.elapsed) / 2));
    if (this.renderAccumulator >= 1 / 30) {
      this.renderAccumulator %= 1 / 30;
      this.rendering.render(this.scene, this.camera);
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.resizeObserver.disconnect();
    for (const demo of [this.movement, this.jumping, this.clicking]) demo.physics.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      }
    });
    this.builder.dispose(); this.rendering.dispose(); this.wrapper.remove();
  }

  private createBallDemo(blocks: readonly BlockData[], position: THREE.Vector3, center: THREE.Vector3): BallDemo {
    const player = new PlayerState(); player.place(position);
    const avatar = this.builder.createPlayerMesh(); avatar.position.copy(position);
    const content = new THREE.Group(); content.add(this.builder.createLevelMesh(blocks), avatar); content.position.copy(center).negate();
    return { content, avatar, player, physics: new PhysicsEngine(blocks) };
  }

  private animateStep(): void {
    const movementIndex = Math.floor(this.tick / 48) % moveTargets.length;
    const movementForce = navigationForce(this.movement.player.pos, this.movement.player.vel, moveTargets[movementIndex]);
    this.stepBall(this.movement, movementForce);
    for (const key of moveKeys) this.setKey(key, key === moveKeys[movementIndex] && movementForce.lengthSq() > 0.01);
    const jumping = this.tick % 120;
    if (jumping === 12) this.jumping.player.jump(true, false);
    if (jumping === 35) this.jumping.player.jump(false, true);
    this.stepBall(this.jumping, new THREE.Vector3());
    this.setKey('space', jumping >= 12 && jumping < 35);
    const clicking = this.tick % 180;
    this.ripple.update(stepDuration);
    if (clicking === 18) {
      this.mouseTarget.x = Math.floor(this.tick / 180) % 2 === 0 ? 40 : -40;
      this.scene.updateMatrixWorld(true);
      this.ripple.show(this.clicking.content.localToWorld(new THREE.Vector3(this.mouseTarget.x, 20, 0)));
    }
    this.stepBall(this.clicking, navigationForce(this.clicking.player.pos, this.clicking.player.vel, this.mouseTarget));
    this.mouseButton.classList.toggle('is-active', clicking >= 18 && clicking < 30);
  }

  private stepBall(demo: BallDemo, force: THREE.Vector3): void {
    if (!demo.physics.step(demo.player, force)) throw new Error('Tutorial ball reached a hazardous surface');
    demo.avatar.position.copy(demo.player.pos);
  }

  private setKey(key: string, active: boolean): void { this.keys.get(key)!.classList.toggle('is-active', active); }

  private resize(): void {
    if (this.disposed) return;
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    if (width <= 0 || height <= 0) throw new Error('Tutorial requires a visible canvas');
    const unitsPerPixel = 220 / (width / this.anchors.length);
    this.rendering.resize(width, height);
    this.camera.left = -width * unitsPerPixel / 2; this.camera.right = -this.camera.left;
    this.camera.top = height * unitsPerPixel / 2; this.camera.bottom = -this.camera.top; this.camera.updateProjectionMatrix();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.anchors.forEach((anchor, index) => anchor.position.copy(right)
      .multiplyScalar(((index + 0.5) / this.anchors.length - 0.5) * width * unitsPerPixel));
  }
}
