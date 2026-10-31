import { describe, expect, it, vi } from 'vitest';
import { buildPlaybackCommandContext, type PlaybackCommandContextDeps } from '@/components/app/command-palette-context/buildAppOwnedCommandContext';
import { getQueueSongMatches } from '@/components/command-palette/queueSongMatches';
import type { CommandPaletteContext } from '@/components/command-palette/types';
import type { SongResult } from '@/types';

// An unknown native queue is also read-only after restarting or selecting music in Spotify.
vi.mock('@/components/app/externalPlayback/externalPlaybackRuntime', () => ({ usesExternalQueue: () => true, claimAppQueue: vi.fn() }));
describe('native queue command capabilities', () => {
    it('does not replace native playback by executing a read-only queue row', async () => {
        const playSong = vi.fn();
        const song = { id: 'a', name: 'Current', artists: [], album: { id: '', name: '' }, durationMs: 1000 } as SongResult;
        const context = { shared: { t: (key: string) => key, currentSong: song }, playback: { queue: [song], queueReadOnly: true, playSong } } as unknown as CommandPaletteContext;
        const command = getQueueSongMatches('', context)[0].command;
        expect(await command.execute('', context)).toBe(false);
        expect(playSong).not.toHaveBeenCalled();
    });
    it('allows native shuffle and prevents edits to the app snapshot', () => {
        const clearQueue = vi.fn();
        const removeQueueSong = vi.fn();
        const moveQueueSongToNext = vi.fn();
        const moveQueueSongToEnd = vi.fn();
        const applyQueueBatchOperation = vi.fn(() => true);
        const playback = buildPlaybackCommandContext({ queue: [], isFmMode: false, clearQueue, removeQueueSong, moveQueueSongToNext, moveQueueSongToEnd, applyQueueBatchOperation } as unknown as PlaybackCommandContextDeps);
        expect(playback.canShuffle).toBe(true);
        expect(playback.queueReadOnly).toBe(true);
        playback.clearQueue(); playback.removeQueueSong(0); playback.moveQueueSongToNext(0); playback.moveQueueSongToEnd(0);
        expect(playback.applyQueueBatchOperation('remove', [0])).toBe(false);
        for (const action of [clearQueue, removeQueueSong, moveQueueSongToNext, moveQueueSongToEnd, applyQueueBatchOperation]) expect(action).not.toHaveBeenCalled();
    });
});
