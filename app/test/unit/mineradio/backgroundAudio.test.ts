// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import { expect, it, vi } from 'vitest';
import MineradioBackground from '../../../src/components/visualizer/backgrounds/mineradio/MineradioBackground';
import { MineradioStage } from '../../../src/integrations/mineradio/MineradioStage';
import { usePlaybackStore } from '../../../src/stores/usePlaybackStore';
import type { VisualizerBackgroundRenderProps } from '../../../src/components/visualizer/backgrounds/definition';
import * as signals from '../../../src/stores/motionSignals';
import { installImmersionDirector } from '../../../src/services/immersion/director';
import type { SongResult } from '../../../src/types';
import type { VisualizerSharedProps } from '../../../src/components/visualizer/definition';

// The iframe boundary is sampled here; the signal controller stays real.
vi.mock('../../../src/integrations/mineradio/MineradioStage', () => ({ MineradioStage: vi.fn(() => null) }));
const surface = vi.hoisted(() => ({ isMainAppSurface: true }));
vi.mock('../../../src/utils/appSurface', () => surface);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('normalizes the live analyser at the stage boundary and clears paused samples', () => {
    const props = { audioBands: { bass: motionValue(64), mid: motionValue(96), treble: motionValue(32), spectrum: motionValue(new Uint8Array(32).fill(64)) }, audioPower: motionValue(80), paused: false } as VisualizerBackgroundRenderProps;
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    const previousSong = usePlaybackStore.getState().currentSong;
    const previousTime = signals.currentTime.get();
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    try {
        signals.currentTime.set(0);
        usePlaybackStore.setState({ currentSong: null });
        act(() => root.render(React.createElement(MineradioBackground, props)));
        const sample = vi.mocked(MineradioStage).mock.calls.at(-1)![0].sampleAudio!();
        expect(sample).not.toBeNull();
        for (const key of ['bass', 'mid', 'treble', 'energy'] as const) {
            expect(sample![key]).toBeGreaterThan(0);
            expect(sample![key]).toBeLessThan(1);
        }
        expect(sample!.regions).toHaveLength(16);
        clock.mockReturnValue(1100); signals.currentTime.set(.1);
        props.audioBands.spectrum!.set(new Uint8Array(32));
        vi.mocked(MineradioStage).mock.calls.at(-1)![0].sampleAudio!();
        clock.mockReturnValue(1300); signals.currentTime.set(.3);
        props.audioBands.spectrum!.set(new Uint8Array(32).fill(255));
        act(() => root.render(React.createElement(MineradioBackground, { ...props })));
        expect(vi.mocked(MineradioStage).mock.calls.at(-1)![0].sampleAudio!()!.beat).toBeGreaterThan(.5);
        act(() => root.render(React.createElement(MineradioBackground, { ...props, paused: true })));
        expect(vi.mocked(MineradioStage).mock.calls.at(-1)![0].sampleAudio!()).toBeNull();
    } finally {
        act(() => root.unmount()); host.remove();
        usePlaybackStore.setState({ currentSong: previousSong });
        signals.currentTime.set(previousTime); clock.mockRestore();
    }
});

it.each([{ main: true, preview: false }, { main: true, preview: true }, { main: false, preview: false }])('samples authored direction only in the main MineRadio lyric style ($main / $preview)', ({ main, preview }) => {
    const song: SongResult = { id: 1, name: 'Local', durationMs: 120_000, artists: [], album: { id: 1, name: 'Album' }, sourceRef: { kind: 'local', mediaId: 'one' } };
    const recipe = { intensity: 1, sonicGroundAmplitude: 42, sonicGroundMotionSpeed: 30, sonicGroundGlow: 25 };
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    const previousSong = usePlaybackStore.getState().currentSong;
    const previousTime = signals.currentTime.get();
    const stop = installImmersionDirector('local:one', time => ({ ...recipe, sonicGroundAmplitude: time }));
    try {
        surface.isMainAppSurface = main;
        usePlaybackStore.setState({ currentSong: song });
        signals.currentTime.set(42);
        const props = {
            audioBands: { bass: motionValue(0), mid: motionValue(0), treble: motionValue(0) }, audioPower: motionValue(0), paused: true,
            lyricView: { currentTime: motionValue(99), lines: [], isPreviewMode: preview } as unknown as VisualizerSharedProps,
        } as VisualizerBackgroundRenderProps & { lyricView: VisualizerSharedProps };
        act(() => root.render(React.createElement(MineradioBackground, props)));
        expect(vi.mocked(MineradioStage).mock.calls.at(-1)![0].sampleDirection!()).toEqual(main && !preview ? recipe : null);
    } finally {
        act(() => root.unmount()); host.remove(); stop();
        usePlaybackStore.setState({ currentSong: previousSong }); signals.currentTime.set(previousTime);
        surface.isMainAppSurface = true;
    }
});
