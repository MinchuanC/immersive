import { describe, expect, it, vi } from 'vitest';
import { collectionPlaybackContext } from '@/library/app/collectionPlaybackContext';
import type { CollectionResourceSnapshot } from '@/library/core/shared/resource.contract';
import type { SongResult } from '@/types';

// Filtered, incomplete and mixed scopes must keep the app's explicit queue semantics.
vi.mock('@/services/onlineMusic/omni', () => ({ omni: { hasExternalPlayback: () => true } }));
const collection = { source: 'online', providerId: 'spotify', type: 'playlist', id: 'a'.repeat(22), name: 'Games' } as const;
const tracks: SongResult[] = ['b', 'c'].map(id => ({ id: id.repeat(22), name: id, artists: [], album: { id: '', name: '' }, durationMs: 1000, sourceRef: { kind: 'online', providerId: 'spotify', mediaId: id.repeat(22) } }));
const ready = { key: 'games', kind: 'online', revision: '', status: 'ready', tracks, error: null, sync: { status: 'none' }, detail: null, hint: 'urgent', generation: 1 } as const satisfies CollectionResourceSnapshot;
describe('native collection scope validation', () => {
    it('uses an actual complete playlist or album as native context', () => {
        expect(collectionPlaybackContext(collection, ready, tracks)).toEqual({ providerId: 'spotify', type: 'playlist', id: collection.id });
        expect(collectionPlaybackContext({ ...collection, type: 'album' }, ready, tracks)?.type).toBe('album');
    });
    it('rejects filtered, partial, reordered and mixed scopes', () => {
        expect(collectionPlaybackContext(collection, ready, tracks, 'b')).toBeUndefined();
        expect(collectionPlaybackContext(collection, ready, tracks.slice(0, 1))).toBeUndefined();
        expect(collectionPlaybackContext(collection, ready, [...tracks].reverse())).toBeUndefined();
        const mixed = [tracks[0], { ...tracks[1], sourceRef: { kind: 'local' as const, mediaId: 'local' } }];
        expect(collectionPlaybackContext(collection, { ...ready, tracks: mixed }, mixed)).toBeUndefined();
    });
    it('rejects loading, interrupted and unsupported collections', () => {
        expect(collectionPlaybackContext(collection, { ...ready, status: 'loading' }, tracks)).toBeUndefined();
        expect(collectionPlaybackContext(collection, { ...ready, sync: { status: 'syncing' } }, tracks)).toBeUndefined();
        expect(collectionPlaybackContext({ ...collection, type: 'artist' }, ready, tracks)).toBeUndefined();
        expect(collectionPlaybackContext(null, ready, tracks)).toBeUndefined();
        expect(collectionPlaybackContext({ ...collection, id: 'liked', isLiked: true }, ready, tracks)).toBeUndefined();
    });
});
