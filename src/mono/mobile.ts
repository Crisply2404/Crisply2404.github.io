import arrow from './icons/arrow.svg';
import rotateLeft from './icons/rotate-left.svg';
import rotateRight from './icons/rotate-right.svg';

type Action = 'up' | 'down' | 'left' | 'right' | 'jump' | 'rotateLeft' | 'rotateRight';

export class MobileControls {
  private readonly wrapper = document.createElement('div');
  private readonly left = document.createElement('div');
  private readonly right = document.createElement('div');
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly active = new Map<number, { side: 'left' | 'right'; actions: Action[]; button: string }>();
  private readonly abort = new AbortController();

  public constructor(root: HTMLElement, private readonly onInput: (action: Action, pressed: boolean) => void) {
    this.wrapper.className = 'mobile-controls'; this.left.className = 'dpad'; this.right.className = 'action-pad';
    const directions = ['up-left', 'up', 'up-right', 'left', '', 'right', 'down-left', 'down', 'down-right'];
    const angles = [-45, 0, 45, -90, 0, 90, -135, 180, 135];
    directions.forEach((direction, index) => {
      if (!direction) return;
      const button = this.button(direction, `<img src="${arrow}" alt="" style="transform:rotate(${angles[index]}deg)">`);
      button.style.gridColumn = String(index % 3 + 1); button.style.gridRow = String(Math.floor(index / 3) + 1);
      this.left.append(button);
    });
    this.right.append(this.button('rotateLeft', `<img src="${rotateLeft}" alt="">`),
      this.button('rotateRight', `<img src="${rotateRight}" alt="">`), this.button('jump', 'JUMP'));
    this.wrapper.append(this.left, this.right); root.append(this.wrapper);
    this.wrapper.hidden = !matchMedia('(pointer: coarse)').matches;
    this.resize(); window.addEventListener('resize', this.resize, { signal: this.abort.signal });
    this.wrapper.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch') return;
      const side = this.left.contains(event.target as Node) ? 'left' : 'right';
      for (const [id, touch] of this.active) {
        if (touch.side !== side) continue;
        for (const action of touch.actions) this.onInput(action, false);
        this.active.delete(id);
      }
      this.active.set(event.pointerId, { side, actions: [], button: '' }); this.wrapper.setPointerCapture(event.pointerId);
      this.move(event); event.preventDefault();
    }, { signal: this.abort.signal });
    this.wrapper.addEventListener('pointermove', (event) => this.move(event), { signal: this.abort.signal });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.wrapper.addEventListener(type, (event) => {
        const id = (event as PointerEvent).pointerId;
        for (const action of this.active.get(id)?.actions ?? []) this.onInput(action, false);
        this.active.delete(id); this.refresh();
      }, { signal: this.abort.signal });
    }
  }

  public reset(): void {
    for (const touch of this.active.values()) for (const action of touch.actions) this.onInput(action, false);
    this.active.clear(); this.refresh();
  }

  public dispose(): void { this.reset(); this.abort.abort(); this.wrapper.remove(); }

  private button(action: string, html: string): HTMLButtonElement {
    const button = document.createElement('button'); button.className = 'touch-button';
    button.dataset.action = action; button.setAttribute('aria-label', action); button.innerHTML = html;
    this.buttons.set(action, button); return button;
  }

  private readonly resize = (): void => {
    const width = window.innerWidth, height = window.innerHeight;
    const scale = Math.min(width >= 368 ? 1 : (width - 40) / 336, Math.max(0.25, (height - 144) / 224));
    this.wrapper.style.setProperty('--control-scale', String(scale));
  };

  private move(event: PointerEvent): void {
    const touch = this.active.get(event.pointerId); if (!touch) return;
    const actions: Action[] = [];
    if (touch.side === 'left') {
      const bounds = this.left.getBoundingClientRect();
      const x = event.clientX - bounds.left - bounds.width / 2, y = event.clientY - bounds.top - bounds.height / 2;
      if (Math.hypot(x, y) >= 15) {
        const direction = Math.round(Math.atan2(y, x) / (Math.PI / 4));
        if ([-3, -2, -1].includes(direction)) actions.push('up');
        if ([1, 2, 3].includes(direction)) actions.push('down');
        if (Math.abs(direction) >= 3) actions.push('left');
        if (Math.abs(direction) <= 1) actions.push('right');
      }
    } else {
      for (const action of ['rotateLeft', 'rotateRight', 'jump'] as const) {
        const bounds = this.buttons.get(action)!.getBoundingClientRect();
        if (event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom) actions.push(action);
      }
    }
    for (const action of touch.actions) if (!actions.includes(action)) this.onInput(action, false);
    for (const action of actions) if (!touch.actions.includes(action)) this.onInput(action, true);
    touch.actions = actions;
    touch.button = actions.join('-');
    this.refresh();
  }

  private refresh(): void {
    const buttons = new Set([...this.active.values()].map((touch) => touch.button));
    for (const [name, button] of this.buttons) {
      button.classList.toggle('is-active', buttons.has(name));
    }
  }
}
