// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME, DAYLIGHT_THEME } from '../../../src/services/baseThemes';

// Verify the actual settings window owns focus, rather than only advertising a modal role.
vi.mock('../../../src/components/modal/settings/pages/HelpPage', () => ({ default: () => React.createElement('button', null, 'Help action') }));
let SettingsModal: typeof import('../../../src/components/modal/SettingsModal').default;
let root: Root;
let host: HTMLDivElement;

beforeAll(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('__APP_RELEASE_CHANNEL__', 'internal');
    vi.stubGlobal('__APP_VERSION__', '0.1.0');
    vi.stubGlobal('__APP_VERSION_LABEL__', 'Immersive');
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
        return (this.closest('[hidden], [inert]') ? [] : [{}]) as unknown as DOMRectList;
    });
    SettingsModal = (await import('../../../src/components/modal/SettingsModal')).default;
});

afterAll(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

afterEach(() => {
    act(() => root?.unmount());
    document.body.replaceChildren();
});

function openSettings() {
    const opener = document.createElement('button');
    opener.textContent = 'Open settings';
    document.body.appendChild(opener);
    opener.focus();
    host = document.body.appendChild(document.createElement('div'));
    root = createRoot(host);
    const noop = () => {};
    act(() => root.render(React.createElement(SettingsModal, {
        onClose: noop, bgMode: 'default', onApplyDefaultTheme: noop, hasCustomTheme: false,
        themeParkInitialTheme: { dark: DEFAULT_THEME, light: DAYLIGHT_THEME }, isCustomThemePreferred: false,
        songThemeAutoSwitchEnabled: false, songThemeAutoGenerateEnabled: false,
        onSaveCustomTheme: noop, onSaveAiTheme: noop, onApplyCustomTheme: noop,
        onToggleCustomThemePreferred: noop, onToggleSongThemeAutoSwitch: noop,
        themeGenerationSource: 'cover', onChangeThemeGenerationSource: noop, onToggleSongThemeAutoGenerate: noop,
        loadLyricFilterPreview: async () => null, currentLyrics: null, lyricCurrentTime: motionValue(0),
        onSaveLyricFilterPattern: noop, onAudioOutputDeviceChange: () => true,
        replayGainMode: 'off', onReplayGainModeChange: noop,
    })));
    return { opener, panel: host.querySelector<HTMLElement>('[role="dialog"]')! };
}

describe('settings window focus', () => {
    it('moves focus into settings and gives it back to the opener after closing', () => {
        const { opener, panel } = openSettings();
        expect(panel.contains(document.activeElement)).toBe(true);
        expect(document.activeElement?.getAttribute('type')).toBe('search');
        act(() => root.render(null));
        expect(document.activeElement).toBe(opener);
    });

    it('wraps Tab inside the settings window in both directions', () => {
        const { panel } = openSettings();
        const stops = Array.from(panel.querySelectorAll<HTMLElement>('button, input, a[href], [tabindex]')).filter(node => node.tabIndex >= 0 && !node.hasAttribute('disabled'));
        const first = stops[0];
        const last = stops[stops.length - 1];
        last.focus();
        const next = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
        act(() => last.dispatchEvent(next));
        expect(next.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(first);
        const previous = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
        act(() => first.dispatchEvent(previous));
        expect(previous.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(last);
    });

    it('leaves a Tab key already handled by a control alone', () => {
        const { panel } = openSettings();
        const last = panel.querySelectorAll<HTMLButtonElement>('button');
        const control = last[last.length - 1];
        control.focus();
        control.addEventListener('keydown', event => event.preventDefault());
        act(() => control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
        expect(document.activeElement).toBe(control);
    });
});
