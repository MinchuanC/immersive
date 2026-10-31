import type { SongResult } from '../../types';
import type { ImmersionRecipe, ScoreCue, SongScore } from '../../types/immersion';
import { getPlaybackSongKey, getPlaybackSourceRef } from '../../utils/appPlaybackGuards';
import { ensureTrackProfile, getTrackProfile, profilesSettled } from '../automix/profileService';
import type { TrackProfile } from '../automix/trackProfile';
import { getPlaybackAnalysisKey } from '../playbackRecovery/representationRegistry';
import { getOnlineMusicProviderForSong } from '../onlineMusic/providerRegistry';

// Turns measured local recording boundaries into a repeatable visual score.
const quiet: ImmersionRecipe = {
    intensity: 0.1, sonicGroundAmplitude: 0, sonicGroundMotionSpeed: 0, sonicGroundGlow: 0,
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const mix = (from: ImmersionRecipe, to: ImmersionRecipe, amount: number): ImmersionRecipe => ({
    intensity: clamp(from.intensity + (to.intensity - from.intensity) * amount, 0.1, 1.5),
    sonicGroundAmplitude: clamp(from.sonicGroundAmplitude + (to.sonicGroundAmplitude - from.sonicGroundAmplitude) * amount, 0, 100),
    sonicGroundMotionSpeed: clamp(from.sonicGroundMotionSpeed + (to.sonicGroundMotionSpeed - from.sonicGroundMotionSpeed) * amount, 0, 100),
    sonicGroundGlow: clamp(from.sonicGroundGlow + (to.sonicGroundGlow - from.sonicGroundGlow) * amount, 0, 100),
});

const seedOf = (trackKey: string): number => {
    let seed = 2166136261;
    for (let index = 0; index < trackKey.length; index += 1) seed = Math.imul(seed ^ trackKey.charCodeAt(index), 16777619);
    return seed >>> 0;
};

export const buildSongScore = (trackKey: string, profile: TrackProfile, seedKey: string = trackKey): SongScore | null => {
    const { duration, leadIn, leadOut, bodyOut } = profile;
    if (profile.partial !== false || !Number.isFinite(duration) || duration <= 0
        || !Number.isFinite(leadIn) || leadIn < 0 || leadIn > duration
        || leadOut === null || !Number.isFinite(leadOut) || leadOut < 0 || leadOut > duration
        || bodyOut === null || !Number.isFinite(bodyOut) || bodyOut < leadOut || bodyOut > duration
        || !Array.isArray(profile.sections)) return null;

    const seed = seedOf(seedKey);
    const boundaries = [...new Set(profile.sections.filter(at => Number.isFinite(at) && at > 0 && at < duration))].sort((a, b) => a - b);
    const bodyEnd = duration - bodyOut;
    const soundingEnd = duration - leadOut;
    const times = [...new Set([0, leadIn, ...boundaries, bodyEnd, soundingEnd, duration])].sort((a, b) => a - b);
    // Motifs are artistic recurrence at measured seams; the analysis does not label verse or chorus.
    const motifs = [0, 1, 2].map(motif => {
        const value = seedOf(`${seed}:${motif}`);
        return {
            intensity: 0.55 + (value & 255) / 255 * 0.65,
            sonicGroundAmplitude: 25 + ((value >>> 8) & 255) / 255 * 55,
            sonicGroundMotionSpeed: 20 + ((value >>> 16) & 255) / 255 * 55,
            sonicGroundGlow: 25 + ((value >>> 24) & 255) / 255 * 60,
        };
    });
    return {
        version: 1,
        trackKey,
        durationSec: duration,
        seed,
        evidence: { kind: 'local-analysis', profileVersion: profile.version },
        cues: times.map(atSec => {
            const motif = boundaries.filter(at => at <= Math.min(atSec, bodyEnd)).length % motifs.length;
            const intro = leadIn > 0 ? clamp(atSec / leadIn, 0, 1) : 1;
            const outro = bodyOut > 0 && atSec > bodyEnd
                ? clamp((soundingEnd - atSec) / Math.max(soundingEnd - bodyEnd, Number.EPSILON), 0, 1) : 1;
            return { atSec, motif, recipe: mix(quiet, motifs[motif], Math.min(intro, outro)) };
        }),
    };
};

// Evaluating the timeline directly makes seeks and replay independent of animation history.
export const evaluateSongScore = (score: SongScore, positionSec: number): ImmersionRecipe => {
    const first = score.cues[0];
    if (!first) return { ...quiet };
    const position = Number.isFinite(positionSec) ? clamp(positionSec, 0, score.durationSec) : 0;
    for (let index = 1; index < score.cues.length; index += 1) {
        const to = score.cues[index];
        if (position > to.atSec) continue;
        const from = score.cues[index - 1];
        const progress = clamp((position - from.atSec) / (to.atSec - from.atSec), 0, 1);
        return mix(from.recipe, to.recipe, progress * progress * (3 - 2 * progress));
    }
    return { ...score.cues[score.cues.length - 1].recipe };
};

export const loadSongScore = async (song: SongResult, seedKey?: string, input?: { audioSrc: string | null; signal?: AbortSignal }): Promise<SongScore | null> => {
    const source = getPlaybackSourceRef(song);
    if (source.kind === 'online' && input) {
        const measured = await getOnlineMusicProviderForSong(song)?.immersion?.analyseScore(song, input);
        if (!measured) return null;
        const score = buildSongScore(getPlaybackSongKey(song), measured.profile, seedKey);
        if (!score) return null;
        // Add measured-energy samples where novelty finds few boundaries; these are not section labels.
        const sectionTimes = new Set(measured.profile.sections);
        const timeline: ScoreCue[] = score.cues.map(cue => ({ ...cue, source: sectionTimes.has(cue.atSec) ? 'section' as const : 'edge' as const }));
        const interval = Math.max(2, Math.min(10, score.durationSec / 6));
        for (let atSec = interval; atSec < score.durationSec; atSec += interval) {
            if (!timeline.some(cue => cue.atSec === atSec)) timeline.push({ atSec, motif: 0, recipe: quiet, source: 'energy' });
        }
        timeline.sort((a, b) => a.atSec - b.atSec);
        // Measured loudness guides the look; similar energy is not a claim that sections repeat.
        const energies = timeline.map((cue, index) => {
            const start = Math.floor(cue.atSec);
            const end = Math.max(start + 1, Math.ceil(timeline[index + 1]?.atSec ?? cue.atSec + 1));
            const values = measured.energy.slice(start, end);
            return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
        });
        const loudest = Math.max(...energies);
        const quietest = Math.min(...energies.filter(value => value > 0), loudest);
        const spread = loudest - quietest;
        const cues = timeline.map((cue, index) => {
            const energy = energies[index];
            const level = energy < 0.00001 ? 0 : spread > 0.00001 ? clamp((energy - quietest) / spread, 0, 1) : 0.5;
            const motif = level < 1 / 3 ? 0 : level < 2 / 3 ? 1 : 2;
            const value = seedOf(`${score.seed}:${measured.motifSeedSalt}:${motif}`);
            const look: ImmersionRecipe = {
                intensity: 0.75 + (score.seed & 255) / 255 * 0.5,
                sonicGroundAmplitude: 25 + ((value >>> 8) & 255) / 255 * 55,
                sonicGroundMotionSpeed: 20 + ((value >>> 16) & 255) / 255 * 55,
                sonicGroundGlow: 25 + ((value >>> 24) & 255) / 255 * 60,
            };
            const recipe = mix(quiet, look, 0.25 + level * 0.75);
            // The scene evaluates phase from absolute time, so changing speed would jump its motion.
            recipe.sonicGroundMotionSpeed = 20 + ((score.seed >>> 16) & 255) / 255 * 55;
            return { ...cue, motif, recipe };
        });
        return { ...score, evidence: measured.evidence, cues };
    }
    if (source.kind !== 'local') return null;
    try {
        const analysisKey = getPlaybackAnalysisKey(song);
        await ensureTrackProfile({ song, wantGrid: false, enableMediaCache: false });
        await profilesSettled();
        if (getPlaybackAnalysisKey(song) !== analysisKey) return null;
        const profile = getTrackProfile(song);
        return profile ? buildSongScore(getPlaybackSongKey(song), profile, seedKey) : null;
    } catch {
        return null;
    }
};
