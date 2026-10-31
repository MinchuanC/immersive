import { spectralFlux } from '../../services/automix/signalAnalysis';
import type { StageAudio } from './stageBridge';

// MineRadio alone converts the shared byte-scale analyser signals into bounded visual envelopes.
export interface MusicResponseInput {
    nowMs: number;
    position: number;
    trackKey: string;
    paused: boolean;
    audio: { bass: number; mid: number; treble: number; energy: number; beat?: number; spectrum: Uint8Array } | null;
}

const unit = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const byte = (value: number) => unit(value / 255);

// A new attack changes the spatial mapping; sustained sound and fading peaks keep their own slots.
export function createMusicResponse(): { update(input: MusicResponseInput): (StageAudio & { regions: number[] }) | null; reset(): void } {
    const average = new Float32Array(4);
    const baseline = new Float32Array(4);
    const regions = new Float32Array(16);
    let previous: Float32Array | null = null;
    let current = new Float32Array(0);
    let lastNow: number | null = null;
    let lastPosition = 0;
    let trackKey = '';
    let age = 0;
    let fluxAverage = 0;
    let livePulse = 0;
    let lastAttack = -Infinity;
    let previousBeat = 0;
    let analysedReady = false;
    let offset = 0;

    function reset() {
        average.fill(0);
        baseline.fill(0.08);
        regions.fill(0);
        previous = null;
        lastNow = null;
        age = fluxAverage = livePulse = previousBeat = offset = 0;
        lastAttack = -Infinity;
        analysedReady = false;
    }
    reset();

    function update(input: MusicResponseInput): (StageAudio & { regions: number[] }) | null {
        const audio = input.audio;
        if (input.paused || !audio?.spectrum.length || !Number.isFinite(input.nowMs) || !Number.isFinite(input.position)) {
            reset();
            return null;
        }
        const elapsed = lastNow === null ? 0 : (input.nowMs - lastNow) / 1000;
        if (lastNow !== null && (trackKey !== input.trackKey || elapsed < 0 || Math.abs(input.position - lastPosition - elapsed) > 0.35)) reset();
        const dt = lastNow === null ? 1 / 60 : elapsed;
        lastNow = input.nowMs;
        lastPosition = input.position;
        trackKey = input.trackKey;

        const fresh = previous === null || previous.length !== audio.spectrum.length;
        if (fresh) {
            previous = new Float32Array(audio.spectrum.length);
            current = new Float32Array(audio.spectrum.length);
            livePulse = fluxAverage = 0;
            regions.fill(0);
            offset = 0;
            previousBeat = unit(audio.beat ?? 0);
            analysedReady = previousBeat <= 0.05;
        }
        let magnitude = 0;
        let weighted = 0;
        let activeBins = 0;
        for (let index = 0; index < current.length; index++) {
            current[index] = byte(audio.spectrum[index]);
            magnitude += current[index];
            weighted += index * current[index];
            if (current[index] >= 0.008 || previous![index] >= 0.008) activeBins++;
        }
        const values = [byte(audio.bass), byte(audio.mid), byte(audio.treble), byte(audio.energy)];
        const silent = Math.max(...values, magnitude / current.length) < 0.008;
        // Compare a 60Hz-equivalent rise so cadence and empty FFT bins cannot change an attack's strength.
        const flux = fresh || silent || dt <= 0 ? 0 : spectralFlux(current, previous!, current.length) / (Math.max(16, activeBins) * dt * 60);
        const liveStrength = unit((flux - fluxAverage * 1.35 - 0.001) * 42);
        fluxAverage += (flux - fluxAverage) * (1 - Math.exp(-dt / 0.7));
        livePulse *= Math.exp(-dt * 11);

        const beat = unit(audio.beat ?? 0);
        const analysedRise = beat > previousBeat + 0.08;
        if (beat <= 0.05 || analysedRise) analysedReady = true;
        const analysedPulse = !fresh && !silent && analysedReady ? beat : 0;
        const attack = !fresh && !silent && (liveStrength > 0 || analysedRise) && input.nowMs - lastAttack >= 120;
        if (attack) {
            livePulse = Math.max(livePulse, liveStrength);
            const centroid = magnitude > 0 ? weighted / magnitude / Math.max(1, current.length - 1) : 0;
            offset = (offset + (centroid < 1 / 3 ? 5 : centroid < 2 / 3 ? 7 : 9)) % 16;
            lastAttack = input.nowMs;
        }
        previous!.set(current);
        previousBeat = beat;

        // Butterchurn AudioLevels (MIT), blob efe4e5527588e8d173e0acebb138ced1f89f6ea2: elapsed-time attack and baseline.
        // https://github.com/jberg/butterchurn/blob/master/src/audio/audioLevels.js
        const warmup = Math.min(dt, Math.max(0, 50 / 30 - age));
        const longRate = Math.pow(0.9, 30 * warmup) * Math.pow(0.992, 30 * (dt - warmup));
        const levels = values.map((immediate, index) => {
            const rate = Math.pow(immediate > average[index] ? 0.2 : 0.5, 30 * dt);
            average[index] = average[index] * rate + immediate * (1 - rate);
            baseline[index] = baseline[index] * longRate + immediate * (1 - longRate);
            // Fixed headroom preserves loudness differences instead of normalizing every sustained note to one level.
            return immediate < 0.008 ? 0 : Math.min(1, immediate * 2.2, average[index] / (0.25 + baseline[index]) * 0.7);
        });
        age += dt;

        // osu! LogoVisualisation (MIT): peak attack/release; exponential form makes release independent of frame rate.
        // https://github.com/ppy/osu/blob/b77b028f9a0256ce23b94ef7eb916648641553e7/osu.Game/Screens/Menu/LogoVisualisation.cs#L100-L143
        for (let index = 0; index < 16; index++) regions[index] = Math.max(0, (regions[index] + 0.03) * Math.exp(-2.4 * dt) - 0.03);
        if (!silent) {
            for (let index = 0; index < 16; index++) {
                const start = Math.floor(index * current.length / 16);
                const end = Math.floor((index + 1) * current.length / 16);
                let value = 0;
                for (let bin = start; bin < end; bin++) value = Math.max(value, current[bin]);
                const slot = (index + offset) % 16;
                regions[slot] = Math.max(regions[slot], value);
            }
        }
        return { bass: levels[0], mid: levels[1], treble: levels[2], energy: levels[3], beat: Math.max(livePulse, analysedPulse), spectrum: audio.spectrum, regions: Array.from(regions) };
    }

    return { update, reset };
}
