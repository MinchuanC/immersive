// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import { expect, it, vi } from 'vitest';
import { PartitaChunk } from '@/components/visualizer/partita/PartitaChunk';
import { GlowWord } from '@/components/visualizer/GlowWord';
vi.mock('framer-motion', async importOriginal => {
    const original = await importOriginal<typeof import('framer-motion')>();
    return { ...original, AnimatePresence: ({ children }: any) => children, motion: {
        div: ({ children, animate }: any) => React.createElement('div', { 'data-status': typeof animate === 'string' ? animate : undefined, 'data-opacity': animate?.opacity }, children),
        span: ({ children }: any) => React.createElement('span', null, children),
    } };
});
it('renders a paused current word immediately and resyncs corrected timings without a clock tick', () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host);
    const currentTime = motionValue(60);
    const props = { word: { text: 'music', startTime: 58, endTime: 62 }, config: { id: 'test' }, currentTime,
        theme: {}, layoutVariants: {}, bodyVariants: {}, baseColor: '#fff', activeColor: '#fff', fontSize: '24px', layoutStyle: {},
        renderProfile: { wordRevealMode: 'normal', wordLookahead: .15, lineRenderEndTime: 65, lineTransitionMode: 'normal', renderHints: null } } as any;
    act(() => root.render(React.createElement(GlowWord, props)));
    expect(host.firstElementChild?.getAttribute('data-status')).toBe('active');
    act(() => root.render(React.createElement(GlowWord, { ...props, word: { ...props.word, endTime: 59 } })));
    expect(host.firstElementChild?.getAttribute('data-status')).toBe('passed');
    act(() => currentTime.set(50));
    expect(host.firstElementChild?.getAttribute('data-status')).toBe('waiting');
    act(() => root.unmount()); host.remove();
});


it('reveals the Partita parent chunk at paused time and resyncs timing/profile replacement', () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host);
    const currentTime = motionValue(60);
    const words = [{ text: 'music', startTime: 58, endTime: 62 }];
    const props = { chunkWords: words, displayWords: words, config: { id: 'chunk', x: 0, y: 0, rotate: 0, scale: 1 },
        guideIndex: 0, currentTime, theme: {}, layoutVariants: {}, bodyVariants: {}, baseColor: '#fff', fontSize: '24px', showGuideLines: false,
        renderProfile: { wordRevealMode: 'normal', wordLookahead: .15, lineRenderEndTime: 65, lineTransitionMode: 'normal', renderHints: null } } as any;
    act(() => root.render(React.createElement(PartitaChunk, props)));
    expect(host.firstElementChild?.getAttribute('data-opacity')).toBe('1');
    const laterWords = [{ ...words[0], startTime: 70, endTime: 72 }];
    act(() => root.render(React.createElement(PartitaChunk, { ...props, chunkWords: laterWords, displayWords: laterWords })));
    expect(host.firstElementChild?.getAttribute('data-opacity')).toBe('0');
    act(() => root.render(React.createElement(PartitaChunk, { ...props, chunkWords: laterWords, displayWords: laterWords, renderProfile: { ...props.renderProfile, wordLookahead: 11 } })));
    expect(host.firstElementChild?.getAttribute('data-opacity')).toBe('1');
    act(() => root.unmount()); host.remove();
});
