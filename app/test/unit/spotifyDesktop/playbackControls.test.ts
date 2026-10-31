import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAppOverlaysModel } from '@/components/app/overlays/buildAppOverlaysModel';
import type { UnifiedSong } from '@/types';

// Native Spotify queue commands stay available independently of the app's mixed queue.
const env = vi.hoisted(() => ({ ownsQueue: false }));
vi.mock('@/components/app/externalPlayback/externalPlaybackRuntime', () => ({ usesExternalQueue: (song: UnifiedSong) => song.sourceRef.kind === 'online' && !env.ownsQueue }));
const song: UnifiedSong = { id: 'external', name: 'Spotify track', artists: [], album: { id: '', name: '' }, durationMs: 120000, sourceRef: { kind: 'online', providerId: 'spotify', mediaId: 'external' } };
const local: UnifiedSong = { ...song, id: 'local', name: 'Local track', sourceRef: { kind: 'local', mediaId: 'local' } };
type Params = Parameters<typeof buildAppOverlaysModel>[0];
function controls(overrides: Partial<Params> = {}) {
    return buildAppOverlaysModel({ currentView: 'player', currentSong: song, playQueue: [],
        effectiveLoopMode: 'off', isFmMode: false, isNowPlayingStageActive: false, isNowPlayingControlDisabled: false,
        ...overrides,
    } as Params).floatingControls!.trackNavigation!;
}
beforeEach(() => { env.ownsQueue = false; });

describe('external native queue controls', () => {
    it('allows native Previous and Next without an app queue', () => {
        expect(controls()).toMatchObject({ canPrev: true, canNext: true, prevTitle: null, nextTitle: null });
    });

    it('does not label native commands with unrelated app queue titles', () => {
        expect(controls({ playQueue: [local, song, { ...local, id: 'other', name: 'Other local track' }] })).toMatchObject({
            canPrev: true, canNext: true, prevTitle: null, nextTitle: null,
        });
    });

    it('keeps the app queue boundaries and titles when the app owns mixed playback', () => {
        env.ownsQueue = true;
        expect(controls({ playQueue: [local, song] })).toMatchObject({ canPrev: true, canNext: false, prevTitle: 'Local track', nextTitle: null });
    });

    it('keeps local and stage controls subject to their existing availability rules', () => {
        expect(controls({ currentSong: local })).toMatchObject({ canPrev: false, canNext: false });
        expect(controls({ isNowPlayingStageActive: true })).toMatchObject({ canPrev: false, canNext: false });
        expect(controls({ isNowPlayingControlDisabled: true })).toMatchObject({ canPrev: false, canNext: false });
    });
});
