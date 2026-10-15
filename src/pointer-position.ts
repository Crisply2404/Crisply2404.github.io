export let pointerPosition: { x: number; y: number } | undefined;

function rememberPointer(event: PointerEvent): void {
  if (event.pointerType === 'touch') { pointerPosition = undefined; return; }
  pointerPosition = { x: event.clientX, y: event.clientY };
}
window.addEventListener('pointermove', rememberPointer, { passive: true });
window.addEventListener('pointerover', rememberPointer, { passive: true });
document.addEventListener('pointerleave', () => { pointerPosition = undefined; });
