import { lazy } from 'react';
import { spotifyProvider } from './spotifyProvider';
import { useSpotifyPlaybackModeStore } from './spotifyPlaybackMode';

export function registerPlaybackPresentation(): void {
    if (!spotifyProvider.playback) return;
    Object.assign(spotifyProvider.playback, {
        accountControl: lazy(() => import('../../../components/app/externalPlayback/spotify/SpotifyEmbeddedControl')),
        monitor: lazy(() => import('../../../components/app/externalPlayback/spotify/SpotifyPlaybackMonitor')),
        needsResumeHandoff() {
            const mode = useSpotifyPlaybackModeStore.getState();
            return mode.active === 'desktop' && mode.desired === 'embedded';
        },
        async prepareSelection(isCurrent: () => boolean) {
            const { activateSpotifyPlaybackModeForSelection } = await import('../../../components/app/externalPlayback/spotify/spotifyPlaybackHandoff');
            return activateSpotifyPlaybackModeForSelection(true, isCurrent);
        },
    });
}
