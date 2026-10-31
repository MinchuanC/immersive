import { afterEach, expect, it } from 'vitest';
import '@/services/onlineMusic/omni';
import '@/services/onlineMusic/playbackPresentations';
import { spotifyProvider } from '@/services/onlineMusic/spotify/spotifyProvider';
import { useSpotifyPlaybackModeStore } from '@/services/onlineMusic/spotify/spotifyPlaybackMode';

afterEach(() => useSpotifyPlaybackModeStore.setState({ active: 'desktop', desired: 'embedded' }));

it('registers the playback controls and handoff for the main window', () => {
    expect(spotifyProvider.playback?.accountControl).toBeDefined();
    expect(spotifyProvider.playback?.monitor).toBeDefined();
    expect(spotifyProvider.playback?.prepareSelection).toBeTypeOf('function');
});

it('requests a resume handoff only when the preferred owner differs from the restored desktop owner', () => {
    const needsHandoff = spotifyProvider.playback?.needsResumeHandoff;
    expect(needsHandoff).toBeTypeOf('function');
    useSpotifyPlaybackModeStore.setState({ active: 'desktop', desired: 'embedded' });
    expect(needsHandoff?.()).toBe(true);
    useSpotifyPlaybackModeStore.setState({ active: 'desktop', desired: 'desktop' });
    expect(needsHandoff?.()).toBe(false);
    useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
    expect(needsHandoff?.()).toBe(false);
});
