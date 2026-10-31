import { MINERADIO_DEFAULT_SETTINGS } from './donorDefaults';
import type { StageSettings } from './stageBridge';

// Persist only known primitive donor controls; renderer internals never become settings.
export function normalizeMineradioSettings(input: unknown): StageSettings {
    const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
    const result: StageSettings = { ...MINERADIO_DEFAULT_SETTINGS };
    for (const [key, fallback] of Object.entries(MINERADIO_DEFAULT_SETTINGS)) {
        const value = source[key];
        if (typeof value !== typeof fallback || (typeof value === 'number' && !Number.isFinite(value))) continue;
        result[key] = value as string | number | boolean;
    }
    result.preset = Math.max(0, Math.min(12, Math.round(Number(result.preset))));
    result.aiDepth = false;
    result.cam = 'off';
    result.wallpaperMode = false;
    result.desktopLyrics = false;
    return result;
}
