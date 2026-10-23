import { ipcRenderer } from 'electron';

const channel = 'openhiatus:activity-overlay-resize';

/** This isolated preload exposes no app API, files, tokens or generic IPC to the page. */
window.addEventListener('DOMContentLoaded', () => {
  const handle = document.getElementById('resize');
  if (!handle) return;
  let pointer: number | undefined;
  let over = false;
  const hover = (value: boolean) => { if (over === value) return; over = value; ipcRenderer.send(channel, { phase: 'hover', over }); };
  const position = (phase: 'start' | 'move' | 'end' | 'cancel', event: PointerEvent) => ipcRenderer.send(channel, { phase, pointerId: event.pointerId, y: event.screenY });
  const release = () => {
    const captured = pointer; pointer = undefined;
    if (captured !== undefined && handle.hasPointerCapture(captured)) handle.releasePointerCapture(captured);
  };
  document.addEventListener('openhiatus:activity-overlay-reset', () => { release(); hover(false); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { release(); hover(false); } });
  const isOver = (event: MouseEvent) => {
    const rect = handle.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  };
  // Electron forwards mousemove while the passive part is click-through.
  window.addEventListener('mousemove', event => {
    if (pointer !== undefined) return;
    hover(isOver(event));
  });
  document.addEventListener('mouseleave', () => { if (pointer === undefined) hover(false); });
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointer !== undefined) return;
    event.preventDefault();
    try { handle.setPointerCapture(event.pointerId); } catch { return; }
    pointer = event.pointerId; position('start', event);
  });
  handle.addEventListener('pointermove', event => { if (pointer === event.pointerId) position('move', event); });
  const finish = (phase: 'end' | 'cancel', event: PointerEvent) => {
    if (pointer !== event.pointerId) return;
    position(phase, event); release(); hover(phase === 'end' && isOver(event));
  };
  handle.addEventListener('pointerup', event => finish('end', event));
  handle.addEventListener('pointercancel', event => finish('cancel', event));
  handle.addEventListener('lostpointercapture', event => { if (pointer === event.pointerId) finish('cancel', event); });
  handle.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); ipcRenderer.send(channel, { phase: 'key', key: event.key });
  });
});
