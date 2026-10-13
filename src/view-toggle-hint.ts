const seenKey = 'crisply2404-view-toggle-used';

export class ViewToggleHint {
  private readonly hint = document.createElement('div');
  private readonly listeners = new AbortController();
  private frame = 0;

  public constructor(button: HTMLButtonElement) {
    if (localStorage.getItem(seenKey) === '1') return;
    this.hint.className = 'view-toggle-hint';
    this.hint.textContent = 'Switch to webpage view';
    this.hint.setAttribute('role', 'status');
    button.parentElement!.append(this.hint);
    this.hint.getBoundingClientRect();
    this.frame = requestAnimationFrame(() => this.hint.classList.add('is-visible'));
    button.addEventListener('click', () => localStorage.setItem(seenKey, '1'), { signal: this.listeners.signal });
  }

  public destroy(): void {
    cancelAnimationFrame(this.frame);
    this.listeners.abort();
    this.hint.remove();
  }
}
