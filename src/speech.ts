import { speechCharacterLimit, type SpeechMessage } from './presence-rules';

interface SpeechPanel { anchor: HTMLDivElement; panel: HTMLDivElement; expiresAt: number }

export class SpeechBubbles {
  private readonly composer = document.createElement('div');
  private readonly editor = document.createElement('div');
  private readonly input = document.createElement('input');
  private readonly listeners = new AbortController();
  private readonly bubbles = new Map<string, SpeechPanel>();
  private closeTimer: number | undefined;
  private generation = 0;
  private composing = false;
  public editing = false;

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
    this.closeTimer = window.setTimeout(() => { this.composer.hidden = true; }, 320);
  }

  public show(message: SpeechMessage): void {
    const existing = this.bubbles.get(message.id);
    if (existing) {
      existing.panel.textContent = message.text;
      existing.expiresAt = message.expiresAt;
      existing.panel.classList.add('is-visible');
      return;
    }
    const anchor = document.createElement('div');
    anchor.className = 'speech-anchor';
    anchor.dataset.visitor = message.id;
    const panel = document.createElement('div');
    panel.className = 'speech-panel';
    panel.textContent = message.text;
    anchor.append(panel);
    this.root.append(anchor);
    this.bubbles.set(message.id, { anchor, panel, expiresAt: message.expiresAt });
    panel.getBoundingClientRect();
    panel.classList.add('is-visible');
  }

  public update(local: { x: number; y: number }, positions: Map<string, { x: number; y: number }>): void {
    this.place(this.composer, local);
    const now = Date.now();
    for (const [id, bubble] of this.bubbles) {
      if (now >= bubble.expiresAt + 220) { bubble.anchor.remove(); this.bubbles.delete(id); continue; }
      const position = positions.get(id);
      if (!position || position.x < 0 || position.x > this.root.clientWidth
        || position.y < 0 || position.y > this.root.clientHeight) {
        bubble.anchor.hidden = true;
        continue;
      }
      bubble.anchor.hidden = false;
      bubble.anchor.style.left = `${position.x}px`;
      bubble.anchor.style.top = `${position.y}px`;
      if (now >= bubble.expiresAt) {
        bubble.panel.classList.remove('is-visible');
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
