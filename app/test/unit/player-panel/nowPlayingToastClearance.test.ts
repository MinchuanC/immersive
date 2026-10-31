// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import NowPlayingToast from '@/components/app/overlays/NowPlayingToast';
const layout = vi.hoisted(() => ({ snapshot: null as any, listener: () => {} }));
vi.mock('@/services/playerOverlayLayout', () => ({ playerOverlayLayout: { nativeSource: {
    subscribe: (listener: () => void) => { layout.listener = listener; return () => {}; }, get: () => layout.snapshot,
} } }));
vi.mock('@/hooks/usePlayerOverlayLayout', () => ({ usePlayerOverlayObstacle: () => ({ ref: () => {}, invalidate: () => {} }) }));
vi.mock('@/components/app/overlays/now-playing-toast/useTransitionBorderCue', () => ({ useTransitionBorderCue: () => null }));
vi.mock('react-i18next', async importOriginal => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }));
it('places the toast above the measured dock without feeding back its own obstacle', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host);
    const own = { role: 'now-playing', kind: 'control', rect: { left: 24, top: 350, width: 600, height: 72 } };
    const dock = { role: 'playback', kind: 'control', rect: { left: 18, top: 526, width: 924, height: 96 } };
    layout.snapshot = { bounds: { left: 0, top: 0, width: 960, height: 640 }, obstacles: [dock, own] };
    try {
        act(() => root.render(React.createElement(NowPlayingToast, {
            song: { title: 'Track', artist: 'Artist', coverUrl: null }, trackKey: 'track', isDaylight: false, mode: 'always',
        })));
        const toast = host.querySelector<HTMLElement>('.fixed.left-6')!;
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
        expect(parseFloat(toast.style.bottom)).toBe(126);
        act(() => { layout.snapshot = { ...layout.snapshot, obstacles: [{ ...dock, rect: { ...dock.rect, width: 240 } }, own] }; layout.listener(); });
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
        expect(parseFloat(toast.style.bottom)).toBe(126);
        act(() => { layout.snapshot = { ...layout.snapshot, obstacles: [own] }; layout.listener(); });
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
        expect(parseFloat(toast.style.bottom)).toBe(32);
    } finally { act(() => root.unmount()); host.remove(); }
});
