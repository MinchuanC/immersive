// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { applyImportedConfig, type ConfigThemeControls } from '@/components/modal/settings/pages/storage/visualConfigTransfer';
import { useTypographySettingsStore } from '@/stores/useTypographySettingsStore';
import { buildVisualSettingsConfig } from '@/services/obs/visualSettingsConfig';
import { applySyncedVisualSettings, buildSyncedVisualSettings, readSyncableSettingsState } from '@/services/sync/settingsSnapshot';

// Keeps the bottom overlay's layout separate from legacy subtitle content as settings travel between hosts.
const controls: ConfigThemeControls = {
    bgMode: 'default', aiTheme: null, customTheme: null, isCustomThemePreferred: false,
    songThemeAutoSwitchEnabled: false, songThemeAutoGenerateEnabled: false,
    onSaveCustomTheme: vi.fn(), onApplyCustomTheme: vi.fn(), onToggleSongThemeAutoSwitch: vi.fn(),
    onToggleSongThemeAutoGenerate: vi.fn(), onChangeThemeGenerationSource: vi.fn(),
};

describe('bottom subtitle layout transport', () => {
    it('imports only selected valid layouts without changing legacy content', () => {
        const store = useTypographySettingsStore.getState();
        store.handleSetSubtitleContentMode('romanization');
        store.handleSetSubtitleOverlayLayout('translation');

        applyImportedConfig({ subtitleOverlayLayout: 'current+next' }, [], controls);
        expect(useTypographySettingsStore.getState().subtitleOverlayLayout).toBe('translation');
        applyImportedConfig({ subtitleOverlayLayout: 'next' }, ['subtitleOverlayLayout'], controls);
        expect(useTypographySettingsStore.getState().subtitleOverlayLayout).toBe('translation');
        applyImportedConfig({ subtitleOverlayLayout: 'current+next' }, ['subtitleOverlayLayout'], controls);
        expect(useTypographySettingsStore.getState().subtitleOverlayLayout).toBe('current+next');
        expect(useTypographySettingsStore.getState().subtitleContentMode).toBe('romanization');
    });

    it('exports the live layout to OBS and sync and applies a received layout', () => {
        useTypographySettingsStore.getState().handleSetSubtitleOverlayLayout('current+romanization+translation');
        expect(buildVisualSettingsConfig().subtitleOverlayLayout).toBe('current+romanization+translation');
        expect(buildSyncedVisualSettings(readSyncableSettingsState()).subtitleOverlayLayout).toBe('current+romanization+translation');

        applySyncedVisualSettings(readSyncableSettingsState(), { subtitleOverlayLayout: 'current+next+next' });
        expect(useTypographySettingsStore.getState().subtitleOverlayLayout).toBe('current+next+next');
    });
});
