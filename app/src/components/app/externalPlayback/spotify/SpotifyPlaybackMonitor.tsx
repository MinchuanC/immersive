import { useEffect } from 'react';
import { useSpotifyPlaybackModeStore } from '../../../../services/onlineMusic/spotify/spotifyPlaybackMode';
import { spotifyDesktopPlayback } from '../../../../services/onlineMusic/spotify/spotifyDesktopPlayback';
import { getExternalIntentRevision } from '../externalPlaybackRuntime';
import { playsStartedSoFar } from '../../playback/currentSong';
import { interruptEmbeddedForDesktop, stopEmbeddedForMonitoringFailure } from './spotifyDesktopInterruption';

export default function SpotifyPlaybackMonitor() {
    const active = useSpotifyPlaybackModeStore(state => state.active === 'embedded');
    useEffect(() => {
        if (!active || !window.electron) return;
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            const revision = getExternalIntentRevision();
            const plays = playsStartedSoFar();
            const isCurrent = () => !stopped && plays === playsStartedSoFar();
            try {
                const next = await spotifyDesktopPlayback.snapshot();
                if (isCurrent() && revision === getExternalIntentRevision()) {
                    await interruptEmbeddedForDesktop(next, isCurrent);
                }
            } catch {
                if (isCurrent() && revision === getExternalIntentRevision()) await stopEmbeddedForMonitoringFailure(isCurrent);
            }
            if (!stopped) timer = setTimeout(poll, document.hidden ? 2500 : 700);
        };
        void poll();
        return () => { stopped = true; clearTimeout(timer); };
    }, [active]);
    return null;
}
