// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VisualMoodControl from '../../../src/components/visualizer/backgrounds/mineradio/VisualMoodControl';
import type { StageSettings } from '../../../src/integrations/mineradio/stageBridge';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }) }));
vi.mock('../../../src/components/shared/QuickControlChip', () => ({
    QuickControlChip: ({ label, onClick }: { label: string; onClick: () => void }) => React.createElement('button', { onClick }, label),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
const original: StageSettings = { intensity: 0.7, speed: 0.8, bloomStrength: 0.3, bloom: false, preset: 4, cameraStateJson: '{"camera":1}' };

afterEach(() => { if (root) act(() => root!.unmount()); host?.remove(); root = null; host = null; });

describe('visual moods', () => {
    it('applies each mood without changing the scene or camera, then restores previous settings', () => {
        let current: StageSettings = original;
        function Harness() {
            const [tuning, setTuning] = useState(original);
            current = tuning;
            return React.createElement(VisualMoodControl, { tuning, onTuningChange: patch => setTuning(previous => ({ ...previous, ...patch }) as StageSettings) });
        }
        host = document.body.appendChild(document.createElement('div'));
        root = createRoot(host);
        act(() => root!.render(React.createElement(Harness)));
        const click = (label: string) => act(() => [...host!.querySelectorAll('button')].find(button => button.textContent === label)!.click());
        click('Calm');
        expect(current.intensity).not.toBe(original.intensity);
        click('Balanced');
        click('Vivid');
        expect(current.bloom).toBe(true);
        expect(current.preset).toBe(4);
        expect(current.cameraStateJson).toBe(original.cameraStateJson);
        click('Restore');
        expect(current).toEqual(original);
    });

    it('keeps settings changed manually after a mood was applied', () => {
        let current: StageSettings = original;
        function Harness() {
            const [tuning, setTuning] = useState(original);
            current = tuning;
            return React.createElement(React.Fragment, null,
                React.createElement(VisualMoodControl, { tuning, onTuningChange: patch => setTuning(previous => ({ ...previous, ...patch }) as StageSettings) }),
                React.createElement('button', { onClick: () => setTuning(previous => ({ ...previous, speed: 0.42 })) }, 'Manual'));
        }
        host = document.body.appendChild(document.createElement('div'));
        root = createRoot(host);
        act(() => root!.render(React.createElement(Harness)));
        const click = (label: string) => act(() => [...host!.querySelectorAll('button')].find(button => button.textContent === label)!.click());
        click('Calm');
        click('Manual');
        click('Restore');
        expect(current.speed).toBe(0.42);
        expect(current.intensity).toBe(original.intensity);
    });

    it('restores the latest manual value when a later mood temporarily replaces it', () => {
        let current: StageSettings = original;
        function Harness() {
            const [tuning, setTuning] = useState(original);
            current = tuning;
            return React.createElement(React.Fragment, null,
                React.createElement(VisualMoodControl, { tuning, onTuningChange: patch => setTuning(previous => ({ ...previous, ...patch }) as StageSettings) }),
                React.createElement('button', { onClick: () => setTuning(previous => ({ ...previous, speed: 0.42 })) }, 'Manual'));
        }
        host = document.body.appendChild(document.createElement('div'));
        root = createRoot(host);
        act(() => root!.render(React.createElement(Harness)));
        const click = (label: string) => act(() => [...host!.querySelectorAll('button')].find(button => button.textContent === label)!.click());
        click('Calm');
        click('Manual');
        click('Vivid');
        click('Restore');
        expect(current.speed).toBe(0.42);
        expect(current.intensity).toBe(original.intensity);
    });

    it('keeps undo available after closing and reopening the controls', () => {
        let current: StageSettings = original;
        function Harness() {
            const [tuning, setTuning] = useState(original);
            const [open, setOpen] = useState(true);
            current = tuning;
            return React.createElement(React.Fragment, null,
                open && React.createElement(VisualMoodControl, { tuning, onTuningChange: patch => setTuning(previous => ({ ...previous, ...patch }) as StageSettings) }),
                React.createElement('button', { onClick: () => setOpen(value => !value) }, 'Toggle controls'));
        }
        host = document.body.appendChild(document.createElement('div'));
        root = createRoot(host);
        act(() => root!.render(React.createElement(Harness)));
        const click = (label: string) => act(() => [...host!.querySelectorAll('button')].find(button => button.textContent === label)!.click());
        click('Calm');
        click('Toggle controls');
        click('Toggle controls');
        click('Restore');
        expect(current).toEqual(original);
    });
});
