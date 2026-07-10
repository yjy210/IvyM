import type { PlayEvent, PlayEventListener } from '../types/events';

let listeners: PlayEventListener[] = [];

export function onPlayEvent(listener: PlayEventListener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

export function emitPlayEvent(event: PlayEvent): void {
  console.log('[PLAY_TRACE] emitPlayEvent:', event.type, 'message:', event.message, 'listeners:', listeners.length);
  listeners.forEach(l => l(event));
}

export function clearPlayEventListeners(): void {
  listeners = [];
}
