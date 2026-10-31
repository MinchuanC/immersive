// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MotionValue } from 'framer-motion';
import type { FoliumPlayerLayout } from '@/mods/folium/contract';
import { PlayerBottomBarLayoutContext, PreviewBottomBarOffsetContext } from '@/components/floating-player/PlayerBottomBarLayoutContext';
import { usePlayerSubtitleBottomPx } from '@/hooks/usePlayerBottomBarBottomPx';
import { playerBottomBarLiveOffset } from '@/stores/motionSignals';
import { usePlayerChromeSettingsStore } from '@/stores/usePlayerChromeSettingsStore';

// Compact playback controls reserve subtitle clearance only in the playback host.
const layout = vi.hoisted(() => ({ snapshot: null as FoliumPlayerLayout | null }));
vi.mock('@/services/playerOverlayLayout', () => ({ playerOverlayLayout: { nativeSource: {
    subscribe: () => () => {}, get: () => layout.snapshot,
} } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let bottom: MotionValue<number>;

const Harness = ({ hidden }: { hidden: boolean }) => {
    bottom = usePlayerSubtitleBottomPx(hidden);
    return null;
};

const render = (hidden = true, isHost = true, previewOffset = 32) => {
    act(() => root.render(React.createElement(PlayerBottomBarLayoutContext.Provider, { value: isHost },
        React.createElement(PreviewBottomBarOffsetContext.Provider, { value: previewOffset },
            React.createElement(Harness, { hidden })))));
};

beforeEach(() => {
    container = document.body.appendChild(document.createElement('div'));
    root = createRoot(container);
    playerBottomBarLiveOffset.set(32);
    usePlayerChromeSettingsStore.setState({ hidePlayerProgressBar: false });
    layout.snapshot = {
        bounds: { left: 20, top: 100, width: 960, height: 640 },
        insets: { top: 0, right: 0, bottom: 0, left: 0 },
        obstacles: [{ role: 'playback', kind: 'control', rect: { left: 300, top: 650, width: 400, height: 54 } }],
    };
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    playerBottomBarLiveOffset.set(32);
    usePlayerChromeSettingsStore.setState({ hidePlayerProgressBar: false });
});

describe('compact playback subtitle clearance', () => {
    it('keeps subtitles twelve pixels above the measured compact dock while chrome is hidden', () => {
        render();
        expect(bottom.get()).toBe(102);
        expect(layout.snapshot!.bounds.top + layout.snapshot!.bounds.height - bottom.get())
            .toBe(layout.snapshot!.obstacles[0].rect.top - 12);
    });

    it('keeps the bare baseline when no playback control is registered', () => {
        layout.snapshot = { ...layout.snapshot!, obstacles: [] };
        render();
        expect(bottom.get()).toBe(32);
    });

    it('ignores reveal areas and controls with another role', () => {
        layout.snapshot = { ...layout.snapshot!, obstacles: [
            { ...layout.snapshot!.obstacles[0], kind: 'reveal-area' },
            { ...layout.snapshot!.obstacles[0], role: 'navigation' },
        ] };
        render();
        expect(bottom.get()).toBe(32);
    });

    it('preserves the normal visible control-bar geometry', () => {
        playerBottomBarLiveOffset.set(152);
        layout.snapshot = { ...layout.snapshot!, obstacles: [{
            ...layout.snapshot!.obstacles[0], rect: { left: 300, top: 400, width: 400, height: 54 },
        }] };
        render(false);
        expect(bottom.get()).toBe(232);
    });

    it('preserves preview and OBS offsets despite native playback obstacles', () => {
        playerBottomBarLiveOffset.set(300);
        render(false, false, 152);
        expect(bottom.get()).toBe(232);
    });

    it('keeps the hidden control-bar setting at the baseline without an obstacle', () => {
        usePlayerChromeSettingsStore.setState({ hidePlayerProgressBar: true });
        layout.snapshot = null;
        render(false);
        expect(bottom.get()).toBe(32);
    });
});
