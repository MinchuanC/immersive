// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { frame } from 'framer-motion';
import { expect, it, vi } from 'vitest';
import PanelHandle from '@/components/panelTab/shell/PanelHandle';
import { usePlayerPanelBottomPx } from '@/hooks/usePlayerBottomBarBottomPx';
import { playerBottomBarLiveOffset } from '@/stores/motionSignals';
const layout = vi.hoisted(() => ({ snapshot: null as any, listener: () => {} }));
vi.mock('@/services/playerOverlayLayout', () => ({ playerOverlayLayout: { nativeSource: {
    subscribe: (listener: () => void) => { layout.listener = listener; return () => {}; }, get: () => layout.snapshot,
} } }));
vi.mock('@/hooks/usePlayerOverlayLayout', () => ({ usePlayerOverlayObstacle: () => ({ ref: () => {}, invalidate: () => {} }) }));
vi.mock('react-i18next', async importOriginal => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }));
it('keeps the panel above a measured dock, following visibility and baseline changes', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host);
    let bottom: ReturnType<typeof usePlayerPanelBottomPx>;
    function Harness() { bottom = usePlayerPanelBottomPx(); return null; }
    playerBottomBarLiveOffset.set(0);
    act(() => root.render(React.createElement(Harness)));
    const base = bottom!.get();
    act(() => { layout.snapshot = { bounds: { left: 0, top: 0, width: 960, height: 640 }, obstacles: [{ role: 'playback', kind: 'control', rect: { left: 18, top: 526, width: 924, height: 96 } }] }; layout.listener(); });
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(bottom!.get()).toBe(126);
    act(() => { layout.snapshot = { ...layout.snapshot, obstacles: [] }; layout.listener(); });
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(bottom!.get()).toBe(base);
    act(() => playerBottomBarLiveOffset.set(50));
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(bottom!.get()).toBeGreaterThan(base);
    act(() => root.unmount()); host.remove(); playerBottomBarLiveOffset.set(0);
});

it('keeps the handle on the user baseline as dock height and visibility change', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host);
    const previousOffset = playerBottomBarLiveOffset.get();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    playerBottomBarLiveOffset.set(32);
    layout.snapshot = null;
    try {
        act(() => root.render(React.createElement(PanelHandle, {
            isOpen: false, onToggle() {}, theme: {} as any, isDaylight: false,
            showOpenPanelCloseButton: true, isPanelGuideHotspotActive: false,
            hideToggleButton: false, isCommandPaletteOpen: false,
        })));
        const handle = host.querySelector<HTMLElement>('[data-testid="panel-toggle"]')!;
        expect(handle.style.bottom).toBe('32px');
        for (const top of [526, 578]) {
            act(() => {
                layout.snapshot = { bounds: { left: 0, top: 0, width: 960, height: 640 }, obstacles: [{ role: 'playback', kind: 'control', rect: { left: 18, top, width: 924, height: 622 - top } }] };
                layout.listener();
            });
            await new Promise<void>(resolve => { frame.postRender(() => resolve()); });
            expect(handle.style.bottom).toBe('32px');
        }
        act(() => { layout.snapshot = { ...layout.snapshot, obstacles: [] }; layout.listener(); });
        await new Promise<void>(resolve => { frame.postRender(() => resolve()); });
        expect(handle.style.bottom).toBe('32px');
        act(() => playerBottomBarLiveOffset.set(82));
        await new Promise<void>(resolve => { frame.postRender(() => resolve()); });
        expect(handle.style.bottom).toBe('82px');
    } finally {
        act(() => root.unmount()); host.remove(); playerBottomBarLiveOffset.set(previousOffset);
        layout.snapshot = null;
        vi.unstubAllGlobals();
    }
});
