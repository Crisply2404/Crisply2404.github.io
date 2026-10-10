import rotateLeft from './icons/rotate-left.svg';
import rotateRight from './icons/rotate-right.svg';

type Action = 'jump' | 'rotateLeft' | 'rotateRight';

export class MobileControls {
  private readonly wrapper = document.createElement('div');
  private readonly buttons = new Map<Action, HTMLButtonElement>();
  private readonly active = new Map<number, Action>();
  private readonly abort = new AbortController();

  public constructor(root: HTMLElement, private readonly onInput: (action: Action, pressed: boolean) => void) {
    this.wrapper.className = 'mobile-controls';
    const rotation = document.createElement('div'); rotation.className = 'rotation-pad';
    rotation.append(this.button('rotateLeft', `<img src="${rotateLeft}" alt="">`),
      this.button('rotateRight', `<img src="${rotateRight}" alt="">`));
    this.wrapper.append(rotation, this.button('jump', 'JUMP')); root.append(this.wrapper);
    this.wrapper.hidden = !matchMedia('(pointer: coarse)').matches;
    this.wrapper.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch') return;
      const button = (event.target as Element).closest<HTMLButtonElement>('.touch-button');
      if (!button) return;
      const action = button.dataset.action as Action;
      const alreadyPressed = [...this.active.values()].includes(action);
      this.active.set(event.pointerId, action); button.setPointerCapture(event.pointerId);
      if (!alreadyPressed) this.onInput(action, true);
      this.refresh(); event.preventDefault();
    }, { signal: this.abort.signal });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.wrapper.addEventListener(type, (event) => {
        const id = (event as PointerEvent).pointerId;
        const action = this.active.get(id);
        if (!action) return;
        this.active.delete(id);
        if (![...this.active.values()].includes(action)) this.onInput(action, false);
        this.refresh();
      }, { signal: this.abort.signal });
    }
  }

  public reset(): void {
    for (const action of new Set(this.active.values())) this.onInput(action, false);
    this.active.clear(); this.refresh();
  }

  public dispose(): void { this.reset(); this.abort.abort(); this.wrapper.remove(); }

  private button(action: Action, html: string): HTMLButtonElement {
    const button = document.createElement('button'); button.className = 'touch-button';
    button.dataset.action = action; button.setAttribute('aria-label', action); button.innerHTML = html;
    this.buttons.set(action, button); return button;
  }

  private refresh(): void {
    const actions = new Set(this.active.values());
    for (const [action, button] of this.buttons) button.classList.toggle('is-active', actions.has(action));
  }
}
