import { speechCharacterLimit, type SpeechMessage } from './presence-rules';

interface SpeechPanel { panel: HTMLDivElement; expiresAt: number }
interface SpeechStack { anchor: HTMLDivElement; messages: SpeechPanel[] }

export class SpeechBubbles {
  private readonly composer = document.createElement('div');
  private readonly editor = document.createElement('div');
  private readonly input = document.createElement('input');
  private readonly listeners = new AbortController();
  private readonly bubbles = new Map<string, SpeechStack>();
  private closeTimer: number | undefined;
  private generation = 0;
  private composing = false;
  private previousEditing = false;
  public editing = false;

  public get editorHeight(): number { return this.editing ? this.composer.offsetHeight : 0; }

  public constructor(private readonly root: HTMLElement, private readonly send: (text: string) => void,
    private readonly onEditing: (editing: boolean) => void) {
    this.composer.className = 'speech-anchor speech-composer';
    this.composer.hidden = true;
    this.editor.className = 'speech-panel';
    this.input.className = 'speech-input';
    this.input.type = 'text';
    this.input.maxLength = speechCharacterLimit;
    this.input.setAttribute('aria-label', 'Message');
    this.input.placeholder = 'Say something';
    this.input.autocomplete = 'off';
    this.input.enterKeyHint = 'send';
    this.editor.append(this.input);
    this.composer.append(this.editor);
    root.append(this.composer);
    this.input.addEventListener('compositionstart', () => { this.composing = true; }, { signal: this.listeners.signal });
    this.input.addEventListener('compositionend', () => { this.composing = false; }, { signal: this.listeners.signal });
    this.input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.isComposing || this.composing || event.keyCode === 229) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        const text = this.input.value.trim();
        if (text) this.send(text);
        this.close();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    }, { signal: this.listeners.signal });
    this.input.addEventListener('keyup', (event) => event.stopPropagation(), { signal: this.listeners.signal });
    document.addEventListener('pointerdown', (event) => {
      if (!this.editing || this.editor.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.close();
    }, { capture: true, signal: this.listeners.signal });
  }

  public open(): void {
    if (this.editing) return;
    if (this.closeTimer !== undefined) clearTimeout(this.closeTimer);
    const generation = ++this.generation;
    this.editing = true;
    this.composer.hidden = false;
    this.input.value = '';
    this.composing = false;
    this.onEditing(true);
    this.editor.getBoundingClientRect();
    this.editor.classList.add('is-visible');
    this.input.focus({ preventScroll: true });
    requestAnimationFrame(() => { if (generation === this.generation) this.input.focus({ preventScroll: true }); });
  }

  public close(): void {
    if (!this.editing) return;
    this.generation += 1;
    this.editing = false;
    this.editor.classList.remove('is-visible');
    this.input.blur();
    this.composing = false;
    this.onEditing(false);
    this.closeTimer = window.setTimeout(() => { this.composer.hidden = true; this.input.value = ''; }, 320);
  }

  public show(message: SpeechMessage): void {
    let stack = this.bubbles.get(message.id);
    if (!stack) {
      const anchor = document.createElement('div');
      anchor.className = 'speech-anchor speech-messages';
      anchor.dataset.visitor = message.id;
      this.root.append(anchor);
      stack = { anchor, messages: [] };
      this.bubbles.set(message.id, stack);
    }
    const before = this.positions(stack);
    const panel = document.createElement('div');
    panel.className = 'speech-panel';
    panel.textContent = message.text;
    stack.anchor.append(panel);
    stack.messages.push({ panel, expiresAt: message.expiresAt });
    this.animatePositions(stack, before);
    panel.getBoundingClientRect();
    panel.classList.add('is-visible');
  }

  public update(local: { x: number; y: number }, positions: Map<string, { x: number; y: number }>, localId: string): void {
    this.place(this.composer, local);
    const editingChanged = this.previousEditing !== this.editing;
    this.previousEditing = this.editing;
    const now = Date.now();
    for (const [id, bubble] of this.bubbles) {
      const expired = bubble.messages.filter((message) => now >= message.expiresAt + 220);
      if (expired.length) {
        const before = this.positions(bubble);
        for (const message of expired) message.panel.remove();
        bubble.messages = bubble.messages.filter((message) => !expired.includes(message));
        this.animatePositions(bubble, before);
      }
      if (!bubble.messages.length) { bubble.anchor.remove(); this.bubbles.delete(id); continue; }
      for (const message of bubble.messages) if (now >= message.expiresAt) message.panel.classList.remove('is-visible');
      const position = positions.get(id);
      if (!position || position.x < 0 || position.x > this.root.clientWidth
        || position.y < 0 || position.y > this.root.clientHeight) {
        bubble.anchor.hidden = true;
        continue;
      }
      bubble.anchor.hidden = false;
      const previousBottom = bubble.anchor.getBoundingClientRect().bottom;
      bubble.anchor.style.left = `${position.x}px`;
      bubble.anchor.style.top = `${position.y}px`;
      if (editingChanged && id === localId) {
        for (const animation of bubble.anchor.getAnimations()) animation.cancel();
        bubble.anchor.animate([{ translate: `0 ${previousBottom - position.y}px` }, { translate: '0 0' }],
          { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
      }
    }
  }

  public remove(id: string): void {
    this.bubbles.get(id)?.anchor.remove();
    this.bubbles.delete(id);
  }

  public destroy(): void {
    this.generation += 1;
    this.listeners.abort();
    if (this.closeTimer !== undefined) clearTimeout(this.closeTimer);
    this.composer.remove();
    for (const bubble of this.bubbles.values()) bubble.anchor.remove();
    this.bubbles.clear();
  }

  private positions(stack: SpeechStack): Map<HTMLElement, number> {
    return new Map(stack.messages.map(({ panel }) => [panel, panel.getBoundingClientRect().top]));
  }

  private animatePositions(stack: SpeechStack, previous: Map<HTMLElement, number>): void {
    for (const { panel } of stack.messages) {
      const top = previous.get(panel);
      if (top === undefined) continue;
      const displacement = top - panel.getBoundingClientRect().top;
      if (Math.abs(displacement) < 0.1) continue;
      panel.style.transition = 'none';
      panel.style.transform = `translateY(${displacement}px)`;
      panel.getBoundingClientRect();
      panel.style.transition = '';
      panel.style.transform = '';
    }
  }

  private place(anchor: HTMLElement, position: { x: number; y: number }): void {
    const halfWidth = anchor.offsetWidth / 2;
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportBottom = viewportTop + (viewport?.height ?? innerHeight);
    const x = Math.max(halfWidth + 12, Math.min(this.root.clientWidth - halfWidth - 12, position.x));
    const y = Math.max(viewportTop + anchor.offsetHeight + 8, Math.min(viewportBottom - 12, position.y));
    anchor.style.left = `${x}px`;
    anchor.style.top = `${y}px`;
  }
}
