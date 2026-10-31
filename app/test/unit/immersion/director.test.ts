import { describe, expect, it } from 'vitest';
import { installImmersionDirector, sampleImmersionDirection } from '../../../src/services/immersion/director';

describe('shared immersion director', () => {
    it('isolates recordings and does not let stale cleanup remove a newer owner', () => {
        const recipe = { intensity: 1, sonicGroundAmplitude: 40, sonicGroundMotionSpeed: 30, sonicGroundGlow: 20 };
        const stopOld = installImmersionDirector('local:a', () => recipe);
        const stop = installImmersionDirector('local:b', time => ({ ...recipe, sonicGroundAmplitude: time }));
        stopOld();
        expect(sampleImmersionDirection('local:a', 10)).toBeNull();
        expect(sampleImmersionDirection('local:b', 10)?.sonicGroundAmplitude).toBe(10);
        stop();
        expect(sampleImmersionDirection('local:b', 10)).toBeNull();
    });
});
