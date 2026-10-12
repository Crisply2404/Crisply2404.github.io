import * as THREE from 'three';
import type { BlockData } from './blocks';
import { VIEWPORT, controlModeOrder, movementDirection, type WasdOrientation } from './config';
import { ControlDiagram } from './control-preview';
import { navigationForce } from './navigation';
import { NavigationRipple } from './navigation-ripple';
import { VisualBuilder } from './objects';
import { PhysicsEngine, PlayerState } from './physics';
import { MonoRenderer } from './renderer';
import rotateLeft from './icons/rotate-left.svg';
import rotateRight from './icons/rotate-right.svg';

interface BallDemo {
  content: THREE.Group;
  avatar: THREE.Group;
  physics: PhysicsEngine;
  player: PlayerState;
}

const stepDuration = 1 / 60;
const tutorialDuration = 14;
const moveInputs = [[0, -1], [1, -1], [1, 0], [0, 0]];
const moveKeys = ['w', 'd', 's', 'a'];

export class ControlTutorial {
  private readonly wrapper = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly rendering = new MonoRenderer(this.canvas, true);
  private readonly builder = new VisualBuilder(this.rendering);
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
  private readonly diagram?: ControlDiagram;
  private readonly rotation = new THREE.Group();
  private readonly mobile = matchMedia('(pointer: coarse)').matches;
  private readonly anchors = Array.from({ length: this.mobile ? 5 : 6 }, () => new THREE.Group());
  private readonly viewDemo = new THREE.Group();
  private readonly keys = new Map<string, HTMLElement>();
  private readonly modeDots: HTMLElement[];
  private readonly tapSymbol: HTMLElement;
  private readonly fingers: HTMLElement[];
  private readonly movement?: BallDemo;
  private readonly jumping: BallDemo;
  private readonly clicking: BallDemo;
  private readonly speaking = new THREE.Group();
  private readonly speakingBall: THREE.Group;
  private readonly speechFinger?: HTMLElement;
  private readonly speechGraphic: THREE.Mesh;
  private readonly speechFill: THREE.Mesh;
  private readonly speechTip: HTMLElement;
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
    this.wrapper.classList.toggle('tutorial-mobile', this.mobile);
    this.wrapper.setAttribute('role', 'group'); this.wrapper.setAttribute('aria-label', 'Controls');
    this.canvas.className = 'tutorial-canvas'; this.canvas.setAttribute('aria-hidden', 'true');
    const inputs = document.createElement('div'); inputs.className = 'tutorial-inputs';
    inputs.innerHTML = this.mobile ? `
      <div class="tutorial-input" data-control="tap" role="img" aria-label="Tap the floor: Move">
        <i class="tutorial-finger tutorial-tap"></i>
      </div>
      <div class="tutorial-input" data-control="gesture" role="img" aria-label="Two fingers: Zoom and move view">
        <div class="tutorial-gesture"><i class="tutorial-finger"></i><i class="tutorial-finger"></i></div>
      </div>
      <div class="tutorial-input" data-control="rotate" role="img" aria-label="Rotate view">
        <div class="tutorial-rotation-keys"><kbd data-key="q"><img src="${rotateLeft}" alt=""></kbd><kbd data-key="e"><img src="${rotateRight}" alt=""></kbd></div>
      </div>
      <div class="tutorial-input" data-control="jump" role="img" aria-label="Jump"><kbd class="tutorial-wide-key" data-key="space">JUMP</kbd></div>
      <div class="tutorial-input tutorial-speech-input" data-control="speech" role="img" aria-label="Tap your ball: Speak">
        <i class="tutorial-speech-bubble"><i></i><i></i><i></i></i>
      </div>` : `
      <div class="tutorial-input" data-control="move" role="img" aria-label="WASD: Move">
        <div class="tutorial-wasd"><kbd data-key="w">W</kbd><kbd data-key="a">A</kbd><kbd data-key="s">S</kbd><kbd data-key="d">D</kbd></div>
      </div>
      <div class="tutorial-input" data-control="click" role="img" aria-label="Click the floor: Move">
        <div class="tutorial-mouse"><i class="tutorial-mouse-button"></i><i class="tutorial-mouse-wheel"></i></div>
      </div>
      <div class="tutorial-input" data-control="jump" role="img" aria-label="Space: Jump"><kbd class="tutorial-wide-key" data-key="space">Space</kbd></div>
      <div class="tutorial-input" data-control="rotate" role="img" aria-label="Q / E or left / right arrow: Rotate view">
        <div class="tutorial-rotation-keys"><kbd data-key="q">Q</kbd><kbd data-key="e">E</kbd><kbd data-key="left">←</kbd><kbd data-key="right">→</kbd></div>
      </div>
      <div class="tutorial-input tutorial-tab" data-control="mode" role="img" aria-label="Tab: Switch control mode">
        <kbd class="tutorial-wide-key" data-key="tab">Tab</kbd><div class="tutorial-modes"><i></i><i></i><i></i></div>
      </div>
      <div class="tutorial-input tutorial-speech-input" data-control="speech" role="img" aria-label="Enter: Speak">
        <kbd class="tutorial-wide-key" data-key="enter">Enter</kbd><i class="tutorial-speech-bubble"><i></i><i></i><i></i></i>
      </div>
      `;
    this.wrapper.append(this.canvas, inputs); root.append(this.wrapper);
    if (this.mobile) {
      this.speechFinger = document.createElement('i');
      this.speechFinger.className = 'tutorial-finger tutorial-speech-tap';
      this.wrapper.append(this.speechFinger);
    }
    for (const key of inputs.querySelectorAll<HTMLElement>('[data-key]')) this.keys.set(key.dataset.key!, key);
    this.modeDots = [...inputs.querySelectorAll<HTMLElement>('.tutorial-modes i')];
    this.tapSymbol = inputs.querySelector<HTMLElement>(this.mobile ? '.tutorial-tap' : '.tutorial-mouse-button')!;
    this.fingers = [...inputs.querySelectorAll<HTMLElement>('.tutorial-gesture .tutorial-finger')];
    this.speechTip = inputs.querySelector<HTMLElement>('.tutorial-speech-bubble')!;

    const walkingBlocks: BlockData[] = [[0, 0], [-1, 0], [0, -1], [-1, -1], [1, 0], [1, -1]]
      .map(([gx, gz]) => ({ gx, gy: 0, gz, type: 'standard' }));
    const jumpBlocks: BlockData[] = [{ gx: 0, gy: 0, gz: 0, type: 'standard' }];
    const clickingBlocks: BlockData[] = [-1, 0, 1].map((gx) => ({ gx, gy: 0, gz: 0, type: 'standard' }));
    if (!this.mobile) this.movement = this.createBallDemo(walkingBlocks, new THREE.Vector3(0, 40.02, 0), new THREE.Vector3(0, 20, -20));
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
    if (this.mobile) {
      const viewContent = new THREE.Group();
      const viewBall = this.builder.createPlayerMesh(); viewBall.position.set(0, 40.02, 0);
      viewContent.add(this.builder.createLevelMesh(clickingBlocks), viewBall); viewContent.position.y = -20;
      this.viewDemo.add(viewContent);
    } else this.diagram = new ControlDiagram(this.builder);
    this.speakingBall = this.builder.createPlayerMesh();
    const speakingPlatform = this.builder.createLevelMesh(jumpBlocks);
    this.speakingBall.position.y = 40.02;
    this.speaking.add(speakingPlatform, this.speakingBall);
    this.speaking.position.y = -20;
    this.speechGraphic = this.builder.createStroke([
      [new THREE.Vector3(-22, 72, 0), new THREE.Vector3(22, 72, 0)],
      [new THREE.Vector3(22, 72, 0), new THREE.Vector3(22, 92, 0)],
      [new THREE.Vector3(22, 92, 0), new THREE.Vector3(-22, 92, 0)],
      [new THREE.Vector3(-22, 92, 0), new THREE.Vector3(-22, 72, 0)],
      [new THREE.Vector3(-12, 82, 0), new THREE.Vector3(-5, 82, 0)],
      [new THREE.Vector3(5, 82, 0), new THREE.Vector3(12, 82, 0)],
    ]);
    this.speechGraphic.geometry.translate(0, -82, 0);
    this.speechGraphic.position.y = 82;
    this.speechFill = new THREE.Mesh(new THREE.PlaneGeometry(44, 20), this.builder.materialBlack);
    this.speechFill.position.set(0, 82, -0.02);
    this.speaking.add(this.speechFill, this.speechGraphic);
    const contents = this.mobile ? [this.clicking.content, this.viewDemo, this.rotation, this.jumping.content, this.speaking]
      : [this.movement!.content, this.clicking.content, this.jumping.content, this.rotation, this.diagram!, this.speaking];
    this.anchors.forEach((anchor, index) => { anchor.add(contents[index]); this.scene.add(anchor); });
    this.camera.position.set(Math.sin(Math.PI / 4) * VIEWPORT.cameraDistance, VIEWPORT.cameraHeight,
      Math.cos(Math.PI / 4) * VIEWPORT.cameraDistance);
    this.camera.lookAt(0, 0, 0); this.camera.updateMatrixWorld();
    this.resize(); this.resizeObserver.observe(this.canvas);
  }

  public update(delta: number, orientation: WasdOrientation = 2): void {
    if (this.disposed) return;
    if (!Number.isFinite(delta) || delta < 0) throw new Error('Tutorial time must be finite and nonnegative');
    this.elapsed += delta;
    if (this.elapsed >= tutorialDuration) { this.dispose(); return; }
    this.accumulator += delta;
    this.renderAccumulator += delta;
    while (this.accumulator >= stepDuration) {
      this.animateStep(orientation); this.accumulator -= stepDuration; this.tick += 1;
    }
    const phase = this.tick % 240;
    const turn = phase < 120 ? Math.PI / 2 : 0;
    this.rotation.rotation.y = THREE.MathUtils.damp(this.rotation.rotation.y, -turn, 12, delta);
    const modeIndex = (Math.floor(this.tick / 120) + 1) % controlModeOrder.length;
    const mode = controlModeOrder[modeIndex];
    this.diagram?.setDirection(mode, Math.PI / 4);
    this.modeDots.forEach((dot, index) => dot.classList.toggle('is-active', index === modeIndex));
    this.setKey('tab', this.tick % 120 < 12);
    this.setKey('q', phase < 12); this.setKey('left', phase < 12);
    this.setKey('e', phase >= 120 && phase < 132); this.setKey('right', phase >= 120 && phase < 132);
    const speechPhase = this.tick % 180;
    const opening = Math.min(1, Math.max(0, (speechPhase - 24) / 12));
    const closing = Math.min(1, Math.max(0, (150 - speechPhase) / 12));
    const visible = opening * closing;
    this.speechGraphic.visible = visible > 0;
    this.speechFill.visible = visible > 0;
    this.speechGraphic.scale.setScalar(0.8 + visible * 0.2);
    this.speechGraphic.quaternion.copy(this.camera.quaternion);
    this.speechFill.quaternion.copy(this.camera.quaternion);
    this.speechFill.scale.copy(this.speechGraphic.scale);
    this.speechTip.style.opacity = String(visible);
    this.speechTip.style.transform = `translateY(${(1 - visible) * 4}px) scale(${0.8 + visible * 0.2})`;
    this.setKey('enter', speechPhase >= 18 && speechPhase < 30 || speechPhase >= 132 && speechPhase < 144);
    if (this.mobile) this.animateGesture();
    // 球体共用主场景的摄像机朝向与球面深度。
    this.scene.updateMatrixWorld(true);
    this.scene.traverse((object) => {
      if (object.name === 'PlayerMesh') object.quaternion.copy(object.parent!.getWorldQuaternion(new THREE.Quaternion()))
        .invert().multiply(this.camera.quaternion);
    });
    if (this.speechFinger) {
      const point = this.speakingBall.getWorldPosition(new THREE.Vector3()).project(this.camera);
      const scale = this.canvas.clientHeight / (this.camera.top - this.camera.bottom);
      const contact = speechPhase >= 18 && speechPhase < 30;
      const approach = THREE.MathUtils.smoothstep(speechPhase, 6, 18);
      const retreat = THREE.MathUtils.smoothstep(speechPhase, 30, 48);
      this.speechFinger.style.left = `${(point.x + 1) * this.canvas.clientWidth / 2 - 7}px`;
      this.speechFinger.style.top = `${(1 - point.y) * this.canvas.clientHeight / 2 - 20 * scale - 30 - 12 * (1 - approach + retreat)}px`;
      this.speechFinger.style.opacity = String(speechPhase < 54 ? 1 : 0);
      this.speechFinger.classList.toggle('is-active', contact);
    }
    this.wrapper.style.opacity = String(Math.min(1, this.elapsed / 0.25, (tutorialDuration - this.elapsed) / 2));
    if (this.renderAccumulator >= 1 / 30) {
      this.renderAccumulator %= 1 / 30;
      this.rendering.render(this.scene, this.camera);
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.resizeObserver.disconnect();
    for (const demo of [this.movement, this.jumping, this.clicking]) demo?.physics.dispose();
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

  private animateStep(orientation: WasdOrientation): void {
    const movementIndex = Math.floor(this.tick / 48) % moveInputs.length;
    if (this.movement) {
      const [x, y] = moveInputs[movementIndex];
      const [worldX, worldZ] = movementDirection(x * 24, y * 24, Math.PI / 4, orientation);
      const movementForce = navigationForce(this.movement.player.pos, this.movement.player.vel, new THREE.Vector3(worldX, 40.02, worldZ));
      this.stepBall(this.movement, movementForce);
      for (const key of moveKeys) this.setKey(key, key === moveKeys[movementIndex] && movementForce.lengthSq() > 0.01);
    }
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
    this.tapSymbol.classList.toggle('is-active', clicking >= 18 && clicking < 30);
  }

  private animateGesture(): void {
    const phase = this.tick % 360;
    const motion = (1 - Math.cos(phase % 180 / 180 * Math.PI * 2)) / 2;
    const scale = phase < 180 ? 1 + motion * 0.3 : 1;
    const pan = phase >= 180 ? Math.sin(phase % 180 / 180 * Math.PI * 2) * 16 : 0;
    this.viewDemo.scale.setScalar(scale);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.viewDemo.position.copy(right).multiplyScalar(pan);
    this.fingers.forEach((finger, index) => {
      const x = (index === 0 ? -1 : 1) * (11 + (scale - 1) * 32) + pan * 0.3;
      finger.style.transform = `translateX(${x}px)`;
    });
  }

  private stepBall(demo: BallDemo, force: THREE.Vector3): void {
    if (!demo.physics.step(demo.player, force)) throw new Error('Tutorial ball reached a hazardous surface');
    demo.avatar.position.copy(demo.player.pos);
  }

  private setKey(key: string, active: boolean): void { this.keys.get(key)?.classList.toggle('is-active', active); }

  private resize(): void {
    if (this.disposed) return;
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    if (width <= 0 || height <= 0) throw new Error('Tutorial requires a visible canvas');
    const unitsPerPixel = Math.max(220 / (width / this.anchors.length), 200 / height);
    this.rendering.resize(width, height);
    this.camera.left = -width * unitsPerPixel / 2; this.camera.right = -this.camera.left;
    this.camera.top = height * unitsPerPixel / 2; this.camera.bottom = -this.camera.top; this.camera.updateProjectionMatrix();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.anchors.forEach((anchor, index) => anchor.position.copy(right)
      .multiplyScalar(((index + 0.5) / this.anchors.length - 0.5) * width * unitsPerPixel));
  }
}
