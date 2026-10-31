// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import VisualizerSubtitleOverlay, { getUpcomingLyricsClassName } from '@/components/visualizer/VisualizerSubtitleOverlay';
import { DEFAULT_THEME } from '@/services/baseThemes';

const motionPreference = vi.hoisted(() => ({ reduced: false }));
vi.mock('@/hooks/useReducedMotionFor', () => ({ useReducedMotionFor: () => motionPreference.reduced }));
vi.mock('@/hooks/usePlayerBottomBarBottomPx', () => ({ usePlayerSubtitleBottomPx: () => 0 }));
vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
        div: ({ children, initial, animate, exit, transition, ...props }: any) => React.createElement('div', {
            ...props, 'data-initial-y': initial?.y, 'data-duration': transition?.duration ?? transition?.y?.duration,
        }, children),
    },
}));

afterEach(() => { document.body.innerHTML = ''; motionPreference.reduced = false; });

it('renders subtitle transitions without movement when reduced motion is enabled', () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    motionPreference.reduced = true;
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    act(() => root.render(React.createElement(VisualizerSubtitleOverlay, {
        showText: true, activeLine: { startTime: 1, endTime: 2, fullText: 'Song', translation: 'Translation', words: [] },
        recentCompletedLine: null, nextLines: [], theme: DEFAULT_THEME, translationFontSize: '1rem', upcomingFontSize: '1rem',
    })));
    const movingElements = host.querySelectorAll('[data-initial-y]');
    expect(movingElements).toHaveLength(2);
    expect([...movingElements].every(element => element.getAttribute('data-initial-y') === '0')).toBe(true);
    expect([...movingElements].every(element => element.getAttribute('data-duration') === '0')).toBe(true);
    expect(host.textContent).toContain('Translation');
    expect(getUpcomingLyricsClassName(true, true)).not.toContain('transition-all');
    expect(getUpcomingLyricsClassName(true, false)).toContain('transition-all');
    act(() => root.unmount());
});
