import { useSpotifyPlaybackModeStore } from '../../../../services/onlineMusic/spotify/spotifyPlaybackMode';
import { spotifyDesktopPlayback } from '../../../../services/onlineMusic/spotify/spotifyDesktopPlayback';
import { PlayerState } from '../../../../types';
import { usePlaybackStore } from '../../../../stores/usePlaybackStore';
import { getPlaybackSongKey, getPlaybackSourceRef } from '../../../../utils/appPlaybackGuards';
import { dropPlaysInFlight, playsStartedSoFar } from '../../playback/currentSong';
import { getExternalIntentRevision, prepareLocalPlayback, stopOwnedLocalPlayback } from '../externalPlaybackRuntime';

/** A requested mode is applied only when the listener selects another Spotify track. */
export async function activateSpotifyPlaybackModeForSelection(isSpotify: boolean, isCurrent: () => boolean): Promise<boolean> {
    const { active, desired } = useSpotifyPlaybackModeStore.getState();
    if (!isSpotify || active === desired) return isCurrent();
    const pausedExternal = await prepareLocalPlayback();
    if (!isCurrent() || useSpotifyPlaybackModeStore.getState().desired !== desired) return false;
    const playback = usePlaybackStore.getState();
    const currentSource = playback.currentSong && getPlaybackSourceRef(playback.currentSong);
    if (pausedExternal && active === 'desktop' && desired === 'embedded' && currentSource?.kind === 'online' && currentSource.providerId === 'spotify') {
        playback.setPlayerState(PlayerState.PAUSED);
    }
    if (desired === 'embedded') {
        const desktop = await spotifyDesktopPlayback.snapshot();
        if (!isCurrent() || useSpotifyPlaybackModeStore.getState().desired !== desired) return false;
        if (desktop.availability === 'permission-denied' || desktop.availability === 'error' || desktop.availability === 'unsupported-platform') {
            throw new Error('Cannot verify that Spotify Desktop is paused. Check its automation permission and try again.');
        }
        if (desktop.state === 'playing') {
            const paused = await spotifyDesktopPlayback.command('pause');
            if (!isCurrent() || useSpotifyPlaybackModeStore.getState().desired !== desired) return false;
            if (paused.state === 'playing' || paused.availability === 'permission-denied' || paused.availability === 'error') {
                throw new Error('Spotify Desktop must pause before immersive playback can start.');
            }
        }
    }
    if (!pausedExternal && active === 'desktop' && desired === 'embedded' && currentSource?.kind === 'online' && currentSource.providerId === 'spotify') {
        playback.setPlayerState(PlayerState.PAUSED);
    }
    useSpotifyPlaybackModeStore.getState().setActive(desired);
    return true;
}

/** Stop buffered Spotify audio before its embedded credentials are removed. */
export async function stopSpotifyEmbeddedPlayback(isCurrent: () => boolean = () => true): Promise<boolean> {
    const mode = useSpotifyPlaybackModeStore.getState();
    if (!isCurrent()) return false;
    if (mode.active !== 'embedded') { mode.setDesired('desktop'); return true; }
    dropPlaysInFlight();
    const playsAtStop = playsStartedSoFar();
    const selected = usePlaybackStore.getState().currentSong;
    const source = selected && getPlaybackSourceRef(selected);
    if (selected && source?.kind === 'online' && source.providerId === 'spotify') {
        const key = getPlaybackSongKey(selected);
        const stopping = stopOwnedLocalPlayback();
        const revision = getExternalIntentRevision();
        await stopping;
        if (!isCurrent() || playsAtStop !== playsStartedSoFar() || revision !== getExternalIntentRevision()) return false;
        const playback = usePlaybackStore.getState();
        if (playback.currentSong && getPlaybackSongKey(playback.currentSong) === key) {
            playback.setAudioSrc(null);
            playback.setPlayerState(PlayerState.PAUSED);
        }
    }
    if (!isCurrent() || playsAtStop !== playsStartedSoFar()) return false;
    useSpotifyPlaybackModeStore.setState({ active: 'desktop', desired: 'desktop' });
    return true;
}
