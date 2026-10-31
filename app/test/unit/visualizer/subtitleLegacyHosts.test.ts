// @vitest-environment jsdom
import React from 'react';
import { motionValue } from 'framer-motion';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import VisualizerRenderer from '@/components/visualizer/VisualizerRenderer';
import VisPlayground from '@/components/visualizer/window/VisPlayground';
import { DEFAULT_THEME } from '@/services/baseThemes';
import type { SubtitleContentMode, SubtitleOverlayLayout } from '@/types';
import type { ObsBrowserSourceConfig } from '@/types/obsBrowserSource';

// Runs the real host components while replacing unrelated graphics and window chrome with plain markers.
vi.mock('@/i18n/config', () => ({ default: { t: (key: string) => key, language: 'en', on: () => undefined } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
vi.mock('@/components/visualizer/registry', () => {
    const entry = {
        mode: 'classic',
        render: (props: { subtitleOverlayLayout?: SubtitleOverlayLayout }) => React.createElement('div', { 'data-style-layout': props.subtitleOverlayLayout ?? 'missing' }),
    };
    return { VISUALIZER_REGISTRY: [entry], getVisualizerRegistryEntry: () => entry, getVisualizerModeLabel: () => 'Classic' };
});
vi.mock('@/components/visualizer/VisualizerBackdrop', () => ({ default: ({ children }: React.PropsWithChildren) => children }));
vi.mock('@/components/visualizer/window/VisPlaygroundSampleStage', () => ({ default: ({ children }: React.PropsWithChildren) => children }));
vi.mock('@/components/visualizer/VisualizerHarmonyOverlay', () => ({ default: () => null, HARMONY_TOP_PX: 76 }));
vi.mock('@/components/visualizer/preview/useLivePreviewFeed', () => ({ useLivePreviewFeed: () => ({ content: null }) }));
vi.mock('@/components/visualizer/styleTransition/VisualizerStyleTransition', () => ({
    useStyleSwitch: (mode: string) => ({ mode }),
    default: ({ renderStyle, styleSwitch }: { renderStyle: (mode: string) => React.ReactNode; styleSwitch: { mode: string } }) => renderStyle(styleSwitch.mode),
}));
vi.mock('@/components/shared/StudioWindow', () => ({
    default: ({ stage, children }: React.PropsWithChildren<{ stage: React.ReactNode }>) => React.createElement(React.Fragment, null, stage, children),
}));
vi.mock('@/components/modal/settings/kit', () => ({
    PictureGrid: () => null,
    Segmented: () => null,
    Tooltip: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock('@/components/visualizer/window/VisPlaygroundSettingsPanel', () => ({
    default: (props: { subtitleOverlayLayout: SubtitleOverlayLayout }) => React.createElement('div', { 'data-settings-layout': props.subtitleOverlayLayout }),
}));

const bands = { bass: motionValue(0), lowMid: motionValue(0), mid: motionValue(0), vocal: motionValue(0), treble: motionValue(0) };
const props = { currentTime: motionValue(0), currentLineIndex: 0, lines: [], theme: DEFAULT_THEME, audioPower: motionValue(0), audioBands: bands };
const noop = () => undefined;
const previewProps = { isDaylight: false, fontStyle: 'sans' as const, fontScale: 1, fontWeight: null, customFontFamily: null, customFontLabel: null,
    onFontStyleChange: noop, onFontScaleChange: noop, onFontWeightChange: noop, onCustomFontChange: noop, onClose: noop };

const modes: [SubtitleContentMode, SubtitleOverlayLayout][] = [
    ['romanization', 'romanization'],
    ['both', 'current+romanization+translation'],
    ['none', 'current+next'],
];

describe('legacy bottom subtitle hosts', () => {
    it.each(modes)('renders an old %s OBS browser snapshot through the shared renderer', (subtitleContentMode, layout) => {
        const config: Pick<ObsBrowserSourceConfig, 'subtitleContentMode'> = { subtitleContentMode };
        const markup = renderToStaticMarkup(React.createElement(VisualizerRenderer, { ...props, ...config, mode: 'classic' }));
        expect(markup).toContain(`data-style-layout="${layout}"`);
    });

    it.each(modes)('keeps a standalone %s preview and its row controls on the same legacy layout', (subtitleContentMode, layout) => {
        const markup = renderToStaticMarkup(React.createElement(VisPlayground, { ...previewProps, visualizerMode: 'classic', subtitleContentMode }));
        expect(markup).toContain(`data-style-layout="${layout}"`);
        expect(markup).toContain(`data-settings-layout="${layout}"`);
    });

    it('keeps an explicit layout above legacy modes and defaults absent settings to translation', () => {
        expect(renderToStaticMarkup(React.createElement(VisualizerRenderer, { ...props, mode: 'classic', subtitleContentMode: 'both', subtitleOverlayLayout: 'current+next' }))).toContain('data-style-layout="current+next"');
        expect(renderToStaticMarkup(React.createElement(VisualizerRenderer, { ...props, mode: 'classic' }))).toContain('data-style-layout="translation"');
        expect(renderToStaticMarkup(React.createElement(VisPlayground, { ...previewProps, visualizerMode: 'classic', subtitleContentMode: 'none', subtitleOverlayLayout: 'romanization' }))).toContain('data-settings-layout="romanization"');
    });
});
