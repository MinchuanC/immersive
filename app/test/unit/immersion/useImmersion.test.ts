// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalSong, SongResult } from '../../../src/types';
import type { EditionCue, PersonalEdition } from '../../../src/types/immersion';
import type { PlaybackNavigationOptions } from '../../../src/types/appPlayback';

vi.hoisted(() => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key), clear: () => values.clear(),
    } });
});
vi.mock('../../../src/services/immersion/songScore', () => ({
    loadSongScore: vi.fn(async () => null),
    evaluateSongScore: vi.fn(() => null),
}));
vi.mock('../../../src/services/immersion/personalEditions', () => ({
    getPersonalEdition: vi.fn(async () => null),
    saveEditionCue: vi.fn(), deleteEditionCue: vi.fn(), evaluateEditionRecipe: vi.fn(() => null),
}));
const spotifyPages = vi.hoisted(() => vi.fn());
vi.mock('../../../src/services/onlineMusic/spotify/spotifyCatalog', () => ({
    spotifyCatalog: { getAlbumTracks: spotifyPages }, clearSpotifyCatalogCache: vi.fn(), spotifyPlaylistTracks: vi.fn(),
}));

const { useImmersion } = await import('../../../src/components/app/immersion/useImmersion');
const { buildUnifiedLocalSong } = await import('../../../src/services/playbackAdapters');
const { usePlaybackStore } = await import('../../../src/stores/usePlaybackStore');
const { useVisualizerSettingsStore } = await import('../../../src/stores/useVisualizerSettingsStore');
const { useAudioSettingsStore } = await import('../../../src/stores/useAudioSettingsStore');
const { useAutomixSettingsStore } = await import('../../../src/stores/useAutomixSettingsStore');
const { saveEditionCue } = await import('../../../src/services/immersion/personalEditions');
const { loadSongScore } = await import('../../../src/services/immersion/songScore');
const { PlayerState } = await import('../../../src/types');
const { currentTime } = await import('../../../src/stores/motionSignals');
const { useSpotifyPlaybackModeStore } = await import('../../../src/services/onlineMusic/spotify/spotifyPlaybackMode');
const initialTuning = { ...useVisualizerSettingsStore.getState().mineradioBackgroundTuning };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const localSongs: LocalSong[] = ['one', 'two'].map((id, index) => ({
    id, title: id, titleOrigin: 'import', fileName: `${id}.flac`, filePath: `/music/${id}.flac`,
    importedMetadata: { title: id, titleSource: 'embedded', artistNames: [], albumName: 'Release' },
    duration: 120_000, fileSize: 1024, mimeType: 'audio/flac', addedAt: 1, trackNumber: index + 1,
}));
const songs = localSongs.map(localSong => buildUnifiedLocalSong({ localSong, matchedSong: null, coverUrl: null, preferOnlineMetadata: false }));
const catalog = {
    entities: [{ id: 'album', kind: 'album' as const, displayName: 'Release', aliases: [], normalizedAliases: [], createdAt: 1, updatedAt: 1 }],
    assignments: localSongs.map(song => ({ songId: song.id, albumEntityId: 'album', albumOrigin: 'import' as const, artistEntityIds: [], artistOrigin: 'import' as const, updatedAt: 1 })),
};
let root: Root | null = null;
let model: ReturnType<typeof useImmersion>;
const seek = vi.fn();
const onOpenPlayer = vi.fn();
const playSong = vi.fn(async (song: SongResult, queue?: SongResult[], _fm?: boolean, _options?: PlaybackNavigationOptions) => {
    usePlaybackStore.setState({ currentSong: song, ...(queue ? { playQueue: queue } : {}) });
});

const mount = async (options: { displaySong?: SongResult; isMediaReady?: () => boolean } = {}) => {
    function Probe() {
        const song = usePlaybackStore(state => state.currentSong);
        model = useImmersion({ song: options.displaySong ?? song, localSongs, catalog, playSong, seek, isMediaReady: options.isMediaReady ?? (() => true), onOpenPlayer });
        return null;
    }
    root = createRoot(document.createElement('div'));
    await act(async () => { root!.render(React.createElement(Probe)); });
};

beforeEach(() => {
    vi.clearAllMocks();
    currentTime.set(0);
    vi.mocked(saveEditionCue).mockReset().mockImplementation(async (albumKey, albumName, cue) => ({
        version: 1, scoreVersion: 1, id: albumKey, albumKey, albumName, updatedAt: 1, cues: [cue],
    }));
    usePlaybackStore.setState({ currentSong: songs[0], playQueue: [songs[0]], audioSrc: null, playerState: PlayerState.PAUSED });
    useAudioSettingsStore.setState({ loopMode: 'all' });
    useAutomixSettingsStore.setState({ automixEnabled: true });
    useVisualizerSettingsStore.setState({ visualizerBackgroundMode: null, mineradioBackgroundTuning: { ...initialTuning, preset: 0 } });
    useSpotifyPlaybackModeStore.setState({ active: 'desktop', desired: 'desktop' });
});
afterEach(() => {
    act(() => root?.unmount());
    root = null;
    vi.useRealTimers();
});

describe('immersion playback integration', () => {
    const spotifyAlbumId = 'a'.repeat(22);
    const spotifySongs: SongResult[] = ['first', 'second'].map(id => ({
        id, name: id, artists: [], durationMs: 120_000,
        album: { id: spotifyAlbumId, name: 'Spotify Album', catalogRef: { providerId: 'spotify', kind: 'album', id: spotifyAlbumId } },
        sourceRef: { kind: 'online', providerId: 'spotify', mediaId: id },
    }));

    it('plays a complete Spotify album in order through the acknowledged immersive audio queue', async () => {
        useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
        usePlaybackStore.setState({ currentSong: spotifySongs[1], playQueue: [spotifySongs[1]] });
        spotifyPages.mockResolvedValue({ items: spotifySongs, total: 2, nextOffset: 2, hasMore: false });
        await mount();
        await act(async () => { model.setOpen(true); });
        expect(model.selectedAlbum?.name).toBe('Spotify Album');
        await act(async () => { await model.startJourney(); });
        expect(playSong).toHaveBeenCalledWith(spotifySongs[0], spotifySongs, false, expect.objectContaining({ signal: expect.any(AbortSignal) }));
        expect(model.journey).toMatchObject({ state: 'running', index: -1 });
        act(() => model.onPlaying(spotifySongs[0]));
        act(() => { usePlaybackStore.setState({ currentSong: spotifySongs[1] }); model.onPlaying(spotifySongs[1]); });
        let handled = false;
        act(() => { handled = model.onEnded(spotifySongs[1]); });
        expect(handled).toBe(true);
        expect(model.journey?.state).toBe('completed');
    });

    it('starts an album-seeded Score only after each Spotify chapter is acknowledged', async () => {
        useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
        usePlaybackStore.setState({ currentSong: spotifySongs[1], audioSrc: 'folia-spotify://audio/second?k=old' });
        spotifyPages.mockResolvedValue({ items: spotifySongs, total: 2, nextOffset: 2, hasMore: false });
        await mount();
        await act(async () => { model.setOpen(true); });
        await act(async () => { await model.startJourney(); });
        expect(model.scoreEnabled).toBe(true);
        expect(model.scoreWaiting).toBe(true);
        expect(loadSongScore).not.toHaveBeenCalled();
        await act(async () => { usePlaybackStore.setState({ audioSrc: 'folia-spotify://audio/first?k=1' }); model.onPlaying(spotifySongs[0]); });
        expect(loadSongScore).toHaveBeenCalledWith(spotifySongs[0], `spotify:album:${spotifyAlbumId}`, expect.objectContaining({ audioSrc: 'folia-spotify://audio/first?k=1' }));
        vi.mocked(loadSongScore).mockClear();
        await act(async () => { usePlaybackStore.setState({ currentSong: spotifySongs[1], audioSrc: 'folia-spotify://audio/second?k=2' }); });
        expect(loadSongScore).not.toHaveBeenCalled();
        await act(async () => { model.onPlaying(spotifySongs[1]); });
        expect(loadSongScore).toHaveBeenCalledWith(spotifySongs[1], `spotify:album:${spotifyAlbumId}`, expect.objectContaining({ audioSrc: 'folia-spotify://audio/second?k=2' }));
    });

    it('does not restart a Spotify journey Score after a manual visual change', async () => {
        useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
        usePlaybackStore.setState({ currentSong: spotifySongs[0] });
        spotifyPages.mockResolvedValue({ items: spotifySongs, total: 2, nextOffset: 2, hasMore: false });
        await mount();
        await act(async () => { model.setOpen(true); });
        await act(async () => { await model.startJourney(); });
        act(() => model.onPlaying(spotifySongs[0]));
        act(() => useVisualizerSettingsStore.getState().handleSetMineradioBackgroundTuning({ intensity: .42 }));
        expect(model.scoreEnabled).toBe(false);
        vi.mocked(loadSongScore).mockClear();
        await act(async () => { usePlaybackStore.setState({ currentSong: spotifySongs[1], audioSrc: 'folia-spotify://audio/second?k=2' }); model.onPlaying(spotifySongs[1]); });
        expect(model.scoreEnabled).toBe(false);
        expect(loadSongScore).not.toHaveBeenCalled();
    });

    it('does not offer Spotify journeys when Spotify Desktop owns playback', async () => {
        usePlaybackStore.setState({ currentSong: spotifySongs[0] });
        await mount();
        await act(async () => { model.setOpen(true); });
        expect(spotifyPages).not.toHaveBeenCalled();
        expect(model.albums.some(album => album.name === 'Spotify Album')).toBe(false);
    });

    it('keeps immersive score and online journeys unavailable for a provider without the capability', async () => {
        const unsupported: SongResult = { ...spotifySongs[0], sourceRef: { kind: 'online', providerId: 'qq', mediaId: 'first' } };
        usePlaybackStore.setState({ currentSong: unsupported });
        await mount();
        await act(async () => { model.setOpen(true); });
        expect(model.scoreSupported).toBe(false);
        expect(model.onlineAlbumKey).toBeNull();
        expect(spotifyPages).not.toHaveBeenCalled();
        expect(model.albums.some(album => album.name === 'Spotify Album')).toBe(false);
    });

    it('analyses only the acknowledged immersive Spotify stream and aborts on track change', async () => {
        useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
        usePlaybackStore.setState({ currentSong: spotifySongs[0], audioSrc: 'folia-spotify://audio/first?k=test' });
        vi.mocked(loadSongScore).mockImplementationOnce(() => new Promise(() => {}));
        await mount();
        act(() => model.startScore());
        expect(model.scoreSupported).toBe(true);
        expect(loadSongScore).toHaveBeenCalledWith(spotifySongs[0], undefined, expect.objectContaining({ audioSrc: 'folia-spotify://audio/first?k=test', signal: expect.any(AbortSignal) }));
        const signal = vi.mocked(loadSongScore).mock.calls[0][2]!.signal!;
        act(() => usePlaybackStore.setState({ currentSong: spotifySongs[1], audioSrc: null }));
        expect(signal.aborted).toBe(true);
    });

    it('waits for media acknowledgment and stops applying an old score on a source change', async () => {
        useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
        usePlaybackStore.setState({ currentSong: spotifySongs[0], audioSrc: 'folia-spotify://audio/first?k=1' });
        const ready = vi.fn(() => false);
        await mount({ isMediaReady: ready });
        act(() => model.startScore());
        expect(model.scoreWaiting).toBe(true);
        expect(loadSongScore).not.toHaveBeenCalled();
        ready.mockReturnValue(true);
        await act(async () => { model.onPlaying(spotifySongs[0]); });
        expect(model.scoreWaiting).toBe(false);
        expect(loadSongScore).toHaveBeenCalledWith(spotifySongs[0], undefined, expect.objectContaining({ audioSrc: 'folia-spotify://audio/first?k=1' }));
        vi.mocked(loadSongScore).mockClear();
        ready.mockReturnValue(false);
        await act(async () => { usePlaybackStore.setState({ audioSrc: 'folia-spotify://audio/first?k=2' }); });
        expect(loadSongScore).not.toHaveBeenCalled();
        ready.mockReturnValue(true);
        await act(async () => { model.onPlaying(spotifySongs[0]); });
        expect(loadSongScore).toHaveBeenCalledWith(spotifySongs[0], undefined, expect.objectContaining({ audioSrc: 'folia-spotify://audio/first?k=2' }));
    });

    it('keeps Sonnet selected until Immersive Lyrics is explicitly opened', async () => {
        useVisualizerSettingsStore.setState({ visualizerMode: 'sonnet' });
        await mount();
        expect(useVisualizerSettingsStore.getState().visualizerMode).toBe('sonnet');
        act(() => model.openImmersiveLyrics());
        expect(useVisualizerSettingsStore.getState().visualizerMode).toBe('immersive-lyrics');
        expect(onOpenPlayer).toHaveBeenCalledOnce();
    });

    it('interrupts a Spotify journey if playback ownership switches to Desktop', async () => {
        useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
        usePlaybackStore.setState({ currentSong: spotifySongs[0] });
        spotifyPages.mockResolvedValue({ items: spotifySongs, total: 2, nextOffset: 2, hasMore: false });
        await mount();
        await act(async () => { model.setOpen(true); });
        await act(async () => { await model.startJourney(); });
        act(() => model.onPlaying(spotifySongs[0]));
        act(() => useSpotifyPlaybackModeStore.setState({ active: 'desktop', desired: 'desktop' }));
        expect(model.journey?.state).toBe('interrupted');
        expect(useAudioSettingsStore.getState().loopMode).toBe('all');
    });

    it('does not start a Spotify journey after ownership changes before the click is handled', async () => {
        useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
        usePlaybackStore.setState({ currentSong: spotifySongs[0] });
        spotifyPages.mockResolvedValue({ items: spotifySongs, total: 2, nextOffset: 2, hasMore: false });
        await mount();
        await act(async () => { model.setOpen(true); });
        await act(async () => {
            useSpotifyPlaybackModeStore.setState({ active: 'desktop', desired: 'desktop' });
            await model.startJourney();
        });
        expect(playSong).not.toHaveBeenCalled();
    });

    it('does not start a stale Spotify album after the current song changes', async () => {
        useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
        usePlaybackStore.setState({ currentSong: spotifySongs[0] });
        spotifyPages.mockResolvedValue({ items: spotifySongs, total: 2, nextOffset: 2, hasMore: false });
        await mount();
        await act(async () => { model.setOpen(true); });
        const otherId = 'b'.repeat(22);
        const other = { ...spotifySongs[0], album: { id: otherId, name: 'Other', catalogRef: { providerId: 'spotify' as const, kind: 'album' as const, id: otherId } } };
        await act(async () => {
            usePlaybackStore.setState({ currentSong: other });
            await model.startJourney();
        });
        expect(playSong).not.toHaveBeenCalled();
        expect(model.journey).toBeNull();
    });

    it('interrupts an unacknowledged Spotify journey and restores playback settings', async () => {
        vi.useFakeTimers();
        useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
        usePlaybackStore.setState({ currentSong: spotifySongs[0] });
        spotifyPages.mockResolvedValue({ items: spotifySongs, total: 2, nextOffset: 2, hasMore: false });
        playSong.mockImplementationOnce(async () => {});
        await mount();
        await act(async () => { model.setOpen(true); });
        await act(async () => { await model.startJourney(); });
        expect(model.journey).toMatchObject({ state: 'running', index: -1 });
        await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
        expect(model.journey?.state).toBe('interrupted');
        expect(model.busy).toBe(false);
        expect(model.error).toBe(true);
        expect(useAudioSettingsStore.getState().loopMode).toBe('all');
        expect(useAutomixSettingsStore.getState().automixEnabled).toBe(true);
        act(() => model.onPlaying(spotifySongs[0]));
        expect(model.journey?.state).toBe('interrupted');
    });

    it('cancels a pending Spotify journey play when leaving without replacing the queue later', async () => {
        useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
        usePlaybackStore.setState({ currentSong: spotifySongs[1], playQueue: [spotifySongs[1]] });
        spotifyPages.mockResolvedValue({ items: spotifySongs, total: 2, nextOffset: 2, hasMore: false });
        let finish!: () => void;
        playSong.mockImplementationOnce(async (song, queue, _fm, options) => {
            await new Promise<void>(resolve => { finish = resolve; });
            if (!options?.signal?.aborted) usePlaybackStore.setState({ currentSong: song, playQueue: queue ?? [] });
        });
        await mount();
        await act(async () => { model.setOpen(true); });
        let pending!: Promise<void> | undefined;
        act(() => { pending = model.startJourney(); });
        act(() => model.leaveJourney());
        await act(async () => { finish(); await pending; });
        expect(usePlaybackStore.getState().currentSong).toBe(spotifySongs[1]);
        expect(usePlaybackStore.getState().playQueue).toEqual([spotifySongs[1]]);
        expect(model.journey).toBeNull();
    });

    it('cancels a pending journey play if a different recording is acknowledged first', async () => {
        useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
        usePlaybackStore.setState({ currentSong: spotifySongs[1], playQueue: [spotifySongs[1]] });
        spotifyPages.mockResolvedValue({ items: spotifySongs, total: 2, nextOffset: 2, hasMore: false });
        let finish!: () => void;
        let signal!: AbortSignal;
        playSong.mockImplementationOnce(async (song, queue, _fm, options) => {
            signal = options!.signal!;
            await new Promise<void>(resolve => { finish = resolve; });
            if (!signal.aborted) usePlaybackStore.setState({ currentSong: song, playQueue: queue ?? [] });
        });
        await mount();
        await act(async () => { model.setOpen(true); });
        let pending!: Promise<void> | undefined;
        act(() => { pending = model.startJourney(); });
        act(() => model.onPlaying(spotifySongs[1]));
        expect(model.journey?.state).toBe('interrupted');
        expect(signal.aborted).toBe(true);
        await act(async () => { finish(); await pending; });
        expect(usePlaybackStore.getState().currentSong).toBe(spotifySongs[1]);
        expect(usePlaybackStore.getState().playQueue).toEqual([spotifySongs[1]]);
    });

    it('does not start a journey when the Spotify album is incomplete', async () => {
        useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
        usePlaybackStore.setState({ currentSong: spotifySongs[0] });
        spotifyPages.mockResolvedValue({ items: [spotifySongs[0]], total: 2, nextOffset: 2, hasMore: false });
        await mount();
        await act(async () => { model.setOpen(true); });
        expect(model.onlineAlbumError).toBe(true);
        expect(model.selectedAlbum).toBeUndefined();
        await act(async () => { await model.startJourney(); });
        expect(playSong).not.toHaveBeenCalled();
    });

    it('ignores an old album response when the playing album changes', async () => {
        useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
        usePlaybackStore.setState({ currentSong: spotifySongs[0] });
        let finish!: (page: unknown) => void;
        spotifyPages.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const otherId = 'b'.repeat(22);
        const other = { ...spotifySongs[0], id: 'other', name: 'other', album: { id: otherId, name: 'Other', catalogRef: { providerId: 'spotify' as const, kind: 'album' as const, id: otherId } }, sourceRef: { kind: 'online' as const, providerId: 'spotify' as const, mediaId: 'other' } };
        spotifyPages.mockResolvedValueOnce({ items: [other], total: 1, nextOffset: 1, hasMore: false });
        await mount();
        act(() => model.setOpen(true));
        await act(async () => { usePlaybackStore.setState({ currentSong: other }); });
        await act(async () => { finish({ items: spotifySongs, total: 2, nextOffset: 2, hasMore: false }); });
        expect(model.selectedAlbum?.name).toBe('Other');
    });

    it('does not complete from an ended event after Spotify ownership has changed', async () => {
        useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
        usePlaybackStore.setState({ currentSong: spotifySongs[0] });
        spotifyPages.mockResolvedValue({ items: spotifySongs, total: 2, nextOffset: 2, hasMore: false });
        await mount();
        await act(async () => { model.setOpen(true); await Promise.resolve(); });
        await act(async () => { await model.startJourney(); });
        act(() => model.onPlaying(spotifySongs[0]));
        act(() => { usePlaybackStore.setState({ currentSong: spotifySongs[1] }); model.onPlaying(spotifySongs[1]); });
        let handled = true;
        act(() => {
            useSpotifyPlaybackModeStore.setState({ active: 'desktop', desired: 'desktop' });
            handled = model.onEnded(spotifySongs[1]);
        });
        expect(handled).toBe(false);
        expect(model.journey?.state).toBe('interrupted');
    });
    it('waits for actual playback before acknowledging the first chapter', async () => {
        await mount();
        await act(async () => { await model.startJourney(); });
        expect(model.journey).toMatchObject({ state: 'running', index: -1 });
        expect(useAudioSettingsStore.getState().loopMode).toBe('off');
        expect(useAutomixSettingsStore.getState().automixEnabled).toBe(false);

        act(() => model.onPlaying(songs[0]));
        expect(model.journey).toMatchObject({ state: 'running', index: 0 });
    });

    it('completes only after the acknowledged final chapter ends, then restores journey settings', async () => {
        await mount();
        await act(async () => { await model.startJourney(); });
        expect(model.onEnded(songs[1])).toBe(false);
        act(() => model.onPlaying(songs[0]));
        act(() => { usePlaybackStore.setState({ currentSong: songs[1], playerState: PlayerState.PLAYING }); });
        expect(model.onEnded(songs[1])).toBe(false);
        act(() => model.onPlaying(songs[1]));
        let handled = false;
        act(() => { handled = model.onEnded(songs[1]); });

        expect(handled).toBe(true);
        expect(model.journey?.state).toBe('completed');
        expect(usePlaybackStore.getState().playerState).toBe(PlayerState.PAUSED);
        expect(useAudioSettingsStore.getState().loopMode).toBe('all');
        expect(useAutomixSettingsStore.getState().automixEnabled).toBe(true);
        expect(model.onEnded(songs[1])).toBe(false);
    });

    it.each(['loop', 'automix'])('interrupts a journey when the listener changes %s settings', async setting => {
        await mount();
        await act(async () => { await model.startJourney(); });
        act(() => model.onPlaying(songs[0]));
        act(() => {
            if (setting === 'loop') useAudioSettingsStore.getState().handleSetLoopMode('one');
            else useAutomixSettingsStore.getState().handleToggleAutomix(true);
        });
        expect(model.journey).toMatchObject({ state: 'interrupted', index: 0 });
        expect(useAudioSettingsStore.getState().loopMode).toBe(setting === 'loop' ? 'one' : 'all');
        expect(useAutomixSettingsStore.getState().automixEnabled).toBe(true);
    });

    it.each([false, true])('leaves a pending journey without resurrection after its play settles (rejects: %s)', async rejects => {
        await mount();
        let finishPlay!: () => void;
        let failPlay!: (error: Error) => void;
        playSong.mockImplementationOnce(() => new Promise<void>((resolve, reject) => { finishPlay = resolve; failPlay = reject; }));
        let starting!: Promise<void> | undefined;
        act(() => { starting = model.startJourney(); });
        expect(model.busy).toBe(true);
        act(() => model.leaveJourney());
        expect(model.journey).toBeNull();
        expect(model.busy).toBe(false);
        expect(model.scoreEnabled).toBe(false);
        expect(useAudioSettingsStore.getState().loopMode).toBe('all');
        expect(useAutomixSettingsStore.getState().automixEnabled).toBe(true);
        await act(async () => {
            usePlaybackStore.setState({ currentSong: songs[1] });
            if (rejects) failPlay(new Error('The abandoned play failed'));
            else finishPlay();
            await starting;
        });
        expect(model.journey).toBeNull();
        expect(model.busy).toBe(false);
        expect(model.error).toBe(false);
    });

    it('defers a cross-track bookmark seek until its recording is acknowledged, once', async () => {
        await mount();
        const cue: EditionCue = { id: 'bookmark', kind: 'bookmark', trackKey: 'local:two', atSec: 42, label: 'Moment' };
        await act(async () => { await model.replay(cue); });
        expect(seek).not.toHaveBeenCalled();
        expect(model.takePendingSeek(songs[0])).toBeNull();
        expect(model.takePendingSeek(songs[1])).toBe(42);
        expect(model.takePendingSeek(songs[1])).toBeNull();
    });

    it('defers replay on the same recording until its media has metadata', async () => {
        const isMediaReady = vi.fn(() => false);
        await mount({ isMediaReady });
        await act(async () => { await model.replay({ id: 'bookmark', kind: 'bookmark', trackKey: 'local:one', atSec: 42, label: 'Moment' }); });
        expect(isMediaReady).toHaveBeenCalledOnce();
        expect(seek).not.toHaveBeenCalled();
        expect(playSong).toHaveBeenCalledWith(songs[0]);
        expect(model.takePendingSeek(songs[0])).toBe(42);
        expect(model.takePendingSeek(songs[0])).toBeNull();
    });

    it('discards a bookmark seek after the listener chooses another track', async () => {
        await mount();
        await act(async () => { await model.replay({ id: 'bookmark', kind: 'bookmark', trackKey: 'local:two', atSec: 42, label: 'Moment' }); });
        act(() => usePlaybackStore.setState({ currentSong: songs[0] }));
        act(() => usePlaybackStore.setState({ currentSong: songs[1] }));
        expect(model.takePendingSeek(songs[1])).toBeNull();
    });

    it('lets a manual tuning change stop direction without later restoring over that choice', async () => {
        await mount();
        act(() => model.startScore());
        expect(model.scoreEnabled).toBe(true);
        act(() => useVisualizerSettingsStore.getState().handleSetMineradioBackgroundTuning({ intensity: .42 }));
        expect(model.scoreEnabled).toBe(false);
        expect(model.editionEnabled).toBe(false);
        act(() => model.stopVisuals());
        expect(useVisualizerSettingsStore.getState().mineradioBackgroundTuning.intensity).toBe(.42);
    });

    it('does not persist a look or change the scene outside the Sonic family', async () => {
        useVisualizerSettingsStore.setState({ visualizerBackgroundMode: 'mineradio', mineradioBackgroundTuning: { ...initialTuning, preset: 2 } });
        await mount();
        const before = useVisualizerSettingsStore.getState().mineradioBackgroundTuning;
        expect(model.canKeepLook).toBe(false);
        await act(async () => {
            await model.save('look');
            await model.save('look', -.15);
            await model.save('look', .15);
        });
        expect(saveEditionCue).not.toHaveBeenCalled();
        expect(useVisualizerSettingsStore.getState().mineradioBackgroundTuning).toBe(before);
        expect(useVisualizerSettingsStore.getState().visualizerBackgroundMode).toBe('mineradio');
        expect(model.editionEnabled).toBe(false);
    });

    it('still persists a bookmark outside the Sonic family without changing the scene', async () => {
        await mount();
        const before = useVisualizerSettingsStore.getState().mineradioBackgroundTuning;
        expect(model.canKeepLook).toBe(false);
        await act(async () => { await model.save('bookmark'); });
        expect(saveEditionCue).toHaveBeenCalledOnce();
        expect(vi.mocked(saveEditionCue).mock.calls[0][2]).toMatchObject({ kind: 'bookmark', trackKey: 'local:one' });
        expect(model.saved).toBe(true);
        expect(model.editionEnabled).toBe(false);
        expect(useVisualizerSettingsStore.getState().mineradioBackgroundTuning).toBe(before);
        expect(useVisualizerSettingsStore.getState().visualizerBackgroundMode).toBeNull();
    });

    it('saves the heard outgoing recording and its clock while the store names the incoming track', async () => {
        usePlaybackStore.setState({ currentSong: songs[1], playQueue: songs, playerState: PlayerState.PLAYING });
        currentTime.set(96);
        await mount({ displaySong: songs[0] });
        await act(async () => { await model.save('bookmark'); });
        expect(vi.mocked(saveEditionCue).mock.calls[0][2]).toMatchObject({ kind: 'bookmark', trackKey: 'local:one', atSec: 96, label: 'one' });
        expect(model.saved).toBe(true);
        expect(model.edition?.cues[0]).toMatchObject({ trackKey: 'local:one', atSec: 96 });
        expect(usePlaybackStore.getState().currentSong).toBe(songs[1]);
    });

    it('keeps a manual visual choice made while a saved look is being persisted', async () => {
        await mount();
        let finishSave!: (edition: PersonalEdition) => void;
        vi.mocked(saveEditionCue).mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve; }));
        act(() => model.startScore());
        let saving!: Promise<void>;
        act(() => { saving = model.save('look'); });
        act(() => useVisualizerSettingsStore.getState().handleSetMineradioBackgroundTuning({ intensity: .42 }));
        await act(async () => {
            finishSave({ version: 1, scoreVersion: 1, id: 'album', albumKey: 'album', albumName: 'Release', updatedAt: 1, cues: [vi.mocked(saveEditionCue).mock.calls[0][2]] });
            await saving;
        });
        expect(model.saved).toBe(true);
        expect(model.editionEnabled).toBe(false);
        expect(useVisualizerSettingsStore.getState().mineradioBackgroundTuning.intensity).toBe(.42);
    });
});
