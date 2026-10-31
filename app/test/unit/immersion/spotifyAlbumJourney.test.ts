import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongResult } from '../../../src/types';

const getAlbumTracks = vi.hoisted(() => vi.fn());
vi.mock('../../../src/services/onlineMusic/spotify/spotifyCatalog', () => ({
    spotifyCatalog: { getAlbumTracks },
    clearSpotifyCatalogCache: vi.fn(),
}));

import { spotifyImmersion } from '../../../src/services/onlineMusic/spotify/spotifyImmersion';

const loadSpotifyJourneyAlbum = spotifyImmersion.loadAlbum;

const albumId = 'a'.repeat(22);
const track = (id: string): SongResult => ({
    id, name: id, artists: [], durationMs: 120000,
    album: { id: albumId, name: 'Album', catalogRef: { providerId: 'spotify', kind: 'album', id: albumId } },
    sourceRef: { kind: 'online', providerId: 'spotify', mediaId: id },
});

beforeEach(() => getAlbumTracks.mockReset());

describe('Spotify album journey tracks', () => {
    it('loads every page in original order with Spotify recording identities', async () => {
        const tracks = [track('one'), track('two'), track('three')];
        getAlbumTracks.mockResolvedValueOnce({ items: tracks.slice(0, 2), total: 3, nextOffset: 2, hasMore: true })
            .mockResolvedValueOnce({ items: tracks.slice(2), total: 3, nextOffset: 3, hasMore: false });
        const result = await loadSpotifyJourneyAlbum(tracks[0]);
        expect(result.songs).toEqual(tracks);
        expect(result.album.tracks.map(item => item.trackKey)).toEqual(['online:spotify:one', 'online:spotify:two', 'online:spotify:three']);
        expect(getAlbumTracks).toHaveBeenNthCalledWith(2, albumId, 100, 2);
    });

    it.each([
        { items: [track('one')], total: 2, nextOffset: 2, hasMore: false },
        { items: [track('one')], total: 2, nextOffset: 1, hasMore: false },
        { items: [track('one')], total: 2, nextOffset: 0, hasMore: true },
        { items: [track('one'), track('one')], total: 2, nextOffset: 2, hasMore: false },
    ])('rejects incomplete, stalled or duplicate track pages', async page => {
        getAlbumTracks.mockResolvedValue(page);
        await expect(loadSpotifyJourneyAlbum(track('one'))).rejects.toThrow();
    });
});
