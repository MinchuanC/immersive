import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongResult } from '@/types';
import { makeProfile } from '../automix/trackProfileFixture';

// Recording-bound cues must replay identically, including after a seek.
const analysis = vi.hoisted(() => ({
    ensureTrackProfile: vi.fn(async () => {}),
    profilesSettled: vi.fn(async () => {}),
    getTrackProfile: vi.fn(),
}));

vi.mock('@/services/automix/profileService', () => analysis);

const { buildSongScore, evaluateSongScore, loadSongScore } = await import('@/services/immersion/songScore');

const song: SongResult = {
    id: 'recording-a',
    name: 'Recording A',
    artists: [],
    album: { id: 'album-a', name: 'Album A' },
    durationMs: 120_000,
    sourceRef: { kind: 'local', mediaId: 'recording-a' },
};
const profile = makeProfile({ duration: 120, leadIn: 4, sections: [20, 40, 60, 80], bodyOut: 12, leadOut: 2 });

describe('Song Score', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        analysis.ensureTrackProfile.mockResolvedValue(undefined);
        analysis.getTrackProfile.mockReturnValue(profile);
    });

    it('keeps measured boundaries, recording identity, and recurring visual motifs deterministic', () => {
        const score = buildSongScore('local:recording-a', profile)!;
        expect(score).toEqual(buildSongScore('local:recording-a', profile));
        expect(score).toMatchObject({ version: 1, trackKey: 'local:recording-a', durationSec: 120,
            evidence: { kind: 'local-analysis', profileVersion: profile.version } });
        expect(score.seed).not.toBe(buildSongScore('local:recording-b', profile)!.seed);
        expect(score.cues.map(cue => cue.atSec)).toEqual([0, 4, 20, 40, 60, 80, 108, 118, 120]);
        expect(score.cues.find(cue => cue.atSec === 20)?.motif).toBe(score.cues.find(cue => cue.atSec === 80)?.motif);
        expect(score.cues.find(cue => cue.atSec === 20)?.recipe).toEqual(score.cues.find(cue => cue.atSec === 80)?.recipe);
    });

    it('interpolates from playback position with quiet measured ends and bounded recipes', () => {
        const score = buildSongScore('local:recording-a', profile)!;
        const at = (positionSec: number) => evaluateSongScore(score, positionSec);
        expect(at(-1)).toEqual(at(0));
        expect(at(999)).toEqual(at(120));
        expect(at(0).intensity).toBeLessThan(at(4).intensity);
        expect(at(118).sonicGroundGlow).toBeLessThan(at(108).sonicGroundGlow);
        const before = at(40);
        const after = at(60);
        expect(at(50).intensity).toBeCloseTo((before.intensity + after.intensity) / 2);
        expect(at(50)).toEqual(at(50));
        for (let position = 0; position <= 120; position += 0.5) {
            const recipe = at(position);
            expect(recipe.intensity).toBeGreaterThanOrEqual(0.1);
            expect(recipe.intensity).toBeLessThanOrEqual(1.5);
            for (const key of ['sonicGroundAmplitude', 'sonicGroundMotionSpeed', 'sonicGroundGlow'] as const) {
                expect(recipe[key]).toBeGreaterThanOrEqual(0);
                expect(recipe[key]).toBeLessThanOrEqual(100);
            }
        }
    });

    it('shares an album motif family while keeping each recording identity', async () => {
        const first = buildSongScore('local:recording-a', profile, 'album:journey')!;
        const second = buildSongScore('local:recording-b', profile, 'album:journey')!;
        expect(first.trackKey).toBe('local:recording-a');
        expect(second.trackKey).toBe('local:recording-b');
        expect(first.seed).toBe(second.seed);
        expect(first.cues.map(cue => cue.recipe)).toEqual(second.cues.map(cue => cue.recipe));
        expect(buildSongScore('local:recording-a', profile)!.seed).not.toBe(buildSongScore('local:recording-b', profile)!.seed);
        expect(await loadSongScore(song, 'album:journey')).toEqual(first);
    });

    it('declines incomplete or invalid analysis and normalizes only measured boundaries', () => {
        expect(buildSongScore('local:a', makeProfile({ partial: true }))).toBeNull();
        expect(buildSongScore('local:a', makeProfile({ duration: NaN }))).toBeNull();
        expect(buildSongScore('local:a', makeProfile({ bodyOut: null }))).toBeNull();
        const score = buildSongScore('local:a', makeProfile({ duration: 10, sections: [8, 3, 3, -1, 11, NaN] }))!;
        expect(score.cues.map(cue => cue.atSec)).toEqual([0, 3, 8, 10]);
    });

    it('loads local analysis without enabling a beat model or caching song audio', async () => {
        expect(await loadSongScore(song)).toEqual(buildSongScore('local:recording-a', profile));
        expect(analysis.ensureTrackProfile).toHaveBeenCalledWith({ song, wantGrid: false, enableMediaCache: false });
        expect(analysis.profilesSettled).toHaveBeenCalledOnce();
        expect(analysis.getTrackProfile).toHaveBeenCalledWith(song);
    });

    it('does not analyse remote tracks or manufacture scores when analysis is unavailable', async () => {
        const online = { ...song, sourceRef: { kind: 'online' as const, providerId: 'netease' as const, mediaId: 'a' } };
        expect(await loadSongScore(online)).toBeNull();
        expect(analysis.ensureTrackProfile).not.toHaveBeenCalled();
        analysis.getTrackProfile.mockReturnValue(null);
        expect(await loadSongScore(song)).toBeNull();
        analysis.ensureTrackProfile.mockRejectedValueOnce(new Error('file not available'));
        await expect(loadSongScore(song)).resolves.toBeNull();
    });
});
