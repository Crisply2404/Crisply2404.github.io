import RAPIER from '@dimforge/rapier2d-compat';
import type { LetterState } from './page-play-state';

export const pagePhysicsReady = RAPIER.init();

interface Letter {
  element: HTMLSpanElement;
  section: HTMLElement | null;
  range: Range;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  origin: { x: number; y: number };
  width: number;
  height: number;
}

export class PageLetters {
  private readonly world = new RAPIER.World({ x: 0, y: 0 });
  private readonly ball = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  private readonly ballCollider = this.world.createCollider(RAPIER.ColliderDesc.ball(12).setFriction(0.4), this.ball);
  private readonly overlay = document.createElement('div');
  private readonly letters: Letter[] = [];
  private readonly sources = new Set<HTMLElement>();
  private readonly segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  private firstStep = true;
  private scroll = window.scrollY;

  public constructor(private readonly shell: HTMLElement, saved: LetterState[] = [],
    private readonly onSelect: (element: HTMLElement) => void = () => undefined) {
    this.world.integrationParameters.contact_natural_frequency = 120;
    this.overlay.className = 'page-letter-layer';
    this.overlay.setAttribute('aria-hidden', 'true');
    const walker = document.createTreeWalker(shell, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.parentElement?.closest('script, style, .entrance-ball, .page-letter-layer')) continue;
      if (node.textContent?.trim() && !node.parentElement?.closest('[hidden]')) nodes.push(node);
    }
    shell.append(this.overlay);
    for (const node of nodes) this.addText(node);
    for (const source of this.sources) source.classList.add('page-text-source');
    this.letters.forEach((letter, index) => {
      const state = saved[index] ?? { x: 0, y: 0, angle: 0 };
      letter.body.setTranslation({ x: letter.origin.x + state.x, y: letter.origin.y + state.y }, false);
      letter.body.setRotation(state.angle, false);
    });
    this.paint();
  }

  public step(center: { x: number; y: number }, enabled: boolean): void {
    const scroll = window.scrollY;
    const delta = scroll - this.scroll;
    if (delta) for (const letter of this.letters) {
      if (!letter.element.classList.contains('page-header-letter')) continue;
      const position = letter.body.translation();
      letter.origin.y += delta;
      letter.body.setTranslation({ x: position.x, y: position.y + delta }, false);
    }
    this.scroll = scroll;
    this.ballCollider.setEnabled(enabled);
    if (this.firstStep) {
      this.ball.setTranslation(center, false);
      this.firstStep = false;
    }
    const previous = this.ball.translation();
    for (const letter of this.letters) letter.collider.setEnabled(!letter.section?.inert);
    const distance = Math.hypot(center.x - previous.x, center.y - previous.y);
    const substeps = Math.max(1, Math.ceil(distance / 0.5));
    this.world.timestep = 1 / (60 * substeps);
    for (let step = 1; step <= substeps; step += 1) {
      this.ball.setNextKinematicTranslation({ x: previous.x + (center.x - previous.x) * step / substeps,
        y: previous.y + (center.y - previous.y) * step / substeps });
      this.world.step();
    }
    this.paint();
  }

  public relocateBall(center: { x: number; y: number }): void {
    this.ball.setTranslation(center, false);
    this.ball.setNextKinematicTranslation(center);
  }

  public resize(): void {
    const states = this.snapshot();
    this.letters.forEach((letter, index) => {
      const rect = letter.range.getBoundingClientRect();
      const bounds = this.shell.getBoundingClientRect();
      letter.origin = { x: rect.left - bounds.left + rect.width / 2, y: rect.top - bounds.top + rect.height / 2 };
      letter.width = rect.width;
      letter.height = rect.height;
      letter.collider.setShape(new RAPIER.Cuboid(Math.max(rect.width / 2 - 0.5, 0.5), Math.max(rect.height / 2 - 2, 0.5)));
      const state = states[index] ?? { x: 0, y: 0, angle: 0 };
      letter.body.setTranslation({ x: letter.origin.x + state.x, y: letter.origin.y + state.y }, false);
      letter.element.style.width = `${rect.width}px`;
      letter.element.style.height = `${rect.height}px`;
      const source = (letter.range.startContainer as Text).parentElement!;
      const style = getComputedStyle(source);
      letter.element.style.font = style.font;
      letter.element.style.lineHeight = `${rect.height}px`;
      letter.element.style.letterSpacing = style.letterSpacing;
    });
    this.paint();
  }

  public snapshot(): LetterState[] {
    return this.letters.map(({ body, origin }) => {
      const position = body.translation();
      return { x: position.x - origin.x, y: position.y - origin.y, angle: body.rotation() };
    });
  }

  public get bottom(): number {
    return this.letters.reduce((height, letter) => letter.section?.inert || letter.element.classList.contains('page-header-letter')
      ? height : Math.max(height, letter.body.translation().y + letter.height), 0);
  }

  public destroy(): void {
    for (const source of this.sources) source.classList.remove('page-text-source');
    this.overlay.remove();
    this.world.free();
  }

  private addText(node: Text): void {
    const source = node.parentElement!;
    const style = getComputedStyle(source);
    const fixed = Boolean(source.closest('.site-header'));
    for (const { segment, index } of this.segmenter.segment(node.textContent!)) {
      if (!segment.trim()) continue;
      const range = document.createRange();
      range.setStart(node, index); range.setEnd(node, index + segment.length);
      const rect = range.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const bounds = this.shell.getBoundingClientRect();
      const origin = { x: rect.left - bounds.left + rect.width / 2, y: rect.top - bounds.top + rect.height / 2 };
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(origin.x, origin.y)
        .setLinearDamping(10).setAngularDamping(8).setCcdEnabled(true));
      const collider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(rect.width / 2 - 0.5, 0.5),
        Math.max(rect.height / 2 - 2, 0.5)).setMass(1).setRestitution(0.05).setFriction(0.4), body);
      const element = document.createElement('span');
      element.className = 'page-letter';
      element.textContent = segment;
      Object.assign(element.style, { font: style.font, lineHeight: `${rect.height}px`, color: '#fff',
        letterSpacing: style.letterSpacing, textTransform: style.textTransform,
        textDecoration: style.textDecoration, textUnderlineOffset: style.textUnderlineOffset,
        width: `${rect.width}px`, height: `${rect.height}px` });
      element.classList.toggle('page-header-letter', fixed);
      const action = source.closest<HTMLElement>('a, button');
      if (action) {
        element.classList.add('page-link-letter');
        element.addEventListener('pointerenter', (event) => {
          if (event.pointerType === 'touch') return;
          if (source.closest('[inert]')) return;
          action.classList.add('letter-hover');
          this.onSelect(action);
        });
        element.addEventListener('pointerleave', () => action.classList.remove('letter-hover'));
        element.addEventListener('click', () => { if (!source.closest('[inert]')) action.click(); });
      }
      this.overlay.append(element);
      this.letters.push({ element, section: source.closest<HTMLElement>('.work-panel'), range, body, collider, origin,
        width: rect.width, height: rect.height });
    }
    this.sources.add(source);
  }

  private paint(): void {
    const scroll = window.scrollY;
    for (const letter of this.letters) {
      letter.element.hidden = Boolean(letter.section?.inert && Number(getComputedStyle(letter.section).opacity) < 0.001);
      if (letter.section) letter.element.style.opacity = getComputedStyle(letter.section).opacity;
      const position = letter.body.translation(), angle = letter.body.rotation();
      const fixed = letter.element.classList.contains('page-header-letter');
      const x = position.x - letter.width / 2;
      const y = position.y - letter.height / 2 - (fixed ? scroll : 0);
      const transform = `translate(${x}px, ${y}px) rotate(${angle}rad)`;
      if (letter.element.style.transform !== transform) letter.element.style.transform = transform;
      if (letter.element.classList.contains('page-link-letter')) {
        const moved = Math.hypot(position.x - letter.origin.x, position.y - letter.origin.y) > 0.5 || Math.abs(angle) > 0.01;
        letter.element.style.pointerEvents = moved && !letter.section?.inert ? 'auto' : 'none';
      }
    }
  }
}
