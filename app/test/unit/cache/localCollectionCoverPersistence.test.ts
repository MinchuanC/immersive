import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appDatabase } from '@/services/appDatabase';
import { clearBrowserCacheByCategory, clearCacheTables } from '@/services/repositories/cacheRepository';
import {
    cacheTableLocalCollectionCoverPersistence as persistence,
    createLocalCollectionCoverRegistry,
    LOCAL_COLLECTION_COVER_STORAGE_PREFIX,
    type LocalCollectionCoverRecord,
} from '@/library/core/collection/cover/localCollectionCovers.service';

// Custom collection images remain fixed across restarts and category cache clears.
const tables = ['api_cache', 'user_cache', 'media_cache', 'metadata_cache'];
const image = (value: string) => new Blob([value], { type: 'image/png' });
const registry = () => createLocalCollectionCoverRegistry({
    persistence,
    createUrl: vi.fn(() => 'blob:restarted-cover'),
    revokeUrl: vi.fn(),
});

beforeEach(async () => {
    await Promise.all(tables.map(name => appDatabase.table(name).clear()));
});

describe('custom collection cover persistence', () => {
    it('replaces the durable image bytes and loads the last cover into a fresh registry', async () => {
        const first = registry();
        await first.set('playlist:p', image('old'), 'upload');
        await first.set('playlist:p', image('replacement'), 'song');
        const stored = await appDatabase.api_cache.get(`${LOCAL_COLLECTION_COVER_STORAGE_PREFIX}playlist:p`);
        expect(await (stored?.data as LocalCollectionCoverRecord).blob.text()).toBe('replacement');
        expect(await persistence.readAll()).toHaveLength(1);
        const restarted = registry();
        await restarted.hydrate();
        expect(restarted.getSnapshot().get('playlist:p')).toBe('blob:restarted-cover');
        await restarted.clear('playlist:p');
        expect(await persistence.readAll()).toEqual([]);
        const cleared = registry();
        await cleared.hydrate();
        expect(cleared.getSnapshot().size).toBe(0);
    });

    it('survives every category cache clear and is removed by the full cache reset', async () => {
        await persistence.write({ key: 'album:a', blob: image('album'), origin: 'poster', updatedAt: 1 });
        for (const category of ['playlist', 'lyrics', 'cover', 'media', 'analysis'] as const) {
            await clearBrowserCacheByCategory(category);
        }
        expect(await persistence.readAll()).toHaveLength(1);
        await clearCacheTables();
        expect(await persistence.readAll()).toEqual([]);
    });

    it('ignores corrupt non-image and empty-image records', async () => {
        await appDatabase.api_cache.bulkPut([
            { key: `${LOCAL_COLLECTION_COVER_STORAGE_PREFIX}broken`, data: { key: 'broken', blob: 'file:///image.png' }, timestamp: 1 },
            { key: `${LOCAL_COLLECTION_COVER_STORAGE_PREFIX}empty`, data: { key: 'empty', blob: image('') }, timestamp: 1 },
        ]);
        expect(await persistence.readAll()).toEqual([]);
    });
});
