import type { SongResult } from '../../../types';
import type { OnlineImmersionProvider } from '../../../types/onlineMusic';
import type { ImmersionAlbum } from '../../../types/immersion';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';
import { spotifyCatalog } from './spotifyCatalog';
import { useSpotifyPlaybackModeStore } from './spotifyPlaybackMode';
import { analyseSpotifyScore } from './spotifyScoreAnalysis';

const loadSpotifyJourneyAlbum = async (song: SongResult): Promise<{ album: ImmersionAlbum; songs: SongResult[] }> => {
    const reference = song.album.catalogRef;
    if (song.sourceRef?.kind !== 'online' || song.sourceRef.providerId !== 'spotify'
        || !reference || reference.providerId !== 'spotify' || reference.kind !== 'album' || !reference.id) {
        throw new Error('The current song has no Spotify album');
    }
    const songs: SongResult[] = [];
    let offset = 0;
    let total: number | undefined;
    do {
        const page = await spotifyCatalog.getAlbumTracks!(reference.id, 100, offset);
        if (!Number.isInteger(page.total) || !page.total || page.total > 1000
            || (total !== undefined && total !== page.total) || page.nextOffset <= offset
            || page.nextOffset - offset !== page.items.length || page.nextOffset > page.total
            || page.hasMore !== (page.nextOffset < page.total)) {
            throw new Error('Spotify album tracks are incomplete');
        }
        total = page.total;
        songs.push(...page.items);
        offset = page.nextOffset;
    } while (offset < total!);
    const keys = songs.map(getPlaybackSongKey);
    if (!keys.includes(getPlaybackSongKey(song)) || new Set(keys).size !== songs.length || songs.some(item => (
        item.sourceRef?.kind !== 'online' || item.sourceRef.providerId !== 'spotify'
        || item.album.catalogRef?.id !== reference.id
    ))) throw new Error('Spotify album tracks are incomplete');
    return {
        songs,
        album: {
            key: `spotify:album:${reference.id}`,
            name: song.album.name,
            tracks: songs.map((item, index) => ({ songId: String(item.id), trackKey: keys[index], title: item.name, durationSec: item.durationMs / 1000 })),
        },
    };
};

export const spotifyImmersion: OnlineImmersionProvider = {
    isReady: () => {
        const { active, desired } = useSpotifyPlaybackModeStore.getState();
        return active === 'embedded' && desired === 'embedded';
    },
    subscribe: listener => useSpotifyPlaybackModeStore.subscribe(listener),
    albumKey: song => {
        const ref = song.album.catalogRef;
        return song.sourceRef?.kind === 'online' && song.sourceRef.providerId === 'spotify'
            && ref?.providerId === 'spotify' && ref.kind === 'album' && ref.id
            ? `spotify:album:${ref.id}` : null;
    },
    loadAlbum: loadSpotifyJourneyAlbum,
    async analyseScore(song, input) {
        if (!spotifyImmersion.isReady()) return null;
        const measured = await analyseSpotifyScore(song, input);
        return measured ? { ...measured, evidence: { kind: 'online-stream-analysis', providerId: 'spotify', profileVersion: measured.profile.version }, motifSeedSalt: 'spotify-energy' } : null;
    },
};
