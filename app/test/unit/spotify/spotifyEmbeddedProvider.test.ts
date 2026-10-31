import '../fixtures/upstreamProviders';
import { afterEach, expect, it, vi } from 'vitest';
import { spotifyProvider } from '@/services/onlineMusic/spotify/spotifyProvider';
import { useSpotifyPlaybackModeStore } from '@/services/onlineMusic/spotify/spotifyPlaybackMode';
import type { UnifiedSong } from '@/types';

const embedded = vi.hoisted(() => vi.fn());
vi.mock('@/services/onlineMusic/spotify/spotifyEmbeddedTransport', () => ({ requestSpotifyEmbedded: embedded }));
const id = 'a'.repeat(22);
const song: UnifiedSong = { id, name: 'Song', artists: [], album: { id: '', name: '', coverUrl: '' }, durationMs: 180000, sourceRef: { kind: 'online', providerId: 'spotify', mediaId: id } };

afterEach(() => { useSpotifyPlaybackModeStore.setState({ active: 'desktop', desired: 'desktop' }); embedded.mockReset(); });

it('retains desktop ownership until handoff, then supplies immersive audio', async () => {
    expect(useSpotifyPlaybackModeStore.getState().desired).toBe('embedded');
    expect(spotifyProvider.playback?.external).toBeDefined();
    await expect(spotifyProvider.playback!.getAudioSource!(song, 'high')).rejects.toMatchObject({ code: 'unsupported' });
    useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
    embedded.mockResolvedValue({ url: `folia-spotify://audio/${id}?k=test`, format: 'ogg' });
    expect(spotifyProvider.playback?.external).toBeUndefined();
    expect(await spotifyProvider.playback!.getAudioSource!(song, 'high')).toMatchObject({ url: `folia-spotify://audio/${id}?k=test`, quality: 'high' });
    expect(embedded).toHaveBeenCalledWith('audio', { id, quality: 'high' });
});
