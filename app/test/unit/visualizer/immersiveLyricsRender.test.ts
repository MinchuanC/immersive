// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { motionValue } from 'framer-motion';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_THEME } from '@/services/baseThemes';
import ImmersiveLyrics from '@/components/visualizer/immersive-lyrics/ImmersiveLyrics';
import type { VisualizerSharedProps } from '@/components/visualizer/definition';

const preference = vi.hoisted(() => ({ reduced: false }));
vi.mock('@/hooks/useReducedMotionFor', () => ({ useReducedMotionFor: () => preference.reduced }));
vi.mock('@/components/visualizer/VisualizerShell', () => ({ default: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children) }));
vi.mock('react-i18next', async importOriginal => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('framer-motion', async importOriginal => {
    const actual = await importOriginal<typeof import('framer-motion')>();
    return { ...actual, motion: {
        div: ({ children, layout, transition, initial, animate, ...props }: any) => React.createElement('div', { ...props, 'data-layout': String(layout), 'data-duration': transition.duration }, children),
        span: ({ children, style }: any) => React.createElement('span', { style: { opacity: style.opacity.get() } }, children),
    } };
});

const line = { fullText: 'Second line', startTime: 3, endTime: 4, translation: 'Translation',
    timingGranularity: 'word' as const, words: [{ text: 'Second', startTime: 3, endTime: 3.5 }, { text: 'line', startTime: 3.5, endTime: 4 }] };
const props = (): VisualizerSharedProps => ({
    currentTime: motionValue(3.75), currentLineIndex: 1,
    lines: [{ fullText: 'First', startTime: 1, endTime: 2, words: [] }, line, { fullText: 'Third', startTime: 5, endTime: 6, words: [] }],
    theme: DEFAULT_THEME, audioPower: motionValue(0), audioBands: {} as VisualizerSharedProps['audioBands'],
});
afterEach(() => { preference.reduced = false; vi.unstubAllGlobals(); });

it('renders the focused line, readable neighbours and translation using genuine word timing', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(React.createElement(ImmersiveLyrics, props()));
    expect(host.textContent).toContain('First');
    expect(host.textContent).toContain('Second line');
    expect(host.textContent).toContain('Third');
    expect(host.textContent).toContain('Translation');
    const active = host.querySelector('[aria-current="true"]')!;
    expect([...active.querySelectorAll('span')].map(span => span.style.opacity)).toEqual(['0.82', '1']);
});

it('renders line-timed text without invented word emphasis', () => {
    const input = props();
    input.lines[1] = { ...line, timingGranularity: 'line' };
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(React.createElement(ImmersiveLyrics, input));
    expect(host.querySelector('[aria-current="true"]')?.textContent).toContain('Second line');
    expect(host.querySelectorAll('[aria-current="true"] span')).toHaveLength(0);
});

it('follows subtitle settings for translation and romanization', () => {
    const input = props();
    input.lines[1] = { ...line, romanization: 'Romanized line' };
    input.subtitleOverlayLayout = 'current+romanization+translation';
    const both = renderToStaticMarkup(React.createElement(ImmersiveLyrics, input));
    expect(both).toContain('Romanized line');
    expect(both).toContain('Translation');
    input.hideTranslationSubtitle = true;
    const hidden = renderToStaticMarkup(React.createElement(ImmersiveLyrics, input));
    expect(hidden).not.toContain('Romanized line');
    expect(hidden).not.toContain('Translation');
});

it('cuts transitions for pause, reduced motion and static mode', () => {
    for (const scenario of ['pause', 'reduced', 'static']) {
        const input = props();
        input.paused = scenario === 'pause';
        input.staticMode = scenario === 'static';
        preference.reduced = scenario === 'reduced';
        const host = document.createElement('div');
        host.innerHTML = renderToStaticMarkup(React.createElement(ImmersiveLyrics, input));
        expect(host.querySelector('[aria-current="true"]')?.getAttribute('data-layout')).toBe('false');
        expect(host.querySelector('[aria-current="true"]')?.getAttribute('data-duration')).toBe('0');
    }
});

it('handles seeking, missing lyrics and untimed text', () => {
    const input = props();
    input.currentLineIndex = 2;
    input.currentTime.set(5.5);
    const seek = document.createElement('div');
    seek.innerHTML = renderToStaticMarkup(React.createElement(ImmersiveLyrics, input));
    expect(seek.querySelector('[aria-current="true"]')?.textContent).toBe('Third');
    input.lines = [];
    input.currentLineIndex = -1;
    expect(renderToStaticMarkup(React.createElement(ImmersiveLyrics, input))).toContain('ui.noLyricsAvailable');
    input.plainLyrics = 'Untimed words';
    const plain = document.createElement('div');
    plain.innerHTML = renderToStaticMarkup(React.createElement(ImmersiveLyrics, input));
    expect(plain.textContent).toContain('Untimed words');
    expect(plain.querySelector('p')?.tabIndex).toBe(0);
    expect(plain.querySelector('p')?.className).toContain('overflow-y-auto');
});

it('updates the surrounding lines when seeking between gaps while paused', () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const input = props();
    input.paused = true;
    input.currentLineIndex = -1;
    input.currentTime.set(2.5);
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() => root.render(React.createElement(ImmersiveLyrics, input)));
    expect(host.textContent).toContain('First');
    expect(host.textContent).toContain('Second line');
    expect(host.textContent).not.toContain('Third');
    act(() => input.currentTime.set(4.5));
    expect(host.textContent).not.toContain('First');
    expect(host.textContent).toContain('Second line');
    expect(host.textContent).toContain('Third');
    act(() => root.unmount());
});

it('keeps a long active line scrollable while constraining its neighbours', () => {
    const input = props();
    input.lyricsFontScale = 1.4;
    input.lines = input.lines.map(item => ({ ...item, fullText: 'A very long lyric '.repeat(35), translation: 'A long translation '.repeat(20) }));
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(React.createElement(ImmersiveLyrics, input));
    const active = host.querySelector<HTMLElement>('[aria-current="true"]')!;
    expect(active.style.overflowY).toBe('auto');
    expect(active.tabIndex).toBe(0);
    expect(active.parentElement?.className).toContain('max-h-full');
    expect([...host.querySelectorAll<HTMLElement>('[data-layout]')].filter(node => node !== active).every(node => node.style.maxHeight === '12vh')).toBe(true);
});
