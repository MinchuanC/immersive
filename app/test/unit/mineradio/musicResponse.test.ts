import { describe, expect, it } from 'vitest';
import { createMusicResponse, type MusicResponseInput } from '../../../src/integrations/mineradio/musicResponse';

// Controlled spectra exercise the response without an audio device or a whole-track beat analysis.
const spectrum = (value = 0, start = 0, end = 8) => {
    const result = new Uint8Array(64);
    result.fill(value, start, end);
    return result;
};
const audio = (value = 0, beat = 0, bins = spectrum(value)) => ({ bass: value, mid: value, treble: value, energy: value, beat, spectrum: bins });
const input = (nowMs: number, signal = audio(), overrides: Partial<MusicResponseInput> = {}): MusicResponseInput => ({ nowMs, position: nowMs / 1000, trackKey: 'local:a', paused: false, audio: signal, ...overrides });
const dominant = (regions: number[]) => regions.indexOf(Math.max(...regions));

describe('MineRadio music response', () => {
    it('keeps quiet, medium and loud raw 0–255 levels distinct and bounded', () => {
        const levels = [16, 96, 220].map(value => {
            const response = createMusicResponse();
            let frame = response.update(input(0, audio(value)))!;
            for (let time = 20; time <= 1000; time += 20) frame = response.update(input(time, audio(value)))!;
            return frame;
        });
        for (const field of ['bass', 'mid', 'treble', 'energy'] as const) {
            expect(levels[0][field]).toBeGreaterThan(0);
            expect(levels[0][field]).toBeLessThan(levels[1][field]);
            expect(levels[1][field]).toBeLessThan(levels[2][field]);
            expect(levels[2][field]).toBeLessThanOrEqual(1);
        }
        expect(levels[0].energy).toBeLessThan(0.2);
    });

    it('bounds invalid band and analysed-beat samples at its own boundary', () => {
        const response = createMusicResponse();
        response.update(input(0));
        const frame = response.update(input(20, { bass: NaN, mid: Infinity, treble: -50, energy: 999, beat: Infinity, spectrum: spectrum(255) }))!;
        expect(frame.bass).toBe(0);
        expect(frame.mid).toBe(0);
        expect(frame.treble).toBe(0);
        expect(frame.regions).toHaveLength(16);
        for (const value of [frame.energy, frame.beat!, ...frame.regions]) {
            expect(Number.isFinite(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
        }
    });

    it('does not turn silence or sub-floor noise into attacks', () => {
        const response = createMusicResponse();
        response.update(input(0));
        for (let time = 20; time <= 1000; time += 20) {
            const frame = response.update(input(time, audio(time % 40 === 0 ? 2 : 0)))!;
            expect([frame.bass, frame.mid, frame.treble, frame.energy, frame.beat]).toEqual([0, 0, 0, 0, 0]);
            expect(frame.regions).toEqual(Array(16).fill(0));
        }
    });

    it('responds on the next sample and releases without treating falling energy as a hit', () => {
        const response = createMusicResponse();
        response.update(input(0));
        const attack = response.update(input(16, audio(220)))!;
        const sustained = response.update(input(60, audio(220)))!;
        const falling = response.update(input(200, audio(100)))!;
        expect(attack.bass).toBeGreaterThan(0.2);
        expect(attack.beat).toBeGreaterThan(0.5);
        expect(sustained.beat).toBeLessThan(attack.beat!);
        expect(falling.beat).toBeLessThan(sustained.beat!);
        let settled = falling;
        for (let time = 220; time <= 2500; time += 20) settled = response.update(input(time))!;
        expect(settled.beat).toBeLessThan(0.001);
        expect(settled.regions).toEqual(Array(16).fill(0));
    });

    it('ignores a second attack inside 120ms and accepts a later irregular attack', () => {
        const response = createMusicResponse();
        response.update(input(0));
        const first = response.update(input(16, audio(220)))!;
        response.update(input(50));
        const guarded = response.update(input(80, audio(220)))!;
        response.update(input(140));
        const next = response.update(input(177, audio(220)))!;
        expect(guarded.beat).toBeLessThan(first.beat!);
        expect(dominant(guarded.regions)).toBe(dominant(first.regions));
        expect(next.beat).toBeGreaterThan(guarded.beat!);
        expect(dominant(next.regions)).not.toBe(dominant(first.regions));
    });

    it('moves identical bass hits through different spatial regions and retains fading peaks', () => {
        const response = createMusicResponse();
        response.update(input(0));
        const hits = [17, 263, 611, 820].map(time => {
            response.update(input(time - 1));
            return response.update(input(time, audio(220)))!;
        });
        const regions = hits.map(frame => dominant(frame.regions));
        expect(new Set(regions).size).toBeGreaterThan(2);
        for (let index = 1; index < regions.length; index++) expect(regions[index]).not.toBe(regions[index - 1]);
        expect(hits[1].regions[regions[0]]).toBeGreaterThan(0);
        expect(hits[1].regions[regions[0]]).toBeLessThan(hits[0].regions[regions[0]]);
        for (const frame of hits) expect(frame.beat).toBeGreaterThan(0.5);
    });

    it('retains a visible attack and regional peak for sparse bass in a 1024-bin FFT', () => {
        const response = createMusicResponse();
        const bins = new Uint8Array(1024);
        bins.fill(220, 1, 5);
        response.update(input(0, audio(0, 0, new Uint8Array(1024))));
        const frame = response.update(input(20, audio(120, 0, bins)))!;
        expect(frame.beat).toBeGreaterThan(0.5);
        expect(Math.max(...frame.regions)).toBeGreaterThan(0.5);
    });

    it('does not keep rotating a sustained tone between attacks', () => {
        const response = createMusicResponse();
        response.update(input(0));
        const first = response.update(input(16, audio(180)))!;
        for (const time of [160, 320, 640, 1000]) {
            const frame = response.update(input(time, audio(180)))!;
            expect(dominant(frame.regions)).toBe(dominant(first.regions));
            expect(frame.beat).toBeLessThan(first.beat!);
        }
    });

    it('uses the stronger live or analysed pulse without adding them', () => {
        const live = createMusicResponse();
        const combined = createMusicResponse();
        live.update(input(0));
        combined.update(input(0));
        const liveFrame = live.update(input(20, audio(64, 0, spectrum(12, 0, 2))))!;
        const combinedFrame = combined.update(input(20, audio(64, 0.6, spectrum(12, 0, 2))))!;
        expect(liveFrame.beat).toBeGreaterThan(0);
        expect(liveFrame.beat).toBeLessThan(0.6);
        expect(combinedFrame.beat).toBeCloseTo(0.6, 6);
    });

    it('gives similar envelopes at 30, 60 and 120Hz', () => {
        const frames = [30, 60, 120].map(hz => {
            const response = createMusicResponse();
            response.update(input(0));
            let atPeak = response.update(input(0))!;
            let settled = atPeak;
            for (let frame = 1; frame <= hz; frame++) {
                const time = frame * 1000 / hz;
                settled = response.update(input(time, audio(time >= 100 - 0.001 && time < 500 - 0.001 ? 180 : 0)))!;
                if (frame === hz / 2 - 1) atPeak = settled;
            }
            return { atPeak, settled };
        });
        for (const frame of frames.slice(1)) {
            expect(frame.atPeak.bass).toBeCloseTo(frames[0].atPeak.bass, 1);
            expect(frame.settled.beat).toBeCloseTo(frames[0].settled.beat!, 2);
            expect(Math.max(...frame.settled.regions)).toBeCloseTo(Math.max(...frames[0].settled.regions), 1);
        }
    });

    it('keeps a real 200ms bass ramp equally strong and timely at 30, 60 and 120Hz', () => {
        const ramps = [30, 60, 120].map(hz => {
            const response = createMusicResponse();
            response.update(input(0));
            let peak = 0;
            let firstAttackMs = Infinity;
            let peakAtMs = 0;
            for (let frame = 1; frame <= hz; frame++) {
                const time = frame * 1000 / hz;
                const value = Math.round(120 * Math.min(1, time / 200));
                const beat = response.update(input(time, audio(value)))!.beat!;
                if (beat > 0.2 && firstAttackMs === Infinity) firstAttackMs = time;
                if (beat > peak) { peak = beat; peakAtMs = time; }
            }
            return { peak, firstAttackMs, peakAtMs };
        });
        expect(Math.max(...ramps.map(ramp => ramp.peak)) - Math.min(...ramps.map(ramp => ramp.peak))).toBeLessThan(0.05);
        for (const ramp of ramps) {
            expect(ramp.peak).toBeGreaterThan(0.6);
            expect(ramp.firstAttackMs).toBeLessThanOrEqual(1000 / 30 + 0.001);
            expect(ramp.peakAtMs).toBeLessThanOrEqual(1000 / 30 + 0.001);
        }
    });

    it.each(['pause', 'seek', 'track', 'source', 'analyser loss', 'reset'] as const)('clears stale attacks after %s', reason => {
        const response = createMusicResponse();
        response.update(input(0));
        expect(response.update(input(20, audio(220)))!.beat).toBeGreaterThan(0.5);
        let overrides: Partial<MusicResponseInput> = {};
        if (reason === 'pause') expect(response.update(input(40, audio(220), { paused: true }))).toBeNull();
        else if (reason === 'analyser loss') expect(response.update(input(40, audio(220), { audio: null }))).toBeNull();
        else if (reason === 'reset') response.reset();
        else if (reason === 'seek') overrides = { position: 10 };
        else overrides = { trackKey: reason === 'source' ? 'spotify:a' : 'local:b' };
        const after = response.update(input(60, audio(220, 0.8), overrides))!;
        const sustained = response.update(input(80, audio(220, 0.7), { ...overrides, ...(reason === 'seek' ? { position: 10.02 } : {}) }))!;
        expect(after.beat).toBe(0);
        expect(sustained.beat).toBe(0);
    });

    it('accepts a fresh attack after a reset has seeded the current spectrum', () => {
        const response = createMusicResponse();
        response.update(input(0, audio(220, 0.8)));
        response.update(input(100, audio(100, 0.1)));
        const frame = response.update(input(220, audio(220, 0.9)))!;
        expect(frame.beat).toBeGreaterThanOrEqual(0.9);
    });
});
