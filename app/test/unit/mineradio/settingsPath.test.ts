// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import VisPlaygroundSettingsPanel from '@/components/visualizer/window/VisPlaygroundSettingsPanel';
import { getVisualizerRegistryEntry } from '@/components/visualizer/registry';
import { selectVisualizerSettingsSnapshot, useVisualizerSettingsStore } from '@/stores/useVisualizerSettingsStore';
import { DEFAULT_THEME } from '@/services/baseThemes';
import en from '@/i18n/locales/en';

// Preview rendering owns a separate clock/GPU surface; this checks the real settings and store path.
vi.mock('@/components/visualizer/preview/BackgroundPicture', () => ({ default: () => null }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
const onSectionChange = vi.fn();
const noop = () => {};
const props: React.ComponentProps<typeof VisPlaygroundSettingsPanel> = {
    activeSection: 'background', onSectionChange,
    t: key => (en.options as Record<string, string>)[key.replace('options.', '')] ?? key,
    isDaylight: false, theme: DEFAULT_THEME, visualizerMode: 'mineradio', visualizerEntry: getVisualizerRegistryEntry('mineradio'),
    styleDraft: { tuning: undefined, change: noop }, settings: selectVisualizerSettingsSnapshot(useVisualizerSettingsStore.getState()), controlCardBg: '', rangeInputClass: '', visualizerOpacity: 1,
    backgroundConfig: { mode: 'mineradio' }, previewPlaceholderId: 'default', previewPlaceholderOptions: [], onPreviewPlaceholderChange: noop,
    fontStyleValue: 'sans', fontStyleOptions: [], subtitleFontStyleOptions: [], onFontStyleChange: noop,
    customFontFamily: null, currentFontLabel: 'Sans', fontScale: 1, fontScaleOptions: [], onFontScaleChange: noop,
    subtitleFontScale: 1, onSubtitleFontScaleChange: noop, fontWeight: 400, fontWeightOptions: [], onFontWeightChange: noop, onFontWeightFollowChange: noop,
    hideTranslationSubtitle: false, subtitleContentMode: 'translation', subtitleOverlayLayout: 'translation', subtitleOverlayOpacity: 1, subtitleOverlayBackground: false,
    subtitleUpcomingLyricsBlur: false, showHarmonySubtitle: false, harmonySubtitleBackground: false,
    subtitleFontInheritsLyrics: true, subtitleFontStyle: 'sans', subtitleFontWeight: 400,
};

beforeEach(() => {
    vi.clearAllMocks();
    useVisualizerSettingsStore.setState({ smartBeat: { mode: 'off', effects: {} }, randomVisualizerModePerSong: false });
    host = document.body.appendChild(document.createElement('div'));
    root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

it('offers MineRadio’s existing beat control on the background tab and opens Global while off', () => {
    act(() => root.render(React.createElement(VisPlaygroundSettingsPanel, props)));
    const group = host.querySelector('#settings-vis-beat-effects');
    expect(group).not.toBeNull();
    expect(group!.textContent).toContain('Smart beat accents');
    expect(host.querySelectorAll('#settings-vis-beat-effects')).toHaveLength(1);
    const toggle = group!.querySelector<HTMLButtonElement>('[role=switch]')!;
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    act(() => toggle.click());
    expect(useVisualizerSettingsStore.getState().smartBeat.effects['mineradio.pulse'].on).toBe(false);
    const global = Array.from(group!.querySelectorAll('button')).find(button => button.textContent === 'Go to Global')!;
    act(() => global.click());
    expect(onSectionChange).toHaveBeenCalledWith('global');
});

it('offers one shared setting on the standalone visualizer tab', () => {
    act(() => root.render(React.createElement(VisPlaygroundSettingsPanel, { ...props, activeSection: 'visualizer' })));
    expect(host.querySelectorAll('#settings-vis-beat-effects')).toHaveLength(1);
    expect(host.querySelector('#settings-vis-beat-effects')!.textContent).toContain('Smart beat accents');
});
