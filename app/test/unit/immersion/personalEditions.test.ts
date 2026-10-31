import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDatabase, appDatabase } from '@/services/appDatabase';
import { clearBrowserCacheByCategory, clearCacheTables } from '@/services/repositories/cacheRepository';
import { deleteEditionCue, evaluateEditionRecipe, getPersonalEdition, saveEditionCue } from '@/services/immersion/personalEditions';
import type { EditionCue, ImmersionRecipe, PersonalEdition } from '@/types/immersion';

// Authored editions survive database upgrades and disposable cache cleanup.
const albumKey = 'local-album:one';
const recipe: ImmersionRecipe = { intensity: 0.8, sonicGroundAmplitude: 50, sonicGroundMotionSpeed: 40, sonicGroundGlow: 20 };
const cue = (overrides: Partial<EditionCue> = {}): EditionCue => ({
    id: 'look-one', trackKey: 'local:recording-one', atSec: 10, kind: 'look', label: 'Quiet light', recipe, ...overrides,
});
const edition = (cues: EditionCue[]): PersonalEdition => ({
    version: 1, id: albumKey, albumKey, albumName: 'One', scoreVersion: 1, updatedAt: 1, cues,
});

beforeEach(async () => {
    await appDatabase.open();
    await appDatabase.personal_editions.clear();
});

afterEach(() => { vi.restoreAllMocks(); });

describe('personal edition persistence', () => {
    it('saves one edition per album and reloads it through a fresh database connection', async () => {
        const saved = await saveEditionCue(albumKey, 'One', cue({ seed: 19 }));
        appDatabase.close();
        const reopened = new AppDatabase(appDatabase.name);
        try {
            await reopened.open();
            expect(await reopened.personal_editions.get(albumKey)).toEqual(saved);
        } finally {
            reopened.close();
            await appDatabase.open();
        }
        expect(await getPersonalEdition(albumKey)).toEqual(saved);
        expect(saved).toMatchObject({ id: albumKey, albumKey, version: 1, scoreVersion: 1, cues: [{ seed: 19 }] });
        expect(await getPersonalEdition('local-album:missing')).toBeNull();
    });

    it('survives all cache categories and full cache clear', async () => {
        const saved = await saveEditionCue(albumKey, 'One', cue());
        await appDatabase.metadata_cache.put({ key: 'automix_profile_recording', data: 'disposable', timestamp: 1 });
        for (const category of ['playlist', 'lyrics', 'cover', 'media', 'analysis'] as const) {
            await clearBrowserCacheByCategory(category);
        }
        await clearCacheTables();
        expect(await getPersonalEdition(albumKey)).toEqual(saved);
        expect(await appDatabase.metadata_cache.count()).toBe(0);
    });

    it('adds the v1.0 table while preserving every v0.9 store', async () => {
        const name = `personal-editions-v09-${crypto.randomUUID()}`;
        const legacy = new Dexie(name);
        legacy.version(0.9).stores({
            session: '', api_cache: 'key', user_cache: 'key', media_cache: 'key', metadata_cache: 'key',
            local_music: 'id, localCoverAssetId', theme_registry: 'fingerprint',
            local_library_entities: 'id, kind, *normalizedAliases, mergedInto, needsReview, createdAt',
            local_library_assignments: 'songId, *artistEntityIds, albumEntityId, artistOrigin, albumOrigin', local_cover_assets: 'id',
        });
        await legacy.open();
        const records: Record<string, unknown> = {
            api_cache: { key: 'last_song', data: { id: 'song' }, timestamp: 1 },
            user_cache: { key: 'user', data: { name: 'Listener' }, timestamp: 2 },
            media_cache: { key: 'audio_song', data: new Blob(['audio']), timestamp: 3 },
            metadata_cache: { key: 'lyric_song', data: 'lyric', timestamp: 4 },
            local_music: { id: 'song', localCoverAssetId: 'cover', title: 'Original' },
            theme_registry: { fingerprint: 'theme', cacheKey: 'theme_1' },
            local_library_entities: { id: 'album', kind: 'album', normalizedAliases: ['one'] },
            local_library_assignments: { songId: 'song', albumEntityId: 'album' },
            local_cover_assets: { id: 'cover', blob: new Blob(['image'], { type: 'image/png' }) },
        };
        await legacy.table('session').put('song.flac', 'fileName');
        for (const [table, record] of Object.entries(records)) await legacy.table(table).put(record);
        legacy.close();
        const upgraded = new AppDatabase(name);
        try {
            await upgraded.open();
            expect(upgraded.verno).toBe(1);
            expect(await upgraded.session.get('fileName')).toBe('song.flac');
            for (const [table, record] of Object.entries(records)) {
                expect(await upgraded.table(table).toArray()).toEqual([record]);
            }
            expect(await upgraded.personal_editions.count()).toBe(0);
        } finally {
            upgraded.close();
            await Dexie.delete(name);
        }
    });

    it('serializes concurrent saves without losing cues', async () => {
        await Promise.all(Array.from({ length: 8 }, (_, index) => saveEditionCue(albumKey, 'One', cue({
            id: `bookmark-${index}`, atSec: index, kind: 'bookmark', recipe: undefined,
        }))));
        expect((await getPersonalEdition(albumKey))?.cues).toHaveLength(8);
    });

    it('replaces only a look at the same recording and position, preserving bookmarks', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(100);
        await saveEditionCue(albumKey, 'One', cue());
        await saveEditionCue(albumKey, 'One', cue({ id: 'bookmark', kind: 'bookmark', recipe: undefined }));
        await saveEditionCue(albumKey, 'One', cue({ id: 'other-recording', trackKey: 'local:recording-two' }));
        const saved = await saveEditionCue(albumKey, 'Renamed', cue({ id: 'replacement', recipe: { ...recipe, intensity: 1.2 } }));
        expect(saved.cues.map(item => item.id)).toEqual(['bookmark', 'other-recording', 'replacement']);
        expect(saved.updatedAt).toBe(103);
        expect(saved.albumName).toBe('Renamed');
        expect(await appDatabase.personal_editions.count()).toBe(1);
        await expect(saveEditionCue(albumKey, 'One', cue({ id: 'bookmark' }))).rejects.toThrow();
        expect(await getPersonalEdition(albumKey)).toEqual(saved);
    });

    it('deletes a cue without losing other cues, and keeps an empty authored edition', async () => {
        await saveEditionCue(albumKey, 'One', cue());
        await saveEditionCue(albumKey, 'One', cue({ id: 'bookmark', kind: 'bookmark', recipe: undefined }));
        expect((await deleteEditionCue(albumKey, 'look-one'))?.cues.map(item => item.id)).toEqual(['bookmark']);
        expect((await deleteEditionCue(albumKey, 'bookmark'))?.cues).toEqual([]);
        const empty = await getPersonalEdition(albumKey);
        expect(await deleteEditionCue(albumKey, 'missing')).toEqual(empty);
        expect(await deleteEditionCue('missing', 'missing')).toBeNull();
    });

    it.each([
        { trackKey: '' }, { trackKey: '  ' }, { atSec: -1 }, { atSec: NaN }, { atSec: Infinity },
        { recipe: undefined }, { recipe: { ...recipe, intensity: 0.09 } }, { recipe: { ...recipe, intensity: 1.51 } },
        { recipe: { ...recipe, sonicGroundAmplitude: -1 } }, { recipe: { ...recipe, sonicGroundMotionSpeed: 101 } },
        { recipe: { ...recipe, sonicGroundGlow: Infinity } }, { seed: NaN },
        { recipe: { ...recipe, futureShader: 99 } as ImmersionRecipe },
    ])('rejects invalid authored cue %j without writing', async invalid => {
        await expect(saveEditionCue(albumKey, 'One', cue(invalid))).rejects.toThrow();
        expect(await getPersonalEdition(albumKey)).toBeNull();
    });

    it('stores only recording references and authored fields, excluding untyped payloads', async () => {
        const saved = await saveEditionCue(albumKey, 'One', { ...cue(), audio: new Blob(['raw']), lyrics: 'copied text' } as EditionCue);
        expect(saved.cues[0]).toEqual(cue());
        expect((await getPersonalEdition(albumKey))?.cues[0]).toEqual(cue());
    });

    it('preserves incompatible editions and blocks an overwrite', async () => {
        const future = { ...edition([cue()]), version: 2, future: { scene: 'new' } };
        await appDatabase.personal_editions.put(future as unknown as PersonalEdition);
        expect(await getPersonalEdition(albumKey)).toEqual(future);
        expect(evaluateEditionRecipe(future as unknown as PersonalEdition, 'local:recording-one', 20)).toBeNull();
        await expect(saveEditionCue(albumKey, 'One', cue({ id: 'new' }))).rejects.toThrow(/version/i);
        await expect(deleteEditionCue(albumKey, 'look-one')).rejects.toThrow(/version/i);
        expect(await getPersonalEdition(albumKey)).toEqual(future);
    });
});

describe('personal edition playback direction', () => {
    it('selects the latest look at or before a seek, independent of insertion order and other recordings', () => {
        const later = { ...recipe, intensity: 1.3 };
        const saved = edition([cue({ id: 'later', atSec: 30, recipe: later }), cue(), cue({ id: 'other', trackKey: 'local:recording-two', atSec: 15 })]);
        expect(evaluateEditionRecipe(saved, 'local:recording-one', 9)).toBeNull();
        expect(evaluateEditionRecipe(saved, 'local:recording-one', 10)).toEqual(recipe);
        expect(evaluateEditionRecipe(saved, 'local:recording-one', 30)).toEqual(later);
        expect(evaluateEditionRecipe(saved, 'local:recording-one', 20)).toEqual(recipe);
        expect(evaluateEditionRecipe(saved, 'local:recording-two', 14)).toBeNull();
        expect(evaluateEditionRecipe(saved, 'local:unrelated', 100)).toBeNull();
    });

    it('lets bookmarks preserve the active look and gives bookmark-only editions no direction', () => {
        const bookmark = cue({ id: 'bookmark', atSec: 20, kind: 'bookmark', recipe: undefined });
        expect(evaluateEditionRecipe(edition([cue(), bookmark]), 'local:recording-one', 25)).toEqual(recipe);
        expect(evaluateEditionRecipe(edition([bookmark]), 'local:recording-one', 25)).toBeNull();
    });

    it('does not apply unknown recipes or score versions and leaves them recoverable', async () => {
        const unknownRecipe = { ...recipe, futureShader: 99 };
        const saved = edition([cue(), cue({ id: 'future', atSec: 20, recipe: unknownRecipe })]);
        await appDatabase.personal_editions.put(saved);
        const loaded = await getPersonalEdition(albumKey);
        expect(loaded).toEqual(saved);
        expect(evaluateEditionRecipe(loaded, 'local:recording-one', 25)).toBeNull();
        expect(evaluateEditionRecipe({ ...saved, scoreVersion: 2 } as unknown as PersonalEdition, 'local:recording-one', 15)).toBeNull();
        await expect(saveEditionCue(albumKey, 'One', cue({ id: 'replacement', atSec: 20 }))).rejects.toThrow(/incompatible/i);
        expect(await getPersonalEdition(albumKey)).toEqual(saved);
        const bookmark = cue({ id: 'bookmark', kind: 'bookmark', recipe: undefined, atSec: 20 });
        expect((await saveEditionCue(albumKey, 'One', bookmark)).cues).toEqual([...saved.cues, bookmark]);
        expect((await deleteEditionCue(albumKey, 'future'))?.cues).toEqual([cue(), bookmark]);
    });

    it('returns no direction for missing editions or invalid playback position', () => {
        expect(evaluateEditionRecipe(null, 'local:recording-one', 20)).toBeNull();
        for (const position of [-1, NaN, Infinity]) expect(evaluateEditionRecipe(edition([cue()]), 'local:recording-one', position)).toBeNull();
    });
});
