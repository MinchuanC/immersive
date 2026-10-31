import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spotifyLibrary } from '@/services/onlineMusic/spotify/spotifyLibrary';
import { spotifyCatalog, clearSpotifyCatalogCache } from '@/services/onlineMusic/spotify/spotifyCatalog';
import { spotifyMutations } from '@/services/onlineMusic/spotify/spotifyMutations';
import { spotifyDesktopPlayback } from '@/services/onlineMusic/spotify/spotifyDesktopPlayback';

// Exercise the official API shapes through the real renderer adapters, without account writes.
const require = createRequire(import.meta.url);
const { createOfficialApi } = require('../../../electron/spotifyDesktop/officialApi.cjs');
const id = (letter: string) => letter.repeat(22);
const track = (letter: string) => ({ id: id(letter), uri: `spotify:track:${id(letter)}`, type: 'track', name: `Song ${letter}`, duration_ms: 120000,
    artists: [{ id: id('r'), name: 'Artist' }], album: { id: id('m'), name: 'Album', images: [{ url: 'https://example.com/cover.jpg' }] } });
type ApiOptions = { method?: string; body?: Record<string, unknown> };

function connect(api: (path: string, options?: ApiOptions) => Promise<unknown>) {
    const official = createOfficialApi({ api, getUser: async () => ({ id: 'listener' }) });
    vi.stubGlobal('window', { electron: { spotifyRequest: async (operation: string, params: Record<string, any>) => {
        try {
            return { ok: true, data: operation === 'query' ? await official.query(params.name, params.variables) : await official.mutate(operation, params) };
        } catch (error) {
            return { ok: false, error: { code: (error as { code?: string }).code || 'network', message: (error as Error).message } };
        }
    } } });
    return official;
}

afterEach(() => { vi.unstubAllGlobals(); clearSpotifyCatalogCache(); });

describe('official Spotify library and catalog adapter contracts', () => {
    it('reads the current playback queue instead of a playlist collection', async () => {
        const official = connect(async path => {
            expect(path).toBe('/me/player/queue');
            return { currently_playing: track('a'), queue: [track('b'), track('b')] };
        });
        await expect(official.query('playerQueue')).resolves.toMatchObject({
            currentSong: { uri: `spotify:track:${id('a')}` },
            songs: [{ uri: `spotify:track:${id('b')}` }, { uri: `spotify:track:${id('b')}` }],
        });
        await expect(spotifyDesktopPlayback.queue!()).resolves.toMatchObject({ currentSong: { name: 'Song a' }, songs: [{ name: 'Song b' }, { name: 'Song b' }] });
    });
    it('rejects incomplete queue responses and does not silently drop unsupported positions', async () => {
        let response: unknown = {};
        const official = connect(async () => response);
        await expect(official.query('playerQueue')).rejects.toMatchObject({ code: 'invalid-response' });
        response = { currently_playing: track('a'), queue: [track('b'), { type: 'episode' }, track('c')] };
        await expect(spotifyDesktopPlayback.queue!()).rejects.toMatchObject({ code: 'unsupported' });
    });
    it('pages the library by remote rows while including Liked Songs once', async () => {
        connect(async path => {
            const request = new URL(path, 'https://api.spotify.com');
            if (request.pathname === '/me/tracks') return { total: 1, items: [{ track: track('a') }] };
            const offset = Number(request.searchParams.get('offset'));
            return { total: 2, items: [{ id: id(offset ? 'q' : 'p'), name: 'Playlist', owner: { id: offset ? 'other' : 'listener' }, items: { total: 3 } }] };
        });
        const first = await spotifyLibrary.getUserPlaylists!('listener', 1, 0);
        const second = await spotifyLibrary.getUserPlaylists!('listener', 1, first.nextOffset);
        expect(first).toMatchObject({ nextOffset: 1, total: 3, hasMore: true });
        expect(first.items.map(item => [item.id, item.isOwned])).toEqual([['liked', true], [id('p'), true]]);
        expect(second).toMatchObject({ nextOffset: 2, hasMore: false });
        expect(second.items.map(item => item.id)).toEqual([id('q')]);
    });

    it('maps saved albums and keeps album metadata on simplified track pages', async () => {
        const album = { id: id('m'), name: 'Album', artists: [{ id: id('r'), name: 'Artist' }], images: [{ url: 'https://example.com/cover.jpg' }], total_tracks: 2 };
        connect(async path => {
            const request = new URL(path, 'https://api.spotify.com');
            if (request.pathname === '/me/albums') return { total: 1, items: [{ album }] };
            if (request.pathname.endsWith('/tracks')) return { total: 2, items: [{ ...track(request.searchParams.get('offset') === '1' ? 'b' : 'a'), album: undefined }] };
            return album;
        });
        const saved = await spotifyLibrary.getUserAlbums!('listener', 50, 0);
        expect(saved.items[0]).toMatchObject({ id: id('m'), type: 'album', trackCount: 2 });
        const first = await spotifyCatalog.getAlbumTracks!(id('m'), 1, 0);
        const next = await spotifyCatalog.getAlbumTracks!(id('m'), 1, first.nextOffset);
        expect(first).toMatchObject({ nextOffset: 1, hasMore: true });
        expect(next).toMatchObject({ nextOffset: 2, hasMore: false });
        expect(next.items[0]).toMatchObject({ id: id('b'), durationMs: 120000, album: { id: id('m'), name: 'Album', coverUrl: 'https://example.com/cover.jpg' } });
    });

    it('reads owned playlist items and rejects restricted followed-playlist content', async () => {
        let owner = 'listener';
        connect(async path => {
            const request = new URL(path, 'https://api.spotify.com');
            if (request.pathname === '/me/library/contains') return [true];
            if (request.pathname.endsWith('/items')) return { total: 2, items: [{ item: track('a') }, { item: null }] };
            return { id: id('p'), name: 'Playlist', owner: { id: owner }, items: { total: 2 } };
        });
        const page = await spotifyCatalog.getPlaylistTracks!(id('p'), 50, 0);
        expect(page).toMatchObject({ nextOffset: 2, hasMore: false });
        expect(page.items.map(item => item.id)).toEqual([id('a')]);
        owner = 'other';
        expect(await spotifyCatalog.getSubscriptionStatus!('playlist', id('p'))).toBe(true);
        await expect(spotifyCatalog.getPlaylistTracks!(id('p'), 50, 0)).rejects.toMatchObject({ code: 'not-public' });
    });

    it('checks saved-state batches of at most forty and preserves their order', async () => {
        const calls: string[][] = [];
        connect(async path => {
            const uris = new URL(path, 'https://api.spotify.com').searchParams.get('uris')!.split(',');
            calls.push(uris);
            return uris.map(uri => Number(uri.slice(-2)) % 2 === 0);
        });
        const ids = Array.from({ length: 45 }, (_, index) => String(index).padStart(22, '0'));
        const saved = await spotifyLibrary.areSongsLiked!(ids);
        expect(calls.map(items => items.length)).toEqual([40, 5]);
        expect(ids.map(item => saved[item])).toEqual(ids.map((_, index) => index % 2 === 0));
    });
});

describe('official Spotify account mutation contracts', () => {
    it('adds only songs absent from every playlist page and deduplicates the request', async () => {
        const writes: ApiOptions[] = [];
        connect(async (path, options) => {
            const request = new URL(path, 'https://api.spotify.com');
            if (options?.method) { writes.push(options); return { snapshot_id: 'changed' }; }
            if (request.pathname.endsWith('/items')) {
                return { total: 2, items: [{ item: track(request.searchParams.get('offset') === '0' ? 'a' : 'b') }] };
            }
            return { id: id('p'), owner: { id: 'listener' } };
        });
        await spotifyMutations.updatePlaylistTracks!('add', id('p'), [id('b'), id('c'), id('c')]);
        expect(writes).toEqual([{ method: 'POST', body: { uris: [`spotify:track:${id('c')}`] } }]);
        writes.length = 0;
        await spotifyMutations.updatePlaylistTracks!('add', id('p'), [id('a'), id('b')]);
        expect(writes).toEqual([]);
    });

    it('refuses to remove an owned playlist from the library at the main-process boundary', async () => {
        const writes: string[] = [];
        connect(async (path, options) => {
            if (options?.method) writes.push(path);
            return { id: id('p'), owner: { id: 'listener' } };
        });
        await expect(spotifyMutations.subscribePlaylist!(id('p'), false)).rejects.toMatchObject({ code: 'unsupported' });
        expect(writes).toEqual([]);
    });

    it('checks concurrent additions against the preceding completed playlist edit', async () => {
        const rows: Array<{ item: ReturnType<typeof track> }> = [];
        let additions = 0;
        connect(async (path, options) => {
            if (options?.method === 'POST') { additions++; rows.push({ item: track('a') }); return { snapshot_id: 'changed' }; }
            if (new URL(path, 'https://api.spotify.com').pathname.endsWith('/items')) return { total: rows.length, items: [...rows] };
            return { id: id('p'), owner: { id: 'listener' } };
        });
        await Promise.all([
            spotifyMutations.updatePlaylistTracks!('add', id('p'), [id('a')]),
            spotifyMutations.updatePlaylistTracks!('add', id('p'), [id('a')]),
        ]);
        expect(additions).toBe(1);
    });

    it('does not add songs after an incomplete playlist membership read', async () => {
        let wrote = false;
        connect(async (path, options) => {
            if (options?.method) wrote = true;
            if (new URL(path, 'https://api.spotify.com').pathname.endsWith('/items')) return { total: 2, items: [] };
            return { id: id('p'), owner: { id: 'listener' } };
        });
        await expect(spotifyMutations.updatePlaylistTracks!('add', id('p'), [id('a')])).rejects.toMatchObject({ code: 'invalid-response' });
        expect(wrote).toBe(false);
    });

    it('uses the documented save/remove/create and playlist item removal bodies', async () => {
        const writes: Array<[string, ApiOptions]> = [];
        connect(async (path, options) => {
            if (options?.method) { writes.push([path, options]); return { uri: `spotify:playlist:${id('n')}` }; }
            return { id: id('p'), owner: { id: 'other' }, collaborative: true };
        });
        await spotifyMutations.likeSong!(id('a'), true);
        await spotifyMutations.subscribeAlbum!(id('m'), false);
        await spotifyMutations.subscribePlaylist!(id('p'), false);
        await spotifyMutations.updatePlaylistTracks!('del', id('p'), [id('a')]);
        expect(await spotifyMutations.createPlaylist!(' Road ')).toMatchObject({ id: id('n'), isOwned: true });
        expect(writes).toEqual([
            [`/me/library?uris=spotify%3Atrack%3A${id('a')}`, { method: 'PUT' }],
            [`/me/library?uris=spotify%3Aalbum%3A${id('m')}`, { method: 'DELETE' }],
            [`/me/library?uris=spotify%3Aplaylist%3A${id('p')}`, { method: 'DELETE' }],
            [`/playlists/${id('p')}/items`, { method: 'DELETE', body: { items: [{ uri: `spotify:track:${id('a')}` }] } }],
            ['/me/playlists', { method: 'POST', body: { name: 'Road', public: false } }],
        ]);
    });
});
