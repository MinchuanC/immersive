import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

// Run the same classic-script helpers used by the isolated graphics realm.
const file = new URL('../../../public/mineradio/stageMotion.js', import.meta.url);
const context: Record<string, any> = {};
vm.runInNewContext(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '', context);
const motion = context.MineradioStageMotion ?? {};

describe('MineRadio elapsed-time motion', () => {
    it('keeps donor 60 Hz easing while matching a 120 Hz elapsed interval', () => {
        expect(motion.ease?.(.1, 1 / 60)).toBeCloseTo(.1, 10);
        let slow = 0, fast = 0;
        for (let index = 0; index < 30; index++) slow += (1 - slow) * (motion.ease?.(.1, 1 / 60) ?? NaN);
        for (let index = 0; index < 60; index++) fast += (1 - fast) * (motion.ease?.(.1, 1 / 120) ?? NaN);
        expect(fast).toBeCloseTo(slow, 10);
    });

    it('preserves capped pointer momentum and the same release path at 60/120 Hz', () => {
        const run = (fps: number) => {
            const rotation = { x: 0, y: 0 }, spin = { vx: 0, vy: 0, damping: .9 };
            motion.drag?.(rotation, spin, 100, 0, .016);
            const release = spin.vy;
            for (let index = 0; index < fps / 2; index++) motion.inertia?.(rotation, spin, 1 / fps);
            return { angle: rotation.y, velocity: spin.vy, release };
        };
        const slow = run(60), fast = run(120);
        expect(slow.release).toBe(6.2);
        expect(fast.angle).toBeCloseTo(slow.angle, 8);
        expect(fast.velocity).toBeCloseTo(slow.velocity, 8);
    });

    it('interpolates actual band envelopes between packets without fabricating signal', () => {
        const run = (fps: number) => {
            const held = { bass: 0, mid: 0, treble: 0, energy: 0, beat: 0 };
            const target = { bass: .6, mid: .4, treble: .2, energy: .5, beat: 0 };
            const points: number[] = [];
            for (let index = 0; index < fps / 2; index++) { motion.audio?.(held, target, 1 / fps); points.push(held.bass); }
            for (let index = 0; index < fps / 2; index++) motion.audio?.(held, { bass: 0, mid: 0, treble: 0, energy: 0, beat: 0 }, 1 / fps);
            return { held, points };
        };
        const slow = run(60), fast = run(120);
        expect(fast.points[1]).toBeGreaterThan(fast.points[0]);
        expect(fast.points[0]).toBeLessThan(.6);
        expect(fast.held.bass).toBeCloseTo(slow.held.bass, 8);
        expect(fast.held.energy).toBeCloseTo(slow.held.energy, 8);
        expect(fast.held.beat).toBe(0);
    });

    it('keeps shelf updates at the donor 30 Hz across display refresh rates', () => {
        const count = (fps: number) => {
            const gate = { elapsed: 0 };
            let steps = 0;
            for (let index = 0; index < fps; index++) if (motion.cadence?.(gate, 1 / fps, 30)) steps++;
            return steps;
        };
        expect([count(30), count(60), count(120)]).toEqual([30, 30, 30]);
    });

    it('holds the Workshop realm while allowing one explicit static redraw and resume', () => {
        const pending: Function[] = [];
        const realm = { requestAnimationFrame: (callback: Function) => pending.push(callback), cancelAnimationFrame() {}, performance: { now: () => 20 } };
        let draws = 0;
        const draw = () => { draws++; realm.requestAnimationFrame(draw); };
        motion.holdRealm?.(realm, true);
        realm.requestAnimationFrame(draw);
        expect(pending).toHaveLength(0);
        motion.stepRealm?.(realm);
        expect(draws).toBe(1);
        expect(pending).toHaveLength(0);
        motion.holdRealm?.(realm, false);
        expect(pending).toHaveLength(1);
    });
});
