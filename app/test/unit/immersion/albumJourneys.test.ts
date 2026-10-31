import { describe, expect, it } from 'vitest';
import type { LocalSong } from '../../../src/types';
import type { ImmersionAlbum } from '../../../src/types/immersion';
import type { LocalLibraryAssignment, LocalLibraryEntity } from '../../../src/types/localLibrary';
import {
    buildImmersionAlbums,
    completeAlbumJourney,
    createAlbumJourney,
    observeJourneyTrack,
    startAlbumJourney,
} from '../../../src/services/immersion/albumJourneys';

// Verifies album identities, original track order, and playback-driven journey progress.
const song = (id: string, patch: Partial<LocalSong> = {}): LocalSong => ({
    id,
    title: id,
    titleOrigin: 'import',
    importedMetadata: { title: id, titleSource: 'embedded', artistNames: [], albumName: 'Tag name' },
    fileName: `${id}.flac`,
    filePath: `/music/${id}.flac`,
    duration: 123_500,
    fileSize: 1_024,
    mimeType: 'audio/flac',
    addedAt: 1,
    ...patch,
});

const entity = (id: string, patch: Partial<LocalLibraryEntity> = {}): LocalLibraryEntity => ({
    id,
    kind: 'album',
    displayName: 'Same title',
    aliases: [],
    normalizedAliases: [],
    createdAt: 1,
    updatedAt: 1,
    ...patch,
});

const assignment = (songId: string, albumEntityId?: string): LocalLibraryAssignment => ({
    songId,
    albumEntityId,
    albumOrigin: 'import',
    artistEntityIds: [],
    artistOrigin: 'import',
    updatedAt: 1,
});

const album: ImmersionAlbum = {
    key: 'album-id',
    name: 'Release',
    tracks: ['one', 'two', 'three'].map(id => ({
        songId: id,
        trackKey: `local:${id}`,
        title: id,
        durationSec: 123.5,
    })),
};

describe('buildImmersionAlbums', () => {
    it('keeps same-named album entities separate and uses local playback identities', () => {
        const albums = buildImmersionAlbums([song('one'), song('two')], {
            entities: [entity('release-a'), entity('release-b')],
            assignments: [assignment('one', 'release-a'), assignment('two', 'release-b')],
        });

        expect(albums).toEqual([
            { key: 'release-a', name: 'Same title', tracks: [{ songId: 'one', trackKey: 'local:one', title: 'one', durationSec: 123.5 }] },
            { key: 'release-b', name: 'Same title', tracks: [{ songId: 'two', trackKey: 'local:two', title: 'two', durationSec: 123.5 }] },
        ]);
    });

    it('sorts by disc and track number with stable input order for ties and missing numbers', () => {
        const songs = [
            song('disc-two', { discNumber: 2, trackNumber: 1 }),
            song('second-b', { trackNumber: 2 }),
            song('z-untracked'),
            song('first', { discNumber: 1, trackNumber: 1 }),
            song('second-a', { discNumber: 1, trackNumber: 2 }),
            song('a-untracked'),
        ];
        const [result] = buildImmersionAlbums(songs, {
            entities: [entity('release')],
            assignments: songs.map(track => assignment(track.id, 'release')),
        });

        expect(result.tracks.map(track => track.songId)).toEqual([
            'first', 'second-b', 'second-a', 'z-untracked', 'a-untracked', 'disc-two',
        ]);
        expect(songs.map(track => track.id)).toEqual([
            'disc-two', 'second-b', 'z-untracked', 'first', 'second-a', 'a-untracked',
        ]);
    });

    it('follows merged assignments but excludes merged, empty, orphan, and non-album entities', () => {
        const albums = buildImmersionAlbums([song('merged'), song('orphan'), song('artist'), song('untagged')], {
            entities: [
                entity('old', { mergedInto: 'active' }),
                entity('active'),
                entity('empty'),
                entity('artist', { kind: 'artist' }),
            ],
            assignments: [assignment('merged', 'old'), assignment('orphan', 'missing'), assignment('artist', 'artist')],
        });

        expect(albums.map(result => ({ key: result.key, tracks: result.tracks.map(track => track.songId) })))
            .toEqual([{ key: 'active', tracks: ['merged'] }]);
    });
});

describe('album journey lifecycle', () => {
    it('starts ready and advances only when the expected playback track is acknowledged', () => {
        const ready = createAlbumJourney(album);
        const running = startAlbumJourney(ready);
        const first = observeJourneyTrack(running, 'local:one', ['local:one', 'local:two', 'local:three']);
        const second = observeJourneyTrack(first, 'local:two');

        expect(ready).toEqual({ version: 1, albumKey: 'album-id', albumName: 'Release', trackKeys: ['local:one', 'local:two', 'local:three'], index: -1, state: 'ready' });
        expect(running.state).toBe('running');
        expect(running.index).toBe(-1);
        expect(first.index).toBe(0);
        expect(second.index).toBe(1);
        expect(second.state).toBe('running');
        expect(ready.index).toBe(-1);
    });

    it('keeps paused or repeated observations on the same track unchanged', () => {
        const running = observeJourneyTrack(startAlbumJourney(createAlbumJourney(album)), 'local:one');

        expect(observeJourneyTrack(running, 'local:one')).toBe(running);
        expect(completeAlbumJourney(running, 'local:one')).toBe(running);
    });

    it.each(['local:three', 'online:spotify:one', '', null])('interrupts an outside or skipped track %s', trackKey => {
        const running = observeJourneyTrack(startAlbumJourney(createAlbumJourney(album)), 'local:one');
        const interrupted = observeJourneyTrack(running, trackKey);

        expect(interrupted.state).toBe('interrupted');
        expect(interrupted.index).toBe(0);
        expect(observeJourneyTrack(interrupted, 'local:two')).toBe(interrupted);
    });

    it('interrupts backward playback within the album', () => {
        const first = observeJourneyTrack(startAlbumJourney(createAlbumJourney(album)), 'local:one');
        const second = observeJourneyTrack(first, 'local:two');

        expect(observeJourneyTrack(second, 'local:one').state).toBe('interrupted');
    });

    it.each([
        { queueKeys: [] },
        { queueKeys: ['local:one', 'local:two'] },
        { queueKeys: ['local:one', 'local:three', 'local:two'] },
        { queueKeys: ['local:one', 'local:two', 'local:three', 'local:outside'] },
    ])('interrupts a replaced or reordered queue $queueKeys', ({ queueKeys }) => {
        const running = observeJourneyTrack(startAlbumJourney(createAlbumJourney(album)), 'local:one');

        expect(observeJourneyTrack(running, 'local:one', queueKeys).state).toBe('interrupted');
    });

    it('requires a matching ended event after acknowledging the final track', () => {
        let running = startAlbumJourney(createAlbumJourney(album));
        running = observeJourneyTrack(running, 'local:one');
        expect(completeAlbumJourney(running, 'local:three')).toBe(running);
        running = observeJourneyTrack(running, 'local:two');
        running = observeJourneyTrack(running, 'local:three');

        expect(running.state).toBe('running');
        expect(completeAlbumJourney(running, 'local:two')).toBe(running);
        const completed = completeAlbumJourney(running, 'local:three');
        expect(completed.state).toBe('completed');
        expect(observeJourneyTrack(completed, 'local:one')).toBe(completed);
    });

    it('rejects stale ending events before the first track is acknowledged', () => {
        const single = { ...album, tracks: [album.tracks[0]] };
        const ready = createAlbumJourney(single);
        const running = startAlbumJourney(ready);

        expect(completeAlbumJourney(ready, 'local:one')).toBe(ready);
        expect(completeAlbumJourney(running, 'local:one')).toBe(running);
        const acknowledged = observeJourneyTrack(running, 'local:one');
        expect(completeAlbumJourney(acknowledged, 'local:one').state).toBe('completed');
    });

    it('cannot complete an interrupted journey or start an empty album', () => {
        const running = startAlbumJourney(createAlbumJourney(album));
        const interrupted = observeJourneyTrack(running, 'local:outside');

        expect(completeAlbumJourney(interrupted, 'local:three')).toBe(interrupted);
        expect(startAlbumJourney(createAlbumJourney({ ...album, tracks: [] })).state).toBe('interrupted');
    });
});
