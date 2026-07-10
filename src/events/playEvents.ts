import type { PlayEvent, PlayEventListener } from '../types/events';

let listeners: PlayEventListener[] = [];

export function onPlayEvent(listener: PlayEventListener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

export function emitPlayEvent(event: PlayEvent): void {
  listeners.forEach(l => l(event));
}

export function clearPlayEventListeners(): void {
  listeners = [];
}
