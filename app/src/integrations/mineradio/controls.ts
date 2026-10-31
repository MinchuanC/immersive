import type { StageCommand, StageMetadata, StageTrack } from './stageBridge';

// Shared transport geometry, independent of either donor's playback implementation.
export function dockProgress(time: number, duration: number) {
    return Number.isFinite(time) && Number.isFinite(duration) && duration > 0 ? Math.max(0, Math.min(1, time / duration)) : 0;
}
export function seekFromPointer(clientX: number, bounds: { left: number; width: number }, duration: number): number | null {
    if (!Number.isFinite(duration) || duration <= 0 || bounds.width <= 0) return null;
    return Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)) * duration;
}
export function homeContinueAction(metadata: StageMetadata | undefined, queue: StageTrack[], paused: boolean): StageCommand {
    if (metadata?.title) return { action: paused ? 'playPause' : 'openPlayer' };
    if (queue.length) return { action: 'selectTrack', value: queue[0].id };
    return { action: 'openFiles' };
}
