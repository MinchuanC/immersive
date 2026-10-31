import type { ExternalPlaybackSnapshot } from '../../../../types/onlineMusic';
import { useSpotifyPlaybackModeStore } from '../../../../services/onlineMusic/spotify/spotifyPlaybackMode';
import { getExternalIntentRevision, observeExternalPlayback } from '../externalPlaybackRuntime';
import { stopSpotifyEmbeddedPlayback } from './spotifyPlaybackHandoff';
import { usePlaybackStore } from '../../../../stores/usePlaybackStore';
import { getPlaybackSourceRef } from '../../../../utils/appPlaybackGuards';
import { setStatusMessage } from '../../../../stores/useStatusMessageStore';
import i18n from '../../../../i18n/config';

export async function stopEmbeddedForMonitoringFailure(isCurrent: () => boolean): Promise<boolean> {
    const song = usePlaybackStore.getState().currentSong;
    const source = song && getPlaybackSourceRef(song);
    if (!isCurrent() || useSpotifyPlaybackModeStore.getState().active !== 'embedded'
        || source?.kind !== 'online' || source.providerId !== 'spotify') return false;
    if (!await stopSpotifyEmbeddedPlayback(isCurrent) || !isCurrent()) return false;
    setStatusMessage({ type: 'error', text: i18n.t('spotifyEmbedded.monitorLost') });
    return true;
}

export async function interruptEmbeddedForDesktop(snapshot: ExternalPlaybackSnapshot, isCurrent: () => boolean): Promise<boolean> {
    if (!isCurrent() || useSpotifyPlaybackModeStore.getState().active !== 'embedded') return false;
    if (snapshot.availability === 'permission-denied' || snapshot.availability === 'error' || snapshot.availability === 'unsupported-platform') {
        return stopEmbeddedForMonitoringFailure(isCurrent);
    }
    if (snapshot.availability !== 'ready' || snapshot.state !== 'playing' || !snapshot.currentSong) return false;
    const stopping = stopSpotifyEmbeddedPlayback(isCurrent);
    const revision = getExternalIntentRevision();
    if (!await stopping || !isCurrent() || revision !== getExternalIntentRevision()) return false;
    await observeExternalPlayback(snapshot, revision);
    return true;
}
