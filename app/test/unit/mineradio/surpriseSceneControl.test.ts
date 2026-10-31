// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import SurpriseSceneControl, { chooseSurpriseScene } from '../../../src/components/visualizer/backgrounds/mineradio/SurpriseSceneControl';

const state = vi.hoisted(() => ({
    tuning: { preset: 3, cameraStateJson: '{"cameraViewSaved":true}', intensity: 0.8 },
    patch: vi.fn(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }) }));
vi.mock('../../../src/components/shared/QuickControlChip', () => ({
    QuickControlChip: ({ onClick, label }: { onClick: () => void; label: string }) => React.createElement('button', { onClick }, label),
}));
vi.mock('../../../src/stores/useVisualizerSettingsStore', () => ({
    useVisualizerSettingsStore: { getState: () => ({
        mineradioBackgroundTuning: state.tuning,
        handleSetMineradioBackgroundTuning: (patch: { preset: number }) => { state.patch(patch); state.tuning = { ...state.tuning, ...patch }; },
    }) },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); state.patch.mockClear(); state.tuning = { preset: 3, cameraStateJson: '{"cameraViewSaved":true}', intensity: 0.8 }; });

it('chooses a valid scene different from the current one across boundaries', () => {
    for (let current = 0; current < 13; current++) {
        for (let index = 0; index < 12; index++) {
            const next = chooseSurpriseScene(current, () => index / 12);
            expect(next).toBeGreaterThanOrEqual(0);
            expect(next).toBeLessThan(13);
            expect(next).not.toBe(current);
        }
    }
    expect(chooseSurpriseScene(-1, () => 0)).toBe(0);
    expect(chooseSurpriseScene(NaN, () => 0.9999)).toBe(12);
});

it('changes only the scene on click, preserving camera and other tuning', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    act(() => root.render(React.createElement(SurpriseSceneControl)));
    act(() => host.querySelector('button')!.click());
    expect(state.patch).toHaveBeenCalledWith({ preset: 0 });
    expect(state.tuning.cameraStateJson).toBe('{"cameraViewSaved":true}');
    expect(state.tuning.intensity).toBe(0.8);
    act(() => root.unmount());
});
