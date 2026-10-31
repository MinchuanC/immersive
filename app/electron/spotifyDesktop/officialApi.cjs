// Documented Web API operations mapped into the existing provider's canonical input shapes.
const ID = /^[A-Za-z0-9]{22}$/;
const uri = (kind, id) => `spotify:${kind}:${id}`;
const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };
const entityId = (value, kind) => {
    const id = typeof value === 'string' ? value.match(new RegExp(`^spotify:${kind}:([A-Za-z0-9]{22})$`))?.[1] : null;
    return id || fail('unsupported', `A valid Spotify ${kind} URI is required`);
};
const checkedId = value => typeof value === 'string' && ID.test(value) ? value : fail('unsupported', 'Invalid Spotify id');
const page = variables => ({ limit: Math.min(50, Math.max(1, Math.floor(Number(variables.limit) || 50))), offset: Math.max(0, Math.min(100000, Math.floor(Number(variables.offset) || 0))) });
const pathWith = (path, params) => `${path}?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))}`;
const artist = row => ({ uri: row.uri || uri('artist', row.id), profile: { name: row.name }, visuals: { avatarImage: { sources: row.images || [] } } });
const album = row => ({ __typename: 'Album', uri: row.uri || uri('album', row.id), name: row.name, coverArt: { sources: row.images || [] },
    artists: { items: (row.artists || []).map(artist) }, date: { isoString: row.release_date }, albumType: String(row.album_type || '').toUpperCase(), tracks: { totalCount: row.total_tracks ?? row.tracks?.total } });
const track = row => row && !row.is_local && row.type !== 'episode' ? ({ __typename: 'Track', uri: row.uri || uri('track', row.id), name: row.name,
    artists: { items: (row.artists || []).map(artist) }, albumOfTrack: row.album ? album(row.album) : undefined,
    duration: { totalMilliseconds: row.duration_ms || 0 } }) : null;
const playlist = (row, userId) => ({ __typename: 'Playlist', uri: row.uri || uri('playlist', row.id), name: row.name, description: row.description || '',
    images: { items: [{ sources: row.images || [] }] }, ownerV2: { data: { name: row.owner?.display_name || row.owner?.id || '' } },
    currentUserCapabilities: { canEditItems: row.owner?.id === userId || row.collaborative === true }, content: { totalCount: row.items?.total ?? row.tracks?.total } });

function createOfficialApi({ api, getUser }) {
    let playlistEdit = Promise.resolve();
    const query = async (name, variables = {}) => {
        const paging = page(variables);
        switch (name) {
            case 'playerQueue': {
                const answer = await api('/me/player/queue');
                if (!answer || !Array.isArray(answer.queue)) fail('invalid-response', 'Spotify did not provide its current queue');
                return { currentSong: track(answer.currently_playing) ?? null, songs: answer.queue.map(track) };
            }
            case 'searchTracks': {
                const searchTerm = String(variables.searchTerm || '').trim().slice(0, 500);
                if (!searchTerm) return { searchV2: { tracksV2: { items: [] } } };
                const answer = await api(pathWith('/search', { q: searchTerm, type: 'track', ...paging, limit: Math.min(10, paging.limit) }));
                return { searchV2: { tracksV2: { totalCount: answer.tracks?.total, items: (answer.tracks?.items || []).map(row => ({ item: { data: track(row) } })) } } };
            }
            case 'getTrack': return { trackUnion: track(await api(`/tracks/${entityId(variables.uri, 'track')}`)) };
            case 'fetchLibraryTracks': {
                const answer = await api(pathWith('/me/tracks', paging));
                return { me: { library: { tracks: { totalCount: answer.total, items: (answer.items || []).map(row => ({ track: { _uri: row.track?.uri, data: track(row.track) } })) } } } };
            }
            case 'libraryV3': {
                const albums = Array.isArray(variables.filters) && variables.filters.includes('Albums');
                const answer = await api(pathWith(albums ? '/me/albums' : '/me/playlists', paging));
                const user = await getUser();
                return { me: { libraryV3: { totalCount: answer.total, items: (answer.items || []).map(row => ({ item: { data: albums ? album(row.album) : playlist(row, user.id) } })) } } };
            }
            case 'fetchPlaylist': {
                const id = entityId(variables.uri, 'playlist');
                const [head, user] = await Promise.all([api(`/playlists/${id}`), getUser()]);
                const mapped = playlist(head, user.id);
                const saved = await api(pathWith('/me/library/contains', { uris: uri('playlist', id) }));
                if (variables.metadataOnly) return { playlistV2: { ...mapped, following: saved[0] === true } };
                // Development-mode Spotify apps expose item contents for owned or collaborative lists.
                if (!mapped.currentUserCapabilities.canEditItems) fail('not-public', 'Spotify only exposes the contents of your owned or collaborative playlists to this app. Open this playlist in Spotify to listen.');
                const answer = await api(pathWith(`/playlists/${id}/items`, paging));
                return { playlistV2: { ...mapped, following: saved[0] === true, content: { totalCount: answer.total, items: (answer.items || []).map(row => ({ itemV2: { data: track(row.item ?? row.track) } })) } } };
            }
            case 'getAlbum': {
                const id = entityId(variables.uri, 'album');
                const head = await api(`/albums/${id}`);
                const answer = await api(pathWith(`/albums/${id}/tracks`, paging));
                return { albumUnion: { ...album(head), tracksV2: { totalCount: answer.total, items: (answer.items || []).map(row => ({ track: track(row) })) } } };
            }
            case 'queryArtistOverview': return { artistUnion: artist(await api(`/artists/${entityId(variables.uri, 'artist')}`)) };
            case 'queryArtistDiscographyAll': {
                const answer = await api(pathWith(`/artists/${entityId(variables.uri, 'artist')}/albums`, { ...paging, include_groups: 'album,single' }));
                return { artistUnion: { discography: { all: { totalCount: answer.total, items: (answer.items || []).map(row => ({ releases: { items: [album(row)] } })) } } } };
            }
            case 'areEntitiesInLibrary': {
                const uris = variables.uris;
                if (!Array.isArray(uris) || uris.length > 20000 || uris.some(value => !/^spotify:(track|album|playlist|artist):[A-Za-z0-9]{22}$/.test(value))) fail('unsupported', 'Invalid Spotify library entities');
                const lookup = [];
                for (let offset = 0; offset < uris.length; offset += 40) {
                    const answer = await api(pathWith('/me/library/contains', { uris: uris.slice(offset, offset + 40).join(',') }));
                    if (!Array.isArray(answer) || answer.length !== Math.min(40, uris.length - offset)) fail('invalid-response', 'Spotify did not answer every library status');
                    lookup.push(...answer.map(saved => ({ data: { saved: saved === true } })));
                }
                return { lookup };
            }
            default: fail('unsupported', 'This discovery feature is not available through the official Spotify Web API');
        }
    };
    const mutate = async (operation, params) => {
        if (operation === 'library') {
            if (!/^spotify:(track|album|playlist):[A-Za-z0-9]{22}$/.test(params.uri) || typeof params.saved !== 'boolean') fail('unsupported', 'Invalid Spotify library change');
            if (params.uri.startsWith('spotify:playlist:')) {
                const [head, user] = await Promise.all([api(`/playlists/${entityId(params.uri, 'playlist')}`), getUser()]);
                if (!head.owner?.id) fail('invalid-response', 'Spotify did not identify the playlist owner');
                if (head.owner.id === user.id) fail('unsupported', 'The playlist belongs to this account');
            }
            await api(pathWith('/me/library', { uris: params.uri }), { method: params.saved ? 'PUT' : 'DELETE' });
            return true;
        }
        if (operation === 'playlist_create') {
            const name = typeof params.name === 'string' ? params.name.trim().slice(0, 100) : '';
            if (!name) fail('unsupported', 'Playlist name is required');
            const made = await api('/me/playlists', { method: 'POST', body: { name, public: false } });
            return { uri: made.uri || uri('playlist', made.id) };
        }
        if (operation === 'playlist_edit') {
            const id = checkedId(params.id);
            if (!['add', 'remove'].includes(params.action) || !Array.isArray(params.tracks) || params.tracks.length < 1 || params.tracks.length > 100) fail('unsupported', 'Invalid playlist change');
            let uris = [...new Set(params.tracks.map(id => uri('track', checkedId(id))))];
            const [head, user] = await Promise.all([api(`/playlists/${id}`), getUser()]);
            if (head.owner?.id !== user.id && !head.collaborative) fail('not-public', 'Only your owned or collaborative playlists can be changed');
            if (params.action === 'add') {
                const fresh = new Set(uris);
                for (let offset = 0; ; ) {
                    const answer = await api(pathWith(`/playlists/${id}/items`, { limit: 50, offset }));
                    if (!Array.isArray(answer.items) || !Number.isInteger(answer.total) || answer.total < 0) fail('invalid-response', 'Spotify did not give the complete playlist');
                    for (const row of answer.items) fresh.delete((row.item ?? row.track)?.uri);
                    if (!fresh.size) return true;
                    offset += answer.items.length;
                    if (offset >= answer.total) break;
                    if (!answer.items.length) fail('invalid-response', 'Spotify did not give the complete playlist');
                    if (offset >= 20000) fail('unavailable', 'The playlist is too long to change from here');
                }
                uris = [...fresh];
            }
            await api(`/playlists/${id}/items`, { method: params.action === 'add' ? 'POST' : 'DELETE', body: params.action === 'add' ? { uris } : { items: uris.map(uri => ({ uri })) } });
            return true;
        }
        fail('unsupported', 'Unknown Spotify API operation');
    };
    return { query, mutate: (operation, params) => {
        if (operation !== 'playlist_edit') return mutate(operation, params);
        const edited = playlistEdit.catch(() => {}).then(() => mutate(operation, params));
        playlistEdit = edited;
        return edited;
    } };
}

module.exports = { createOfficialApi, track, album, artist, playlist };
