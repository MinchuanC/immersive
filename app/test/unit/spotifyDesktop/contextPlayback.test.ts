import { afterEach, describe, expect, it, vi } from 'vitest';
import { omni } from '@/services/onlineMusic/omni';
import { spotifyDesktopPlayback } from '@/services/onlineMusic/spotify/spotifyDesktopPlayback';
import type { UnifiedSong } from '@/types';

// Collection context must reach the native boundary only when explicitly requested for this source.
const id = 'a'.repeat(22);
const collectionId = 'b'.repeat(22);
const song: UnifiedSong = { id, name: 'Track', artists: [], album: { id: '', name: '' }, durationMs: 120000,
    sourceRef: { kind: 'online', providerId: 'spotify', mediaId: id } };
const snapshot = { availability: 'ready', state: 'playing', positionMs: 0, volume: .5, observedAt: 1,
    track: { uri: `spotify:track:${id}`, title: 'Track', durationMs: 120000 } };

afterEach(() => vi.unstubAllGlobals());

describe('explicit native collection context', () => {
    it.each(['playlist', 'album'] as const)('forwards a requested %s through omni to the native transport', async type => {
        const request = vi.fn(async () => ({ ok: true, data: snapshot }));
        vi.stubGlobal('window', { electron: { spotifyRequest: request } });
        await omni.playExternalSong(song, { providerId: 'spotify', type, id: collectionId });
        expect(request).toHaveBeenCalledWith('playback_action', {
            action: 'play-track', uri: `spotify:track:${id}`, contextUri: `spotify:${type}:${collectionId}`,
        });
    });

    it('keeps arbitrary song playback outside a collection context', async () => {
        const request = vi.fn(async () => ({ ok: true, data: snapshot }));
        vi.stubGlobal('window', { electron: { spotifyRequest: request } });
        await omni.playExternalSong(song);
        expect(request).toHaveBeenCalledWith('playback_action', { action: 'play-track', uri: `spotify:track:${id}` });
    });

    it('rejects another source\'s context before reaching the desktop', async () => {
        const request = vi.fn(async () => ({ ok: true, data: snapshot }));
        vi.stubGlobal('window', { electron: { spotifyRequest: request } });
        await expect(spotifyDesktopPlayback.play(song, { providerId: 'other', type: 'playlist', id: collectionId })).rejects.toMatchObject({ code: 'unsupported' });
        expect(request).not.toHaveBeenCalled();
    });

    it('rejects a malformed collection id before reaching the desktop', async () => {
        const request = vi.fn(async () => ({ ok: true, data: snapshot }));
        vi.stubGlobal('window', { electron: { spotifyRequest: request } });
        await expect(spotifyDesktopPlayback.play(song, { providerId: 'spotify', type: 'playlist', id: 'bad"; code()' })).rejects.toMatchObject({ code: 'unsupported' });
        expect(request).not.toHaveBeenCalled();
    });
});
