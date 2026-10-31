import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedSong } from '@/types';
import type { ExternalPlaybackSnapshot } from '@/types/onlineMusic';

const env = vi.hoisted(() => ({ song: null as UnifiedSong | null, queue: [] as UnifiedSong[], play: vi.fn(), command: vi.fn(), read: vi.fn() }));
vi.mock('@/stores/usePlaybackStore', () => ({ usePlaybackStore: { getState: () => ({ currentSong: env.song, playQueue: env.queue }) } }));
vi.mock('@/services/onlineMusic/omni', () => ({ omni: {
    hasExternalPlayback: (song: UnifiedSong) => song.sourceRef.kind === 'online',
    playExternalSong: (...args: unknown[]) => env.play(...args),
    commandExternalPlayback: (...args: unknown[]) => env.command(...args),
    getExternalPlaybackSnapshot: (...args: unknown[]) => env.read(...args),
} }));
const song = (id: string): UnifiedSong => ({ id, name: id, artists: [], album: { id: '', name: '' }, durationMs: 120000, sourceRef: { kind: 'online', providerId: 'spotify', mediaId: id } });
const sample = (track: UnifiedSong, state: 'playing' | 'paused' = 'playing'): ExternalPlaybackSnapshot => ({ availability: 'ready', currentSong: track, state, positionMs: 1000, durationMs: 120000, volume: 1, shuffle: false, repeat: false, observedAt: Date.now() });
beforeEach(() => { vi.resetModules(); env.song = song('a'); env.queue = [env.song, song('b')]; env.play.mockReset().mockImplementation(async track => sample(track)); env.command.mockReset().mockImplementation(async track => sample(track, 'paused')); env.read.mockReset(); });

describe('shared external playback runtime', () => {
    it('adopts the paused Spotify recording when the selected source is Spotify', async () => {
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        const published = vi.fn();
        runtime.attachExternalPlaybackRuntime({ pauseLocal: () => {}, onSnapshot: published });
        const actual = sample(song('b'), 'paused');
        await runtime.observeExternalPlayback(actual);
        expect(published).toHaveBeenCalledWith(actual, true);
    });

    it('does not adopt paused Spotify over a locally selected source', async () => {
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        const published = vi.fn();
        runtime.attachExternalPlaybackRuntime({ pauseLocal: () => {}, onSnapshot: published });
        env.song = { ...song('local'), sourceRef: { kind: 'local', mediaId: 'local' } };
        await runtime.observeExternalPlayback(sample(song('b'), 'paused'));
        expect(published).not.toHaveBeenCalled();
    });

    it('adopts paused Spotify when no song is selected', async () => {
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        const published = vi.fn();
        runtime.attachExternalPlaybackRuntime({ pauseLocal: () => {}, onSnapshot: published });
        env.song = null;
        const actual = sample(song('b'), 'paused');
        await runtime.observeExternalPlayback(actual);
        expect(published).toHaveBeenCalledWith(actual, true);
    });

    it('does not reclaim a paused Spotify source after a local handoff', async () => {
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        const pauseLocal = vi.fn(); const published = vi.fn();
        runtime.attachExternalPlaybackRuntime({ pauseLocal, onSnapshot: published });
        await runtime.startExternalSong(env.song!, () => true);
        await runtime.prepareLocalPlayback();
        pauseLocal.mockClear();
        await runtime.observeExternalPlayback(sample(env.song!, 'paused'));
        expect(pauseLocal).not.toHaveBeenCalled();
        expect(published).not.toHaveBeenCalled();
    });
    it('shows immediate pending feedback and clears it only after native acknowledgement', async () => {
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        const { useStatusMessageStore } = await import('@/stores/useStatusMessageStore');
        await runtime.startExternalSong(env.song!, () => true);
        let finish!: (value: ExternalPlaybackSnapshot) => void;
        env.command.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const command = runtime.commandCurrentExternal('pause');
        expect(useStatusMessageStore.getState().message?.type).toBe('info');
        await new Promise(resolve => setImmediate(resolve));
        expect(useStatusMessageStore.getState().message).not.toBeNull();
        finish(sample(env.song!, 'paused'));
        await command;
        expect(useStatusMessageStore.getState().message).toBeNull();
    });

    it('preserves another toast when a pending native command completes', async () => {
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        const { useStatusMessageStore } = await import('@/stores/useStatusMessageStore');
        await runtime.startExternalSong(env.song!, () => true);
        let finish!: (value: ExternalPlaybackSnapshot) => void;
        env.command.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const command = runtime.commandCurrentExternal('pause');
        await new Promise(resolve => setImmediate(resolve));
        const other = { type: 'success' as const, text: 'Saved a visual setting' };
        useStatusMessageStore.getState().setMessage(other);
        finish(sample(env.song!, 'paused'));
        await command;
        expect(useStatusMessageStore.getState().message).toBe(other);
    });

    it('reports a current native failure without publishing its raw response', async () => {
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        const { useStatusMessageStore } = await import('@/stores/useStatusMessageStore');
        await runtime.startExternalSong(env.song!, () => true);
        env.command.mockRejectedValueOnce(new Error('private backend detail'));
        await expect(runtime.commandCurrentExternal('pause')).rejects.toThrow('private backend detail');
        expect(useStatusMessageStore.getState().message?.type).toBe('error');
        expect(useStatusMessageStore.getState().message?.text).not.toContain('private backend detail');
    });

    it('clears pending feedback on a source change and ignores the old failure', async () => {
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        const { useStatusMessageStore } = await import('@/stores/useStatusMessageStore');
        await runtime.startExternalSong(env.song!, () => true);
        let fail!: (error: Error) => void;
        env.command.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
        const command = runtime.commandCurrentExternal('pause').catch(error => error);
        await new Promise(resolve => setImmediate(resolve));
        expect(useStatusMessageStore.getState().message?.type).toBe('info');
        env.song = song('b');
        const change = runtime.startExternalSong(env.song, () => true);
        expect(useStatusMessageStore.getState().message).toBeNull();
        fail(new Error('old failure'));
        await command;
        await change;
        expect(useStatusMessageStore.getState().message).toBeNull();
    });

    it('keeps the known playing clock moving while a native observation is delayed', async () => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
        try {
            const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
            await runtime.startExternalSong(env.song!, () => true);
            now.mockReturnValue(11000);
            expect(runtime.readExternalPlaybackTime()).toBe(11);
            now.mockReturnValue(200000);
            expect(runtime.readExternalPlaybackTime()).toBe(120);
            await runtime.observeExternalPlayback({ ...sample(env.song!, 'paused'), positionMs: 4000 });
            now.mockReturnValue(210000);
            expect(runtime.readExternalPlaybackTime()).toBe(4);
            await runtime.observeExternalPlayback({ ...sample(env.song!), availability: 'error', currentSong: null, state: 'stopped' });
            expect(runtime.readExternalPlaybackTime()).toBeNull();
        } finally { now.mockRestore(); }
    });
    it('starts explicit collection playback in the native queue and follows its modes', async () => {
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        const context = { providerId: 'spotify' as const, type: 'playlist' as const, id: 'playlist' };
        await runtime.startExternalSong(env.song!, () => true, context);
        expect(env.play).toHaveBeenCalledWith(env.song, context);
        expect(runtime.ownsExternalQueue()).toBe(false);
        const { useExternalPlaybackStore } = await import('@/components/app/externalPlayback/useExternalPlaybackStore');
        expect(useExternalPlaybackStore.getState().context).toEqual(context);
        await runtime.observeExternalPlayback({ ...sample(env.song!), shuffle: true, repeat: true });
        expect(useExternalPlaybackStore.getState()).toMatchObject({ context, shuffle: true, repeat: true });
    });

    it('keeps collection context for its tracks and releases it when another native recording takes over', async () => {
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        const context = { providerId: 'spotify' as const, type: 'playlist' as const, id: 'playlist' };
        await runtime.startExternalSong(env.song!, () => true, context);
        const { useExternalPlaybackStore } = await import('@/components/app/externalPlayback/useExternalPlaybackStore');
        await runtime.observeExternalPlayback(sample(song('b')));
        expect(useExternalPlaybackStore.getState().context).toEqual(context);
        await runtime.observeExternalPlayback(sample(song('c')));
        expect(useExternalPlaybackStore.getState().context).toBeNull();
    });

    it('leaves native collection context when the app queue is explicitly edited', async () => {
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        await runtime.startExternalSong(env.song!, () => true, { providerId: 'spotify', type: 'album', id: 'album' });
        runtime.claimAppQueue();
        expect(runtime.ownsExternalQueue()).toBe(true);
        const { useExternalPlaybackStore } = await import('@/components/app/externalPlayback/useExternalPlaybackStore');
        expect(useExternalPlaybackStore.getState().context).toBeNull();
    });

    it('does not restore a collection context over a queue edit made during native startup', async () => {
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        let finish!: (snapshot: ExternalPlaybackSnapshot) => void;
        env.play.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const start = runtime.startExternalSong(env.song!, () => true, { providerId: 'spotify', type: 'playlist', id: 'playlist' });
        await new Promise(resolve => setImmediate(resolve));
        runtime.claimAppQueue();
        finish(sample(env.song!));
        await start;
        expect(runtime.ownsExternalQueue()).toBe(true);
        const { useExternalPlaybackStore } = await import('@/components/app/externalPlayback/useExternalPlaybackStore');
        expect(useExternalPlaybackStore.getState().context).toBeNull();
    });

    it('preserves an app queue claim made while a native Next command is pending', async () => {
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        await runtime.startExternalSong(env.song!, () => true, { providerId: 'spotify', type: 'playlist', id: 'playlist' });
        let finish!: (snapshot: ExternalPlaybackSnapshot) => void;
        env.command.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const next = runtime.commandCurrentExternal('next');
        await new Promise(resolve => setImmediate(resolve));
        runtime.claimAppQueue();
        finish(sample(song('b')));
        await next;
        expect(runtime.ownsExternalQueue()).toBe(true);
    });

    it('preserves an app queue claim made while an outside observation settles', async () => {
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        await runtime.startExternalSong(env.song!, () => true, { providerId: 'spotify', type: 'playlist', id: 'playlist' });
        const observation = runtime.observeExternalPlayback(sample(song('b')));
        runtime.claimAppQueue();
        await observation;
        expect(runtime.ownsExternalQueue()).toBe(true);
    });

    it('clears native context after a local handoff', async () => {
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        await runtime.startExternalSong(env.song!, () => true, { providerId: 'spotify', type: 'playlist', id: 'playlist' });
        await runtime.prepareLocalPlayback();
        const { useExternalPlaybackStore } = await import('@/components/app/externalPlayback/useExternalPlaybackStore');
        expect(useExternalPlaybackStore.getState()).toMatchObject({ context: null, shuffle: false, repeat: false });
    });
    it('publishes rapid seek intents before the native acknowledgement', async () => {
        env.play.mockImplementation(async track => ({ ...sample(track, 'paused'), positionMs: 2800 }));
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        const { currentTime } = await import('@/stores/motionSignals');
        currentTime.set(2.8);
        const onSnapshot = vi.fn();
        runtime.attachExternalPlaybackRuntime({ pauseLocal: () => {}, onSnapshot });
        await runtime.startExternalSong(env.song!, () => true);
        const finishes: Array<(snapshot: ExternalPlaybackSnapshot) => void> = [];
        env.command.mockImplementation(() => new Promise(resolve => { finishes.push(resolve); }));
        const first = runtime.commandCurrentExternal('seek', 0);
        expect(currentTime.get()).toBe(0);
        expect(runtime.readExternalPlaybackTime()).toBe(0);
        const second = runtime.commandCurrentExternal('seek', (currentTime.get() + 5) * 1000);
        expect(currentTime.get()).toBe(5);
        expect(runtime.readExternalPlaybackTime()).toBe(5);
        await new Promise(resolve => setImmediate(resolve));
        expect(env.command.mock.calls.map(call => call.slice(1))).toEqual([['seek', 5000]]);
        finishes[0]({ ...sample(env.song!, 'paused'), positionMs: 5000 });
        await Promise.all([first, second]);
        expect(runtime.readExternalPlaybackTime()).toBe(5);
        expect(onSnapshot).toHaveBeenCalledOnce();
    });

    it.each([[-1000, 0], [999000, 120000]])('clamps seek %i to %i before publishing it', async (requested, expected) => {
        env.play.mockImplementation(async track => sample(track, 'paused'));
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        const { currentTime } = await import('@/stores/motionSignals');
        await runtime.startExternalSong(env.song!, () => true);
        env.command.mockImplementation(async track => ({ ...sample(track, 'paused'), positionMs: expected }));
        const seek = runtime.commandCurrentExternal('seek', requested);
        expect(currentTime.get()).toBe(expected / 1000);
        expect(runtime.readExternalPlaybackTime()).toBe(expected / 1000);
        await seek;
        expect(env.command).toHaveBeenCalledWith(env.song, 'seek', expected);
    });

    it('restores the previous clock when the latest seek fails', async () => {
        env.play.mockImplementation(async track => ({ ...sample(track, 'paused'), positionMs: 2800 }));
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        const { currentTime } = await import('@/stores/motionSignals');
        await runtime.startExternalSong(env.song!, () => true);
        env.command.mockRejectedValueOnce(new Error('native seek failed'));
        const seek = runtime.commandCurrentExternal('seek', 30000);
        const failure = expect(seek).rejects.toThrow('native seek failed');
        expect(currentTime.get()).toBe(30);
        await failure;
        expect(runtime.readExternalPlaybackTime()).toBe(2.8);
        expect(currentTime.get()).toBe(2.8);
    });

    it('restores the acknowledged clock when coalesced seeks fail', async () => {
        env.play.mockImplementation(async track => ({ ...sample(track, 'paused'), positionMs: 2800 }));
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        const { currentTime } = await import('@/stores/motionSignals');
        await runtime.startExternalSong(env.song!, () => true);
        env.command.mockRejectedValueOnce(new Error('native seek failed'));
        const first = runtime.commandCurrentExternal('seek', 30000);
        const second = runtime.commandCurrentExternal('seek', 60000);
        expect(currentTime.get()).toBe(60);
        const results = await Promise.allSettled([first, second]);
        expect(results.map(result => result.status)).toEqual(['rejected', 'rejected']);
        expect(env.command.mock.calls.map(call => call.slice(1))).toEqual([['seek', 60000]]);
        expect(runtime.readExternalPlaybackTime()).toBe(2.8);
        expect(currentTime.get()).toBe(2.8);
    });

    it('rolls a failed newer seek back to an acknowledged in-flight seek', async () => {
        env.play.mockImplementation(async track => ({ ...sample(track, 'paused'), positionMs: 2800 }));
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        const { currentTime } = await import('@/stores/motionSignals');
        await runtime.startExternalSong(env.song!, () => true);
        let finishFirst!: (snapshot: ExternalPlaybackSnapshot) => void;
        env.command.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }))
            .mockRejectedValueOnce(new Error('new seek failed'));
        const first = runtime.commandCurrentExternal('seek', 30000);
        await new Promise(resolve => setImmediate(resolve));
        const second = runtime.commandCurrentExternal('seek', 60000);
        const failure = expect(second).rejects.toThrow('new seek failed');
        finishFirst({ ...sample(env.song!, 'paused'), positionMs: 30000 });
        await first;
        await failure;
        expect(runtime.readExternalPlaybackTime()).toBe(30);
        expect(currentTime.get()).toBe(30);
    });

    it('does not roll back a newer seek when an older one fails', async () => {
        env.play.mockImplementation(async track => sample(track, 'paused'));
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        const { currentTime } = await import('@/stores/motionSignals');
        await runtime.startExternalSong(env.song!, () => true);
        let rejectFirst!: (error: Error) => void;
        let finishSecond!: (snapshot: ExternalPlaybackSnapshot) => void;
        env.command.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject; }))
            .mockImplementationOnce(() => new Promise(resolve => { finishSecond = resolve; }));
        const first = runtime.commandCurrentExternal('seek', 0).catch(error => error);
        await new Promise(resolve => setImmediate(resolve));
        const second = runtime.commandCurrentExternal('seek', 5000);
        rejectFirst(new Error('old seek failed'));
        await first;
        await new Promise(resolve => setImmediate(resolve));
        expect(currentTime.get()).toBe(5);
        expect(runtime.readExternalPlaybackTime()).toBe(5);
        finishSecond({ ...sample(env.song!, 'paused'), positionMs: 5000 });
        await second;
    });

    it('does not echo an observed volume back to the desktop player', async () => {
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        let followed = false;
        runtime.attachExternalPlaybackRuntime({ pauseLocal: () => {}, onSnapshot: async next => {
            if (followed) return;
            followed = true;
            await runtime.commandCurrentExternal('volume', next.volume);
        } });
        await runtime.startExternalSong(env.song!, () => true);
        await runtime.observeExternalPlayback({ ...sample(env.song!), volume: .37 });
        expect(env.command).not.toHaveBeenCalled();
    });

    it('does not drop a volume reversal while another volume command is pending', async () => {
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        runtime.attachExternalPlaybackRuntime({ pauseLocal: () => {}, onSnapshot: () => {} });
        await runtime.startExternalSong(env.song!, () => true);
        let finish!: (value: ExternalPlaybackSnapshot) => void;
        env.command.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const first = runtime.commandCurrentExternal('volume', .2);
        await new Promise(resolve => setImmediate(resolve));
        const reversal = runtime.commandCurrentExternal('volume', 1);
        finish({ ...sample(env.song!), volume: .2 });
        await Promise.all([first, reversal]);
        expect(env.command.mock.calls.map(call => call.slice(1))).toEqual([['volume', .2], ['volume', 1]]);
    });

    it('adopts a command result before publishing the new recording clock', async () => {
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        const onSnapshot = vi.fn(); runtime.attachExternalPlaybackRuntime({ pauseLocal: () => {}, onSnapshot });
        await runtime.startExternalSong(env.song!, () => true);
        const changed = sample(song('b'), 'paused');
        env.command.mockResolvedValue(changed);
        await runtime.commandCurrentExternal('next');
        expect(onSnapshot).toHaveBeenCalledWith(changed, true);
        expect(runtime.ownsExternalQueue()).toBe(false);
    });
    it('rejects a poll started before the switch to local audio', async () => {
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        const pauseLocal = vi.fn(); const onSnapshot = vi.fn();
        runtime.attachExternalPlaybackRuntime({ pauseLocal, onSnapshot });
        await runtime.startExternalSong(env.song!, () => true);
        const oldRevision = runtime.getExternalIntentRevision();
        const oldPoll = sample(env.song!);
        await runtime.prepareLocalPlayback();
        pauseLocal.mockClear();
        await runtime.observeExternalPlayback(oldPoll, oldRevision);
        expect(pauseLocal).not.toHaveBeenCalled();
        expect(onSnapshot).not.toHaveBeenCalled();
    });

    it('does not publish a delayed command after selecting another song', async () => {
        const runtime = await import('@/components/app/externalPlayback/externalPlaybackRuntime');
        const onSnapshot = vi.fn(); runtime.attachExternalPlaybackRuntime({ pauseLocal: () => {}, onSnapshot });
        await runtime.startExternalSong(env.song!, () => true);
        let finish!: (value: ExternalPlaybackSnapshot) => void;
        const oldSong = env.song!;
        env.command.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const command = runtime.commandCurrentExternal('play');
        await new Promise(resolve => setImmediate(resolve));
        env.song = song('b');
        const change = runtime.startExternalSong(env.song, () => true);
        finish(sample(oldSong));
        expect(await command).toBeNull();
        await change;
        expect(onSnapshot).not.toHaveBeenCalled();
    });
});
