import { describe, expect, it, vi } from 'vitest';
import { normalizeDesktopSnapshot } from '@/services/onlineMusic/spotify/spotifyDesktopPlayback';
import { createExternalPlaybackOwnership } from '@/components/app/externalPlayback/externalPlaybackOwnership';
import type { UnifiedSong } from '@/types';
import type { ExternalPlaybackSnapshot } from '@/types/onlineMusic';

// Native metadata and cross-source transitions are tested without launching Spotify.
const id = 'a'.repeat(22);
const song: UnifiedSong = { id, name: 'Song', artists: [], album: { id: '', name: '', coverUrl: '' }, durationMs: 180000, sourceRef: { kind: 'online', providerId: 'spotify', mediaId: id } };
const snapshot: ExternalPlaybackSnapshot = { availability: 'ready', state: 'playing', positionMs: 1000, durationMs: 180000, volume: .5, shuffle: false, repeat: false, observedAt: 5000, currentSong: song };

describe('external playback boundary', () => {
    it('normalizes native metadata into a shared song without inventing catalog references', () => {
        const result = normalizeDesktopSnapshot({ availability: 'ready', state: 'playing', positionMs: 1200, volume: .75, observedAt: 5000, track: { uri: `spotify:track:${id}`, title: 'Song', artist: 'Artist', album: 'Album', artworkUrl: 'https://i.scdn.co/image/test', durationMs: 180000 } });
        expect(result.currentSong).toMatchObject({ name: 'Song', artists: [{ name: 'Artist' }], durationMs: 180000, sourceRef: song.sourceRef });
        expect(result.currentSong?.album.catalogRef).toBeUndefined();
        expect(result.positionMs).toBe(1200);
    });

    it('pauses local playback before starting the external track', async () => {
        const calls: string[] = [];
        const ownership = createExternalPlaybackOwnership({
            pauseLocal: async () => { calls.push('pause-local'); },
            playExternal: async () => { calls.push('play-external'); return snapshot; },
            commandExternal: async () => snapshot,
        });
        await ownership.playExternal(song);
        expect(calls).toEqual(['pause-local', 'play-external']);
        expect(ownership.owner()).toBe('external');
    });

    it('does not adopt an observation superseded while local pause is pending', async () => {
        let current = true;
        let resume!: () => void;
        const ownership = createExternalPlaybackOwnership({
            pauseLocal: () => new Promise<void>(resolve => { resume = resolve; }),
            playExternal: async () => snapshot,
            commandExternal: async () => snapshot,
        });
        const observation = ownership.observe(snapshot, () => current);
        await new Promise(resolve => setImmediate(resolve));
        current = false;
        resume();
        expect(await observation).toBe(false);
        expect(ownership.owner()).toBe('local');
    });

    it('confirms external pause before allowing local playback', async () => {
        const startLocal = vi.fn();
        const ownership = createExternalPlaybackOwnership({ pauseLocal: async () => {}, playExternal: async () => snapshot, commandExternal: async () => snapshot });
        await ownership.playExternal(song);
        await expect(ownership.playLocal(startLocal)).rejects.toThrow('pause');
        expect(startLocal).not.toHaveBeenCalled();
    });

    it('does not command the previous external source again after a successful local handoff', async () => {
        const commandExternal = vi.fn().mockResolvedValue({ ...snapshot, state: 'paused' });
        const ownership = createExternalPlaybackOwnership({ pauseLocal: () => {}, playExternal: async () => snapshot, commandExternal });
        await ownership.playExternal(song);
        await ownership.playLocal(() => {});
        await ownership.playLocal(() => {});
        expect(commandExternal).toHaveBeenCalledTimes(1);
    });

    it('serializes competing switches and reports external track changes once', async () => {
        const calls: string[] = [];
        const ownership = createExternalPlaybackOwnership({ pauseLocal: async () => { calls.push('pause-local'); }, playExternal: async () => snapshot,
            commandExternal: async () => { calls.push('pause-external'); return { ...snapshot, state: 'paused' }; } });
        await ownership.playExternal(song);
        await ownership.playLocal(async () => { calls.push('play-local'); });
        expect(calls).toEqual(['pause-local', 'pause-external', 'play-local']);
        const adopted = await ownership.observe(snapshot);
        expect(adopted).toBe(true);
        expect(ownership.owner()).toBe('external');
        expect(calls.at(-1)).toBe('pause-local');
        expect(await ownership.observe(snapshot)).toBe(false);
        expect(await ownership.observe({ ...snapshot, currentSong: { ...song, id: 'b'.repeat(22), sourceRef: { kind: 'online', providerId: 'spotify', mediaId: 'b'.repeat(22) } } })).toBe(true);
    });

    it('orders transport commands behind source ownership changes', async () => {
        const calls: string[] = [];
        let finishPlay!: () => void;
        const ownership = createExternalPlaybackOwnership({ pauseLocal: () => {}, playExternal: async () => snapshot,
            commandExternal: async (_song, action) => {
                calls.push(action);
                if (action === 'play') await new Promise<void>(resolve => { finishPlay = resolve; });
                return { ...snapshot, state: action === 'pause' ? 'paused' : 'playing' };
            } });
        await ownership.playExternal(song);
        const play = ownership.command(song, 'play');
        const pause = ownership.command(song, 'pause');
        await new Promise(resolve => setImmediate(resolve));
        expect(calls).toEqual(['play']);
        finishPlay();
        await play;
        expect((await pause).state).toBe('paused');
        expect(calls).toEqual(['play', 'pause']);
    });

    it.each(['volume', 'seek'] as const)('keeps only the latest queued %s before a pause', async action => {
        const calls: Array<[string, number | boolean | undefined]> = [];
        const finishes: Array<(value: ExternalPlaybackSnapshot) => void> = [];
        const ownership = createExternalPlaybackOwnership({ pauseLocal: () => {}, playExternal: async () => snapshot,
            commandExternal: async (_song, action, value) => {
                calls.push([action, value]);
                if (action === 'volume' || action === 'seek') return new Promise(resolve => { finishes.push(resolve); });
                return { ...snapshot, state: 'paused' };
            } });
        const first = ownership.command(song, action, .1);
        await new Promise(resolve => setImmediate(resolve));
        const changes = Array.from({ length: 100 }, (_, index) => ownership.command(song, action, (index + 1) / 100));
        const pause = ownership.command(song, 'pause');
        expect(calls).toEqual([[action, .1]]);
        finishes[0]({ ...snapshot, volume: .1, positionMs: .1 });
        await new Promise(resolve => setImmediate(resolve));
        expect(calls).toEqual([[action, .1], [action, 1]]);
        finishes[1]({ ...snapshot, volume: 1, positionMs: 1 });
        expect((await pause).state).toBe('paused');
        expect(calls).toEqual([[action, .1], [action, 1], ['pause', undefined]]);
        expect((await Promise.all(changes)).every(result => (action === 'volume' ? result.volume : result.positionMs) === 1)).toBe(true);
        await first;
    });

    it.each(['volume', 'seek'] as const)('keeps transport and song changes as %s coalescing boundaries', async action => {
        const calls: Array<[string, string, number | boolean | undefined]> = [];
        const otherSong = { ...song, id: 'b'.repeat(22), sourceRef: { kind: 'online' as const, providerId: 'spotify', mediaId: 'b'.repeat(22) } };
        const ownership = createExternalPlaybackOwnership({ pauseLocal: () => {}, playExternal: async () => snapshot,
            commandExternal: async (target, action, value) => {
                calls.push([String(target.id), action, value]);
                return snapshot;
            } });
        await Promise.all([
            ownership.command(song, action, .2),
            ownership.command(song, 'pause'),
            ownership.command(song, action, .3),
            ownership.command(otherSong, action, .4),
        ]);
        expect(calls).toEqual([[song.id, action, .2], [song.id, 'pause', undefined], [song.id, action, .3], [otherSong.id, action, .4]]);
    });

    it('does not merge a seek with an intervening volume adjustment', async () => {
        const calls: Array<[string, number | boolean | undefined]> = [];
        const ownership = createExternalPlaybackOwnership({ pauseLocal: () => {}, playExternal: async () => snapshot,
            commandExternal: async (_song, action, value) => { calls.push([action, value]); return snapshot; } });
        await Promise.all([ownership.command(song, 'seek', 10000), ownership.command(song, 'volume', .5), ownership.command(song, 'seek', 20000)]);
        expect(calls).toEqual([['seek', 10000], ['volume', .5], ['seek', 20000]]);
    });

    it('keeps source handoffs as seek coalescing boundaries', async () => {
        const calls: string[] = [];
        const ownership = createExternalPlaybackOwnership({
            pauseLocal: () => { calls.push('pause-local'); },
            playExternal: async () => { calls.push('play-external'); return snapshot; },
            commandExternal: async (_song, action, value) => { calls.push(`${action}:${value}`); return snapshot; },
        });
        await Promise.all([
            ownership.command(song, 'seek', 10000),
            ownership.playLocal(() => { calls.push('play-local'); }),
            ownership.command(song, 'seek', 20000),
            ownership.playExternal(song),
            ownership.command(song, 'seek', 30000),
        ]);
        expect(calls).toEqual(['seek:10000', 'play-local', 'seek:20000', 'pause-local', 'play-external', 'seek:30000']);
    });

    it.each(['volume', 'seek'] as const)('rejects coalesced %s failures without poisoning later transport', async action => {
        const commandExternal = vi.fn().mockRejectedValueOnce(new Error('native volume failed')).mockResolvedValue({ ...snapshot, state: 'paused' });
        const ownership = createExternalPlaybackOwnership({ pauseLocal: () => {}, playExternal: async () => snapshot, commandExternal });
        const first = ownership.command(song, action, .2);
        const latest = ownership.command(song, action, .8);
        const failures = await Promise.allSettled([first, latest]);
        expect(failures.map(result => result.status)).toEqual(['rejected', 'rejected']);
        expect(failures.map(result => result.status === 'rejected' && result.reason.message)).toEqual(['native volume failed', 'native volume failed']);
        expect(commandExternal).toHaveBeenCalledTimes(1);
        expect(commandExternal).toHaveBeenLastCalledWith(song, action, .8);
        expect((await ownership.command(song, 'pause')).state).toBe('paused');
    });
});
