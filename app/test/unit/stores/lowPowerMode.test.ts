import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Low Power is an operational preference, never a rewrite of the listener's visual settings.
describe('Low Power preference', () => {
    let values: Map<string, string>;
    beforeEach(() => {
        values = new Map([['static_mode', 'false'], ['background_throttling', 'false'], ['mineradio_background_tuning', '{"bloom":true}']]);
        const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
        vi.stubGlobal('localStorage', storage);
        vi.stubGlobal('window', { localStorage: storage });
        vi.resetModules();
    });
    afterEach(() => vi.unstubAllGlobals());

    it.each([null, 'invalid', 'false'])('defaults to Standard for %s', async value => {
        if (value !== null) values.set('low_power_mode', value);
        const { useDesktopSettingsStore } = await import('@/stores/useDesktopSettingsStore');
        expect(useDesktopSettingsStore.getState().lowPowerMode).toBe(false);
    });

    it('persists round trips and relaunch without overwriting visual choices', async () => {
        const { useDesktopSettingsStore: store } = await import('@/stores/useDesktopSettingsStore');
        const original = new Map(values);
        for (let i = 0; i < 20; i++) {
            store.getState().handleToggleLowPowerMode(true);
            expect(store.getState().lowPowerMode).toBe(true);
            store.getState().handleToggleLowPowerMode(false);
        }
        store.getState().handleToggleLowPowerMode(true);
        expect(values.get('low_power_mode')).toBe('true');
        for (const [key, value] of original) expect(values.get(key)).toBe(value);
        vi.resetModules();
        const fresh = await import('@/stores/useDesktopSettingsStore');
        expect(fresh.useDesktopSettingsStore.getState().lowPowerMode).toBe(true);
    });

    it('accepts only boolean native snapshots and mirrors the independent preference', async () => {
        const { useDesktopSettingsStore: store } = await import('@/stores/useDesktopSettingsStore');
        store.getState().setDesktopPreferenceSnapshot({ LOW_POWER_MODE: true });
        expect(store.getState().lowPowerMode).toBe(true);
        store.getState().setDesktopPreferenceSnapshot({ LOW_POWER_MODE: 'false' });
        expect(store.getState().lowPowerMode).toBe(true);
        expect(values.get('background_throttling')).toBe('false');
    });
});
