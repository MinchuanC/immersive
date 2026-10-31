// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import AppShell from '@/components/app/AppShell';
import NowPlayingToast from '@/components/app/overlays/NowPlayingToast';
import { MineradioDock } from '@/integrations/mineradio/MineradioDock';
import { playerOverlayLayout } from '@/services/playerOverlayLayout';
vi.mock('@/components/app/overlays/now-playing-toast/useTransitionBorderCue', () => ({ useTransitionBorderCue: () => null }));
vi.mock('react-i18next', async importOriginal => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }));
it('measures Home dock clearance through the real shell while keeping mod layout player-only', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} });
    const geometry = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this.id === 'bottom-bar') return rect(160, 776, 1120, 106);
        if (this.classList.contains('left-6')) return rect(24, 900 - parseFloat(this.style.bottom || '32') - 62, 240, 62);
        return rect(0, 0, 1440, 900);
    });
    const publicChanges: boolean[] = [];
    const stop = playerOverlayLayout.source.subscribe(() => publicChanges.push(playerOverlayLayout.source.get() !== null));
    const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host);
    const props = { appStyle: {}, isElectronWindow: false, hideFullscreenButton: false, usesCustomWindowChrome: false,
        useCustomWindowRadius: false, showTransparentWindowBorder: false, isPlayerView: false, hasPersistentPlayerControls: true,
        isTitlebarRevealed: false, alwaysShowMainWindowTitlebar: false, isMainWindowClickThroughEnabled: false,
        showMainWindowClickThroughToggle: false, onToggleMainWindowClickThrough() {}, isDaylight: false, theme: {} as any, audioElement: null };
    function render(player: boolean) {
        act(() => root.render(React.createElement(AppShell, { ...props, isPlayerView: player, children: React.createElement(React.Fragment, null,
            React.createElement(MineradioDock, { currentTime: 0, duration: 60, paused: true, volume: .5, onCommand() {} }),
            React.createElement(NowPlayingToast, { song: { title: 'Track', artist: null, coverUrl: null }, trackKey: 'track', mode: 'always', isDaylight: false }),
        ) })));
    }
    try {
        render(false);
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)); });
        const toast = host.querySelector<HTMLElement>('.fixed.left-6')!;
        expect(parseFloat(toast.style.bottom)).toBe(136);
        expect(toast.getBoundingClientRect().bottom).toBeLessThan(host.querySelector('#bottom-bar')!.getBoundingClientRect().top);
        expect(playerOverlayLayout.source.get()).toBeNull();
        render(true);
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)); });
        expect(playerOverlayLayout.source.get()?.bounds.width).toBe(1440);
        expect(publicChanges.at(-1)).toBe(true);
        render(false);
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)); });
        expect(playerOverlayLayout.source.get()).toBeNull();
        expect(parseFloat(toast.style.bottom)).toBe(136);
        expect(publicChanges.at(-1)).toBe(false);
    } finally {
        act(() => root.unmount()); host.remove();
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 120)); });
        expect(playerOverlayLayout.nativeSource.get()).toBeNull();
        expect(playerOverlayLayout.source.get()).toBeNull();
        stop(); geometry.mockRestore();
    }
});
