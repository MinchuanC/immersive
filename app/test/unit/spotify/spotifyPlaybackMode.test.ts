import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSpotifyPlaybackModeStore } from '@/services/onlineMusic/spotify/spotifyPlaybackMode';
import { activateSpotifyPlaybackModeForSelection, stopSpotifyEmbeddedPlayback } from '@/components/app/externalPlayback/spotify/spotifyPlaybackHandoff';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { PlayerState } from '@/types';
import { startPlay } from '@/components/app/playback/currentSong';

const handoff = vi.hoisted(() => vi.fn());
const stopLocal = vi.hoisted(() => vi.fn());
const revision = vi.hoisted(() => ({ current: 0 }));
const desktop = vi.hoisted(() => ({ snapshot: vi.fn(), command: vi.fn() }));
vi.mock('@/components/app/externalPlayback/externalPlaybackRuntime', () => ({ prepareLocalPlayback: handoff, stopOwnedLocalPlayback: stopLocal, getExternalIntentRevision: () => revision.current }));
vi.mock('@/services/onlineMusic/spotify/spotifyDesktopPlayback', () => ({ spotifyDesktopPlayback: desktop }));

beforeEach(() => { handoff.mockResolvedValue(true); desktop.snapshot.mockResolvedValue({ availability: 'not-running', state: 'stopped' }); });

afterEach(() => {
    useSpotifyPlaybackModeStore.setState({ active: 'desktop', desired: 'desktop' });
    handoff.mockReset();
    stopLocal.mockReset();
    revision.current = 0;
    desktop.snapshot.mockReset().mockResolvedValue({ availability: 'not-running', state: 'stopped' });
    desktop.command.mockReset();
    usePlaybackStore.setState({ currentSong: null, audioSrc: null, playerState: PlayerState.IDLE });
});

describe('Spotify playback mode', () => {
    it('prefers immersive playback at startup without claiming an active desktop session', () => {
        expect(useSpotifyPlaybackModeStore.getState()).toMatchObject({ active: 'desktop', desired: 'embedded' });
    });

    it('keeps the current owner until a Spotify selection is made', async () => {
        useSpotifyPlaybackModeStore.getState().setDesired('embedded');
        expect(useSpotifyPlaybackModeStore.getState()).toMatchObject({ active: 'desktop', desired: 'embedded' });
        expect(await activateSpotifyPlaybackModeForSelection(false, () => true)).toBe(true);
        expect(handoff).not.toHaveBeenCalled();
        expect(await activateSpotifyPlaybackModeForSelection(true, () => true)).toBe(true);
        expect(handoff).toHaveBeenCalledOnce();
        expect(useSpotifyPlaybackModeStore.getState().active).toBe('embedded');
    });

    it('does not change owner if the selection or requested mode becomes stale while the handoff waits', async () => {
        let finish!: () => void;
        handoff.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
        useSpotifyPlaybackModeStore.getState().setDesired('embedded');
        const pending = activateSpotifyPlaybackModeForSelection(true, () => true);
        useSpotifyPlaybackModeStore.getState().setDesired('desktop');
        finish();
        expect(await pending).toBe(false);
        expect(useSpotifyPlaybackModeStore.getState().active).toBe('desktop');
    });

    it('marks the old desktop track paused while the embedded track is loading', async () => {
        const id = 'a'.repeat(22);
        usePlaybackStore.setState({ currentSong: { id, name: 'Song', artists: [], album: { id: '', name: '' }, durationMs: 1000, sourceRef: { kind: 'online', providerId: 'spotify', mediaId: id } }, playerState: PlayerState.PLAYING });
        useSpotifyPlaybackModeStore.getState().setDesired('embedded');
        await activateSpotifyPlaybackModeForSelection(true, () => true);
        expect(usePlaybackStore.getState().playerState).toBe(PlayerState.PAUSED);
    });

    it('pauses an independently playing desktop before adopting embedded playback', async () => {
        desktop.snapshot.mockResolvedValue({ availability: 'ready', state: 'playing' });
        desktop.command.mockResolvedValue({ availability: 'ready', state: 'paused' });
        useSpotifyPlaybackModeStore.getState().setDesired('embedded');
        expect(await activateSpotifyPlaybackModeForSelection(true, () => true)).toBe(true);
        expect(desktop.command).toHaveBeenCalledWith('pause');
        expect(useSpotifyPlaybackModeStore.getState().active).toBe('embedded');
    });

    it('does not adopt embedded playback when desktop status is unavailable or cannot pause', async () => {
        const id = 'a'.repeat(22);
        usePlaybackStore.setState({ currentSong: { id, name: 'Song', artists: [], album: { id: '', name: '' }, durationMs: 1000, sourceRef: { kind: 'online', providerId: 'spotify', mediaId: id } }, playerState: PlayerState.PLAYING });
        desktop.snapshot.mockResolvedValue({ availability: 'permission-denied', state: 'stopped' });
        useSpotifyPlaybackModeStore.getState().setDesired('embedded');
        await expect(activateSpotifyPlaybackModeForSelection(true, () => true)).rejects.toThrow();
        expect(useSpotifyPlaybackModeStore.getState().active).toBe('desktop');
        expect(usePlaybackStore.getState().playerState).toBe(PlayerState.PAUSED);
        desktop.snapshot.mockResolvedValue({ availability: 'ready', state: 'playing' });
        desktop.command.mockResolvedValue({ availability: 'ready', state: 'playing' });
        await expect(activateSpotifyPlaybackModeForSelection(true, () => true)).rejects.toThrow();
        expect(useSpotifyPlaybackModeStore.getState().active).toBe('desktop');
    });

    it('stops buffered embedded audio before leaving the embedded mode', async () => {
        const id = 'a'.repeat(22);
        useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
        usePlaybackStore.setState({ currentSong: { id, name: 'Song', artists: [], album: { id: '', name: '' }, durationMs: 1000, sourceRef: { kind: 'online', providerId: 'spotify', mediaId: id } }, audioSrc: `folia-spotify://audio/${id}?k=test`, playerState: PlayerState.PLAYING });
        await stopSpotifyEmbeddedPlayback();
        expect(stopLocal).toHaveBeenCalledOnce();
        expect(usePlaybackStore.getState().audioSrc).toBeNull();
        expect(usePlaybackStore.getState().playerState).toBe(PlayerState.PAUSED);
        expect(useSpotifyPlaybackModeStore.getState()).toMatchObject({ active: 'desktop', desired: 'desktop' });
    });

    it('does not clear a newer play or reset its mode while stopping embedded playback', async () => {
        const id = 'a'.repeat(22);
        const song = { id, name: 'Song', artists: [], album: { id: '', name: '' }, durationMs: 1000, sourceRef: { kind: 'online' as const, providerId: 'spotify' as const, mediaId: id } };
        useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
        usePlaybackStore.setState({ currentSong: song, audioSrc: 'newer-source', playerState: PlayerState.PLAYING });
        let finish!: () => void;
        stopLocal.mockImplementation(() => { revision.current++; return new Promise<void>(resolve => { finish = resolve; }); });
        const pending = stopSpotifyEmbeddedPlayback();
        const newerPlay = startPlay();
        finish();
        expect(await pending).toBe(false);
        expect(newerPlay()).toBe(true);
        expect(usePlaybackStore.getState().audioSrc).toBe('newer-source');
        expect(useSpotifyPlaybackModeStore.getState()).toMatchObject({ active: 'embedded', desired: 'embedded' });
    });

    it('accepts the ownership revision advanced by its own embedded stop', async () => {
        const id = 'a'.repeat(22);
        useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
        usePlaybackStore.setState({ currentSong: { id, name: 'Song', artists: [], album: { id: '', name: '' }, durationMs: 1000, sourceRef: { kind: 'online', providerId: 'spotify', mediaId: id } }, audioSrc: 'old-source', playerState: PlayerState.PLAYING });
        stopLocal.mockImplementation(async () => { revision.current++; });
        expect(await stopSpotifyEmbeddedPlayback(() => true)).toBe(true);
        expect(usePlaybackStore.getState().audioSrc).toBeNull();
        expect(useSpotifyPlaybackModeStore.getState().active).toBe('desktop');
    });

    it('does not stop a desktop playback when the embedded account signs out', async () => {
        await stopSpotifyEmbeddedPlayback();
        expect(stopLocal).not.toHaveBeenCalled();
    });
});
