import { describe, expect, it } from 'vitest';
import { normalizeMineradioSettings } from '../../../src/integrations/mineradio/settings';

// Stored console settings cannot inject renderer internals or invalid numeric uniforms.
describe('MineRadio visual settings', () => {
    it('retains donor defaults and accepts real console controls', () => {
        const settings = normalizeMineradioSettings({ preset: 12, intensity: 0.75, lyricScale: 1.2, bloom: true });
        expect(settings.preset).toBe(12);
        expect(settings.intensity).toBe(0.75);
        expect(settings.lyricScale).toBe(1.2);
        expect(settings.bloom).toBe(true);
        expect(settings.shelfPresence).toBe('auto');
    });

    it('rejects unknown keys, wrong types and nonfinite shader values', () => {
        const settings = normalizeMineradioSettings({ preset: 999, intensity: Infinity, bloom: 'true', executeScript: 'bad' });
        expect(settings.preset).toBe(12);
        expect(Number.isFinite(settings.intensity)).toBe(true);
        expect(typeof settings.bloom).toBe('boolean');
        expect(settings).not.toHaveProperty('executeScript');
    });
});
