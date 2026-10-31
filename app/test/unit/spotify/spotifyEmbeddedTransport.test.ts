// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { requestSpotifyEmbedded } from '@/services/onlineMusic/spotify/spotifyEmbeddedTransport';

afterEach(() => { Reflect.deleteProperty(window, 'electron'); });

it('uses the separate embedded bridge and does not fall back to desktop playback', async () => {
    const desktop = vi.fn();
    const embedded = vi.fn().mockResolvedValue({ ok: true, data: { url: 'folia-spotify://audio/track?k=test', format: 'ogg' } });
    Object.defineProperty(window, 'electron', { configurable: true, value: { spotifyRequest: desktop, embeddedPlaybackRequest: embedded } });
    await expect(requestSpotifyEmbedded('audio', { id: 'a'.repeat(22), quality: 'high' })).resolves.toMatchObject({ format: 'ogg' });
    expect(desktop).not.toHaveBeenCalled();
    expect(embedded).toHaveBeenCalledWith('spotify', 'audio', { id: 'a'.repeat(22), quality: 'high' });
});

it('reports a missing embedded bridge without using desktop', async () => {
    Object.defineProperty(window, 'electron', { configurable: true, value: { spotifyRequest: vi.fn() } });
    await expect(requestSpotifyEmbedded('login_status')).rejects.toMatchObject({ code: 'unavailable' });
});
