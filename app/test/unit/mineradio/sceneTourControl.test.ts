// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SceneTourControl, { stopSceneTour } from '../../../src/components/visualizer/backgrounds/mineradio/SceneTourControl';

const state = vi.hoisted(() => ({ preset: 0, background: 'mineradio' as string | null, reduced: false, staticMode: false, change: vi.fn(), motionListener: null as null | (() => void), visualizerListener: null as null | (() => void), themeListener: null as null | (() => void) }));
vi.mock('../../../src/hooks/useReducedMotionFor', () => ({ useReducedMotionFor: () => state.reduced }));
vi.mock('../../../src/stores/useMotionSettingsStore', () => ({
    readReducedMotion: () => state.reduced,
    useMotionSettingsStore: { subscribe: (listener: () => void) => { state.motionListener = listener; return () => { state.motionListener = null; }; } },
}));
vi.mock('../../../src/stores/useVisualizerSettingsStore', () => ({
    useVisualizerSettingsStore: { getState: () => ({
        visualizerBackgroundMode: state.background,
        mineradioBackgroundTuning: { preset: state.preset },
        handleSetMineradioBackgroundTuning: (patch: { preset: number }) => { state.preset = patch.preset; state.change(patch); },
    }), subscribe: (listener: (value: { visualizerBackgroundMode: string | null }) => void) => { state.visualizerListener = () => listener({ visualizerBackgroundMode: state.background }); return () => { state.visualizerListener = null; }; } },
}));
vi.mock('../../../src/stores/useThemeSettingsStore', () => ({
    useThemeSettingsStore: Object.assign((select: (value: { staticMode: boolean }) => boolean) => select({ staticMode: state.staticMode }), {
        getState: () => ({ staticMode: state.staticMode }),
        subscribe: (listener: (value: { staticMode: boolean }) => void) => { state.themeListener = () => listener({ staticMode: state.staticMode }); return () => { state.themeListener = null; }; },
    }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_: string, options: { defaultValue: string }) => options.defaultValue }) }));
vi.mock('../../../src/components/shared/QuickControlChip', () => ({
    QuickControlChip: ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) =>
        React.createElement('button', { onClick, disabled }, label),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
const render = () => act(() => root.render(React.createElement(SceneTourControl)));
const button = () => host.querySelector('button')!;

beforeEach(() => {
    vi.useFakeTimers();
    state.reduced = false;
    state.preset = 0;
    state.background = 'mineradio';
    state.staticMode = false;
    state.change.mockReset();
    host = document.body.appendChild(document.createElement('div'));
    root = createRoot(host);
});
afterEach(() => {
    act(() => { stopSceneTour(); root.unmount(); });
    host.remove();
    vi.useRealTimers();
});

describe('MineRadio scene tour', () => {
    it('cycles the 13 presets without repeats and stops on request', () => {
        state.preset = 12;
        render();
        act(() => button().click());
        act(() => vi.advanceTimersByTime(45_000 * 13));
        expect(state.change.mock.calls.map(([patch]) => patch.preset)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        act(() => button().click());
        act(() => vi.advanceTimersByTime(90_000));
        expect(state.change).toHaveBeenCalledTimes(13);
    });

    it('continues when the control closes, follows manual changes, and ends with the scene', () => {
        state.preset = NaN;
        render();
        act(() => button().click());
        act(() => vi.advanceTimersByTime(45_000));
        expect(state.change).toHaveBeenLastCalledWith({ preset: 0 });
        act(() => root.unmount());
        state.preset = 7;
        act(() => vi.advanceTimersByTime(45_000));
        expect(state.change).toHaveBeenLastCalledWith({ preset: 8 });
        root = createRoot(host);
        render();
        expect(button().textContent).toBe('Stop scene tour');
        act(() => stopSceneTour());
        act(() => vi.advanceTimersByTime(90_000));
        expect(state.change).toHaveBeenCalledTimes(2);
    });

    it('stops when reduced motion is enabled even if the control is closed', () => {
        render();
        act(() => button().click());
        act(() => root.unmount());
        state.reduced = true;
        act(() => state.motionListener?.());
        act(() => vi.advanceTimersByTime(90_000));
        expect(state.change).not.toHaveBeenCalled();
        root = createRoot(host);
        render();
        expect(button().disabled).toBe(true);
        state.reduced = false;
        render();
        act(() => vi.advanceTimersByTime(90_000));
        expect(state.change).not.toHaveBeenCalled();
    });

    it('stops when the active background changes away from MineRadio', () => {
        render();
        act(() => button().click());
        act(() => root.unmount());
        state.background = 'monet';
        act(() => state.visualizerListener?.());
        act(() => vi.advanceTimersByTime(90_000));
        expect(state.change).not.toHaveBeenCalled();
        expect(state.visualizerListener).toBeNull();
        state.background = 'mineradio';
        root = createRoot(host);
        render();
        expect(button().textContent).toBe('Start scene tour');
    });

    it('permits the default background when no explicit mode is stored', () => {
        state.background = null;
        render();
        act(() => button().click());
        act(() => vi.advanceTimersByTime(45_000));
        expect(state.change).toHaveBeenCalledWith({ preset: 1 });
    });

    it('stops and remains disabled in static mode', () => {
        render();
        act(() => button().click());
        act(() => root.unmount());
        state.staticMode = true;
        act(() => state.themeListener?.());
        act(() => vi.advanceTimersByTime(90_000));
        expect(state.change).not.toHaveBeenCalled();
        expect(state.themeListener).toBeNull();
        root = createRoot(host);
        render();
        expect(button().disabled).toBe(true);
    });
});
