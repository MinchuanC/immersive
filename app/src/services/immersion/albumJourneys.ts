import type { LocalSong, SongResult } from '../../types';
import type { AlbumJourney, ImmersionAlbum } from '../../types/immersion';
import { getPlaybackSongKey } from '../../utils/appPlaybackGuards';
import { buildLocalLibraryIndex, followEntityRedirect } from '../../utils/localLibraryIndex';
import { buildUnifiedLocalSong, type LocalLibraryDisplayCatalog } from '../playbackAdapters';

// Builds album journeys from canonical local releases and acknowledges actual playback progress.
export const buildImmersionAlbums = (
    localSongs: LocalSong[],
    catalog: LocalLibraryDisplayCatalog,
): ImmersionAlbum[] => {
    const index = buildLocalLibraryIndex(catalog.entities, catalog.assignments);
    const songsByAlbum = new Map<string, LocalSong[]>();
    localSongs.forEach(song => {
        const albumId = index.assignmentsBySongId.get(song.id)?.albumEntityId;
        const activeId = albumId ? followEntityRedirect(albumId, index.entitiesById) : undefined;
        const entity = activeId ? index.entitiesById.get(activeId) : undefined;
        if (!entity || entity.kind !== 'album' || entity.mergedInto) return;
        const songs = songsByAlbum.get(entity.id) || [];
        songs.push(song);
        songsByAlbum.set(entity.id, songs);
    });

    return catalog.entities.flatMap(entity => {
        const songs = songsByAlbum.get(entity.id);
        if (entity.kind !== 'album' || entity.mergedInto || !songs?.length) return [];
        songs.sort((left, right) => (
            (left.discNumber ?? 1) - (right.discNumber ?? 1)
            || (left.trackNumber ?? Number.MAX_SAFE_INTEGER) - (right.trackNumber ?? Number.MAX_SAFE_INTEGER)
        ));
        return [{
            key: entity.id,
            name: entity.displayName,
            tracks: songs.map(song => ({
                songId: song.id,
                trackKey: getPlaybackSongKey(buildUnifiedLocalSong({
                    localSong: song,
                    matchedSong: null,
                    coverUrl: null,
                    preferOnlineMetadata: false,
                })),
                title: song.title,
                durationSec: song.duration / 1_000,
            })),
        }];
    });
};

export const createAlbumJourney = (album: ImmersionAlbum): AlbumJourney => ({
    version: 1,
    albumKey: album.key,
    albumName: album.name,
    trackKeys: album.tracks.map(track => track.trackKey),
    index: -1,
    state: 'ready',
});

export const startAlbumJourney = (journey: AlbumJourney): AlbumJourney => (
    journey.state === 'ready'
        ? { ...journey, state: journey.trackKeys.length ? 'running' : 'interrupted' }
        : journey
);

export const observeJourneyTrack = (
    journey: AlbumJourney,
    trackKey: string | null,
    queueKeys?: string[],
): AlbumJourney => {
    if (journey.state !== 'running') return journey;
    if (queueKeys && (queueKeys.length !== journey.trackKeys.length
        || queueKeys.some((key, index) => key !== journey.trackKeys[index]))) {
        return { ...journey, state: 'interrupted' };
    }
    if (trackKey && trackKey === journey.trackKeys[journey.index]) return journey;
    if (trackKey && trackKey === journey.trackKeys[journey.index + 1]) {
        return { ...journey, index: journey.index + 1 };
    }
    return { ...journey, state: 'interrupted' };
};

export const completeAlbumJourney = (journey: AlbumJourney, endedTrackKey: string): AlbumJourney => (
    journey.state === 'running'
    && journey.index >= 0
    && journey.index === journey.trackKeys.length - 1
    && journey.trackKeys[journey.index] === endedTrackKey
        ? { ...journey, state: 'completed' }
        : journey
);
