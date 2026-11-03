// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import { afterEach, expect, it, vi } from 'vitest';
import LatentBackground from '@/components/visualizer/backgrounds/latent/LatentBackground';
import MonetBackgroundLayer from '@/components/visualizer/backgrounds/monet/MonetBackgroundLayer';
import NomandBackgroundLayer from '@/components/visualizer/backgrounds/nomand/NomandBackgroundLayer';
import { useBackgroundLyricHoldStore } from '@/components/app/backgroundThrottling/backgroundLyricHoldStore';
import { useDesktopSettingsStore } from '@/stores/useDesktopSettingsStore';
import { DEFAULT_LATENT_BACKGROUND_TUNING, DEFAULT_NOMAND_BACKGROUND_TUNING, DEFAULT_MONET_BACKGROUND_TUNING, type AudioBands, type Theme } from '@/types';

// The real backgrounds must change only the external shader's pixel budget, without remounting it.
const shaders = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('@paper-design/shaders-react', async () => {
    const { createElement, useRef } = await import('react');
    return Object.fromEntries(['Dithering', 'MeshGradient', 'FlutedGlass', 'HalftoneDots', 'ImageDithering', 'LensDistortion', 'PaperTexture'].map(name => [name, (props: Record<string, unknown>) => {
        const instance = useRef({});
        shaders.set(name, { ...props, instance: instance.current });
        return createElement('div');
    }]));
});
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { useDesktopSettingsStore.setState({ lowPowerMode: false }); useBackgroundLyricHoldStore.setState({ held: false }); shaders.clear(); });
const theme = { backgroundColor: '#000000', primaryColor: '#ffffff', secondaryColor: '#888888', accentColor: '#ff0000' } as Theme;
const audioBands = Object.fromEntries(['bass', 'lowMid', 'mid', 'vocal', 'treble', 'energy'].map(name => [name, motionValue(0)])) as unknown as AudioBands;

function checkBudget(element: React.ReactNode, standardPixels: number) {
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    try {
        act(() => root.render(element));
        const standard = new Map(shaders);
        expect(standard.size).toBeGreaterThan(0);
        act(() => useDesktopSettingsStore.getState().handleToggleLowPowerMode(true));
        for (const [name, before] of standard) {
            expect(before.maxPixelCount).toBe(standardPixels);
            expect(shaders.get(name)).toEqual({ ...before, maxPixelCount: 640 * 360 });
        }
        act(() => useDesktopSettingsStore.getState().handleToggleLowPowerMode(false));
        expect(shaders).toEqual(standard);
    } finally { act(() => root.unmount()); host.remove(); }
}

it.each([false, true])('keeps Latent shader identity, tuning and motion when paused=%s', paused => {
    checkBudget(React.createElement(LatentBackground, { theme, audioPower: motionValue(0), audioBands, staticMode: false, paused,
        tuning: { ...DEFAULT_LATENT_BACKGROUND_TUNING, displayMode: 'both' } }), 1280 * 720);
});

it.each(['fluted-glass', 'halftone-dots', 'dithering', 'lens-distortion', 'paper-texture'] as const)('keeps %s shader identity and tuning', effect => {
    checkBudget(React.createElement(NomandBackgroundLayer, { theme, coverUrl: 'cover.png', tuning: { ...DEFAULT_NOMAND_BACKGROUND_TUNING, effect } }), 1920 * 1080);
});


it('stops Latent shaders only for a hidden Low Power window and resumes the same mounts', () => {
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    try {
        act(() => root.render(React.createElement(LatentBackground, { theme, audioPower: motionValue(0), audioBands, staticMode: false, paused: false })));
        const standard = new Map(shaders);
        act(() => useBackgroundLyricHoldStore.setState({ held: true }));
        expect(shaders).toEqual(standard);
        act(() => useDesktopSettingsStore.getState().handleToggleLowPowerMode(true));
        for (const [name, before] of standard) expect(shaders.get(name)).toEqual({ ...before, speed: 0, maxPixelCount: 640 * 360 });
        act(() => useBackgroundLyricHoldStore.setState({ held: false }));
        for (const [name, before] of standard) expect(shaders.get(name)).toEqual({ ...before, maxPixelCount: 640 * 360 });
    } finally { act(() => root.unmount()); host.remove(); }
});


it('cancels hidden Low Power Monet drift and restores it without changing the saved tuning', () => {
    const canvasContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    const tuning = { ...DEFAULT_MONET_BACKGROUND_TUNING, backgroundLayout: 'full-overlay' as const, backgroundDriftEnabled: true, backgroundDriftStrength: 0.5 };
    try {
        act(() => root.render(React.createElement(MonetBackgroundLayer, { theme, tuning })));
        expect(animate).toHaveBeenCalledOnce();
        act(() => useBackgroundLyricHoldStore.setState({ held: true }));
        expect(cancel).not.toHaveBeenCalled();
        act(() => useDesktopSettingsStore.getState().handleToggleLowPowerMode(true));
        expect(cancel).toHaveBeenCalledOnce();
        act(() => useBackgroundLyricHoldStore.setState({ held: false }));
        expect(animate).toHaveBeenCalledTimes(2);
        expect(tuning.backgroundDriftEnabled).toBe(true);
    } finally {
        act(() => root.unmount()); host.remove();
        canvasContext.mockRestore();
        if (descriptor) Object.defineProperty(HTMLElement.prototype, 'animate', descriptor);
        else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    }
});
