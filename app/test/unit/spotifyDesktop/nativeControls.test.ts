// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlaybackInteractionBridge } from '@/components/app/playback/bridges/usePlaybackInteractionBridge';
import { usePlaybackQueueController } from '@/components/app/playback/start/usePlaybackQueueController';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useAudioSettingsStore } from '@/stores/useAudioSettingsStore';
import { useExternalPlaybackStore } from '@/components/app/externalPlayback/useExternalPlaybackStore';
import { PlayerState, type SongResult } from '@/types';

// Native queue controls change Spotify's booleans; local queue preferences remain separate.
const env = vi.hoisted(() => ({ native: true, command: vi.fn(), claim: vi.fn(), start: vi.fn() }));
vi.mock('@/components/app/externalPlayback/externalPlaybackRuntime', () => ({
    usesExternalQueue: () => env.native, commandCurrentExternal: (...args: unknown[]) => env.command(...args),
    ownsExternalQueue: () => !env.native, claimAppQueue: () => env.claim(), readExternalPlaybackTime: () => 0,
    startExternalSong: (...args: unknown[]) => env.start(...args), prepareLocalPlayback: async () => {},
}));
vi.mock('@/services/onlinePlayback', () => ({ loadOnlineSongLyrics: async () => {} }));
const song = { id: 'b'.repeat(22), name: 'Track', artists: [], album: { id: '', name: '' }, durationMs: 120000, sourceRef: { kind: 'online', providerId: 'spotify', mediaId: 'b'.repeat(22) } } as SongResult;
let root: Root;
let host: HTMLDivElement;
let interaction: ReturnType<typeof usePlaybackInteractionBridge>;
let queue: ReturnType<typeof usePlaybackQueueController>;
beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    env.native = true; env.command.mockReset().mockResolvedValue({ currentSong: { ...song, id: 'c'.repeat(22), sourceRef: { kind: 'online', providerId: 'spotify', mediaId: 'c'.repeat(22) } } }); env.claim.mockReset();
    env.start.mockReset().mockImplementation(async track => ({ currentSong: track, durationMs: 120000, positionMs: 0, state: 'playing' }));
    usePlaybackStore.setState({ currentSong: song, playQueue: [], audioSrc: null, activePlaybackContext: 'main', playerState: PlayerState.PAUSED, isFmMode: false });
    useAudioSettingsStore.setState({ loopMode: 'one' });
    useExternalPlaybackStore.setState({ shuffle: false, repeat: false, context: null });
    host = document.body.appendChild(document.createElement('div')); root = createRoot(host);
    function Harness() {
        interaction = usePlaybackInteractionBridge({ stageActiveEntryKind: null, isNowPlayingStageActive: false, audioRef: { current: null },
            stageLyricsClockRef: { current: { startTimeSec: 0, endTimeSec: 120, baseTimeSec: 0, startedAtMs: null } },
            cyclePlayerChromeVisibilityMode: () => {}, handleNextTrack: () => {}, handlePrevTrack: () => {}, navigateBackFromPlayer: () => {},
            pausePlayback: () => {}, resumePlayback: async () => {}, syncStageLyricsClock: () => {} });
        queue = usePlaybackQueueController({ localSongs: [], localLibraryCatalog: {}, isNowPlayingStageActive: false,
            audioRef: { current: null }, shouldAutoPlayRef: { current: true }, playbackAutoSkipCountRef: { current: 0 },
            blobUrlRef: { current: null }, pendingResumeTimeRef: { current: null }, lastAudioRecoverySourceRef: { current: null },
            currentOnlineAudioUrlFetchedAtRef: { current: null }, mainPlaybackSnapshotRef: { current: null },
            setIsLyricsLoading: () => {}, setLyrics: () => {}, persistLastPlaybackCache: async () => {}, navigateToPlaybackView: () => {},
            restoreCachedThemeForSong: async () => {}, interruptStagePlaybackForMainTransition: () => {},
        } as never);
        return null;
    }
    act(() => root.render(React.createElement(Harness)));
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
describe('native repeat and shuffle', () => {
    it('toggles only native repeat off/all without changing the app loop preference', () => {
        act(() => interaction.toggleLoop());
        expect(env.command).toHaveBeenLastCalledWith('repeat', true);
        useExternalPlaybackStore.setState({ repeat: true });
        act(() => interaction.toggleLoop());
        expect(env.command).toHaveBeenLastCalledWith('repeat', false);
        expect(useAudioSettingsStore.getState().loopMode).toBe('one');
    });
    it('enables native shuffle, advances and plays even when the app queue is empty', async () => {
        await act(async () => { await queue.shuffleQueue(); });
        expect(env.command.mock.calls).toEqual([['shuffle', true], ['next'], ['play']]);
        env.command.mockClear();
        useExternalPlaybackStore.setState({ shuffle: true });
        await act(async () => { await queue.shuffleQueue(); });
        expect(env.command.mock.calls).toEqual([['shuffle', true], ['next'], ['play']]);
        expect(usePlaybackStore.getState().playQueue).toEqual([]);
        expect(env.claim).not.toHaveBeenCalled();
    });
    it('never selects an unrelated saved app song while shuffling a native collection', async () => {
        const stale = { ...song, id: 'z'.repeat(22), name: 'Unrelated saved song', sourceRef: { kind: 'online' as const, providerId: 'spotify', mediaId: 'z'.repeat(22) } };
        const saved = [stale];
        const context = { providerId: 'spotify', type: 'playlist', id: 'a'.repeat(22) } as const;
        act(() => {
            usePlaybackStore.setState({ playQueue: saved });
            useExternalPlaybackStore.setState({ context });
        });
        await act(async () => { await queue.shuffleQueue(); });
        expect(env.start).not.toHaveBeenCalled();
        expect(env.command.mock.calls).toEqual([['shuffle', true], ['next'], ['play']]);
        expect(usePlaybackStore.getState().playQueue).toBe(saved);
        expect(useExternalPlaybackStore.getState().context).toEqual(context);
        expect(env.claim).not.toHaveBeenCalled();
    });
    it('plays the acknowledged native recording when shuffle cannot advance', async () => {
        env.command.mockResolvedValue({ currentSong: song });
        await act(async () => { await queue.shuffleQueue(); });
        expect(env.command.mock.calls).toEqual([['shuffle', true], ['next'], ['play']]);
        expect(env.start).not.toHaveBeenCalled();
    });
    it('shuffles the full app queue, preserves duplicates and starts a different recording', async () => {
        env.native = false;
        const b = { ...song, id: 'c'.repeat(22), name: 'B', sourceRef: { kind: 'online' as const, providerId: 'spotify', mediaId: 'c'.repeat(22) } };
        const c = { ...song, id: 'd'.repeat(22), name: 'C', sourceRef: { kind: 'online' as const, providerId: 'spotify', mediaId: 'd'.repeat(22) } };
        const original = [song, b, b, c];
        vi.spyOn(Math, 'random').mockReturnValue(.99);
        act(() => usePlaybackStore.setState({ playQueue: original }));
        await act(async () => { await queue.shuffleQueue(); });
        expect(usePlaybackStore.getState().playQueue.map(track => track.id).sort()).toEqual(original.map(track => track.id).sort());
        expect(usePlaybackStore.getState().currentSong?.id).not.toBe(song.id);
        expect(usePlaybackStore.getState().playerState).toBe(PlayerState.PLAYING);
        expect(env.start).toHaveBeenCalledOnce();
        expect(env.claim).toHaveBeenCalledOnce();
        vi.restoreAllMocks();
    });
    it('preserves native collection ownership without choosing from the app snapshot', async () => {
        const alternative = { ...song, id: 'c'.repeat(22), sourceRef: { kind: 'online' as const, providerId: 'spotify', mediaId: 'c'.repeat(22) } };
        const context = { providerId: 'spotify', type: 'playlist', id: 'a'.repeat(22) } as const;
        act(() => {
            usePlaybackStore.setState({ playQueue: [song, alternative] });
            useExternalPlaybackStore.setState({ context });
        });
        await act(async () => { await queue.shuffleQueue(); });
        expect(env.command.mock.calls).toEqual([['shuffle', true], ['next'], ['play']]);
        expect(env.start).not.toHaveBeenCalled();
        expect(useExternalPlaybackStore.getState().context).toEqual(context);
        expect(env.claim).not.toHaveBeenCalled();
    });
    it('keeps the app loop behavior for local or app-owned queues', () => {
        env.native = false;
        act(() => interaction.toggleLoop());
        expect(useAudioSettingsStore.getState().loopMode).toBe('off');
        expect(env.command).not.toHaveBeenCalled();
    });
});


describe('selection from the current queue', () => {
    it.each(['live', 'display-copy'])('retains verified context for a %s queue selection', async kind => {
        const other = { ...song, id: 'c'.repeat(22), sourceRef: { kind: 'online' as const, providerId: 'spotify', mediaId: 'c'.repeat(22) } };
        const tracks = [song, other];
        const context = { providerId: 'spotify', type: 'playlist', id: 'a'.repeat(22) } as const;
        act(() => { usePlaybackStore.setState({ playQueue: tracks }); useExternalPlaybackStore.setState({ context }); });
        await act(async () => { await queue.playSong(other, kind === 'live' ? tracks : tracks.map(track => ({ ...track }))); });
        expect(env.start).toHaveBeenCalledWith(other, expect.any(Function), context);
    });
    it.each(['unknown', 'filtered', 'mixed'])('does not infer native context for %s queues', async kind => {
        const other = { ...song, id: 'c'.repeat(22), sourceRef: { kind: 'online' as const, providerId: 'spotify', mediaId: 'c'.repeat(22) } };
        const tracks = kind === 'mixed' ? [song, { ...other, sourceRef: { kind: 'online' as const, providerId: 'netease', mediaId: '123' } }] : [song, other];
        act(() => { usePlaybackStore.setState({ playQueue: tracks }); useExternalPlaybackStore.setState({ context: kind === 'unknown' ? null : { providerId: 'spotify', type: 'playlist', id: 'a'.repeat(22) } }); });
        await act(async () => { await queue.playSong(song, kind === 'filtered' ? [song] : tracks); });
        expect(env.start).toHaveBeenCalledWith(song, expect.any(Function), undefined);
    });
});
