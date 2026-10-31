// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MineradioDock, type MineradioDockProps } from '../../../src/integrations/mineradio/MineradioDock';
import type FloatingPlayerControls from '../../../src/components/FloatingPlayerControls';
import { PlayerState } from '../../../src/types';
import { audioPower, spectrum } from '../../../src/stores/motionSignals';
import { useMotionSettingsStore } from '../../../src/stores/useMotionSettingsStore';
import { MineradioHostRegistration } from '../../../src/integrations/mineradio/MineradioHost';
import { useThemeSettingsStore } from '../../../src/stores/useThemeSettingsStore';

// Exercise the merged transport's real DOM, while geometry registration stays outside jsdom.
const { invalidate } = vi.hoisted(() => ({ invalidate: vi.fn() }));
vi.mock('../../../src/hooks/usePlayerOverlayLayout', () => ({ usePlayerOverlayObstacle: () => ({ ref: () => {}, invalidate }) }));
vi.mock('../../../src/hooks/usePlayerBottomBarBottomPx', () => ({ usePlayerBottomBarBottomPx: () => 18 }));
vi.mock('react-i18next', async importOriginal => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
let controls: React.ComponentProps<typeof FloatingPlayerControls>;
const command = vi.fn();
const seek = vi.fn();
const clock = motionValue(5);
function render(paused = true, external = false, compactOnIdle = false) {
    act(() => root.render(React.createElement(React.Fragment, null,
        React.createElement(MineradioHostRegistration, { audioAvailable: !external }),
        React.createElement(MineradioDock, {
        metadata: { title: 'Current' }, currentTime: clock, duration: 180,
        paused, volume: .5, onCommand: command, controls, compactOnIdle,
    } as MineradioDockProps))));
}
function pointer(element: Element, type: string, x: number) {
    act(() => element.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, button: 0 }), { pointerId: 1 })));
}
beforeEach(() => {
    vi.clearAllMocks();
    clock.set(5);
    audioPower.set(0);
    spectrum.set(new Uint8Array([0]));
    useMotionSettingsStore.setState(state => ({ followSystemReducedMotion: false, reducedMotionSurfaces: { ...state.reducedMotionSurfaces, uiMicroMotion: false } }));
    useThemeSettingsStore.setState({ staticMode: false });
    host = document.body.appendChild(document.createElement('div'));
    root = createRoot(host);
    const captured = new WeakSet<Element>();
    Element.prototype.setPointerCapture = function () { captured.add(this); };
    Element.prototype.hasPointerCapture = function () { return captured.has(this); };
    Element.prototype.releasePointerCapture = function () { captured.delete(this); };
    controls = {
        currentSong: { name: 'Current' }, playerState: PlayerState.PAUSED,
        currentTime: clock, duration: 180, loopMode: 'off', currentView: 'player',
        audioSrc: 'blob:fixture', canTogglePlay: true, lyrics: null, isDaylight: false,
        onSeek: seek, onTogglePlay: vi.fn(), onToggleLoop: vi.fn(), onNavigateToPlayer: vi.fn(),
        slotPrimary: 'loop', slotSecondary: 'shuffle', onCommitBottomBarOffset: vi.fn(),
        slotContext: { onShuffle: vi.fn(), canShuffle: true, onLike: vi.fn(), isLiked: false, likeDisabled: false, invokeCommandById: vi.fn(), canInvokeCommandById: () => true },
        trackNavigation: { currentTrackKey: 'a', onPrev: vi.fn(), onNext: vi.fn(), canPrev: false, canNext: true, prevTitle: null, nextTitle: 'Next', prevLabel: 'Previous track', nextLabel: 'Next track' },
    };
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });
describe('glass dock shared control contract', () => {
    it('keeps essential controls mounted when idle chrome recedes', () => {
        vi.useFakeTimers();
        controls.isHidden = true;
        render(false, false, true);
        act(() => vi.advanceTimersByTime(3000));
        expect(host.querySelector('#bottom-bar')?.getAttribute('data-dock-state')).toBe('compact');
        expect(host.querySelector('#play-btn')).not.toBeNull();
        expect(host.querySelector('[role=slider]')).not.toBeNull();
        expect(host.querySelector('.control-cluster.modes')?.hasAttribute('inert')).toBe(true);
        act(() => host.querySelector<HTMLButtonElement>('#play-btn')!.click());
        expect(controls.onTogglePlay).toHaveBeenCalledOnce();
    });
    it('keeps an explicitly disabled bar hidden even with idle compaction enabled', () => {
        controls.hideControlBar = true;
        render(false, false, true);
        expect(host.querySelector('#bottom-bar')).toBeNull();
    });
    it('exposes shuffle as a direct action and respects queue availability', () => {
        render();
        const shuffle = host.querySelector<HTMLButtonElement>('#shuffle-btn');
        expect(shuffle).not.toBeNull();
        expect(shuffle?.getAttribute('aria-label')).toBe('Shuffle and play');
        act(() => shuffle!.click());
        expect(controls.slotContext.onShuffle).toHaveBeenCalledOnce();
        controls.slotContext.canShuffle = false;
        render();
        expect(host.querySelector<HTMLButtonElement>('#shuffle-btn')!.disabled).toBe(true);
    });
    it('previews many drag moves and commits one seek on release, preserving focus', () => {
        render();
        const slider = host.querySelector('[role=slider]') as HTMLElement;
        slider.getBoundingClientRect = () => ({ left: 0, width: 180 } as DOMRect);
        pointer(slider, 'pointerdown', 10);
        for (let x = 11; x <= 110; x++) pointer(slider, 'pointermove', x);
        expect(command).not.toHaveBeenCalled();
        expect(seek).not.toHaveBeenCalled();
        expect(slider.getAttribute('aria-valuenow')).toBe('110');
        act(() => clock.set(12));
        expect(slider.getAttribute('aria-valuenow')).toBe('110');
        pointer(slider, 'pointerup', 110);
        expect(seek).toHaveBeenCalledOnce();
        expect(seek.mock.calls[0][0]).toBeCloseTo(110);
        expect(document.activeElement).toBe(slider);
    });
    it('cancels a scrub without changing playback', () => {
        render();
        const slider = host.querySelector('[role=slider]') as HTMLElement;
        slider.getBoundingClientRect = () => ({ left: 0, width: 180 } as DOMRect);
        pointer(slider, 'pointerdown', 90);
        pointer(slider, 'pointercancel', 90);
        expect(seek).not.toHaveBeenCalled();
        expect(slider.getAttribute('aria-valuenow')).toBe('5');
    });
    it('keeps a stationary scrub at its chosen time while the dock expands', () => {
        render(true, false, true);
        const slider = host.querySelector('[role=slider]') as HTMLElement;
        slider.getBoundingClientRect = () => ({ left: 100, width: 400 } as DOMRect);
        pointer(slider, 'pointerdown', 200);
        expect(slider.getAttribute('aria-valuenow')).toBe('45');
        slider.getBoundingClientRect = () => ({ left: 0, width: 600 } as DOMRect);
        pointer(slider, 'pointerup', 200);
        expect(seek).toHaveBeenCalledExactlyOnceWith(45);
    });
    it('releases a drag preview after losing the window during a scrub', () => {
        render();
        const slider = host.querySelector('[role=slider]') as HTMLElement;
        slider.getBoundingClientRect = () => ({ left: 0, width: 180 } as DOMRect);
        pointer(slider, 'pointerdown', 90);
        act(() => window.dispatchEvent(new Event('blur')));
        act(() => clock.set(12));
        expect(slider.getAttribute('aria-valuenow')).toBe('12');
        expect(seek).not.toHaveBeenCalled();
    });
    it('supports vertical arrow keys without handing them to global transport', () => {
        render();
        const slider = host.querySelector('[role=slider]') as HTMLElement;
        const key = (value: string) => act(() => slider.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })));
        key('ArrowUp');
        expect(seek).toHaveBeenLastCalledWith(10);
        key('ArrowDown');
        expect(seek).toHaveBeenLastCalledWith(0);
    });
    it('announces the position as elapsed time', () => {
        render();
        const slider = host.querySelector('[role=slider]') as HTMLElement;
        expect(slider.getAttribute('aria-valuetext')).toBe('00:05 / 03:00');
    });
    it('restores the clock after losing pointer capture', () => {
        render();
        const slider = host.querySelector('[role=slider]') as HTMLElement;
        slider.getBoundingClientRect = () => ({ left: 0, width: 180 } as DOMRect);
        pointer(slider, 'pointerdown', 90);
        pointer(slider, 'lostpointercapture', 90);
        act(() => clock.set(12));
        expect(seek).not.toHaveBeenCalled();
        expect(slider.getAttribute('aria-valuenow')).toBe('12');
    });
    it('uses canonical availability and configured actions', () => {
        render();
        expect((host.querySelector('#prev-btn') as HTMLButtonElement).disabled).toBe(true);
        act(() => (host.querySelector('#next-btn') as HTMLButtonElement).click());
        expect(controls.trackNavigation!.onNext).toHaveBeenCalledOnce();
        act(() => (host.querySelector('[data-ponder-slot=shuffle]') as HTMLButtonElement).click());
        expect(controls.slotContext.onShuffle).toHaveBeenCalledOnce();
        controls.canTogglePlay = false;
        render();
        expect((host.querySelector('#play-btn') as HTMLButtonElement).disabled).toBe(true);
    });
    it('honors hidden chrome and the control-bar setting', () => {
        controls.isHidden = true;
        render();
        expect(host.querySelector('#bottom-bar')).toBeNull();
        controls.isHidden = false;
        controls.hideControlBar = true;
        render();
        expect(host.querySelector('#bottom-bar')).toBeNull();
    });
    it('refreshes duration when metadata arrives at the same paused position', () => {
        controls.duration = 0;
        act(() => root.render(React.createElement(MineradioDock, { metadata: { title: 'Current' }, currentTime: clock, duration: 0, paused: true, volume: .5, onCommand: command, controls })));
        render();
        expect(host.querySelector('#time-display')?.textContent).toBe('00:05 / 03:00');
    });

    it('follows bounded local energy on one decorative child without invalidating dock geometry', () => {
        render(false);
        const line = host.querySelector<HTMLElement>('.mineradio-dock-accent')!;
        expect(line).not.toBeNull();
        expect(line.getAttribute('aria-hidden')).toBe('true');
        const parentStyle = host.querySelector('#bottom-bar')!.getAttribute('style');
        invalidate.mockClear();
        for (const [energy, opacity] of [[51, '0.2'], [127.5, '0.5'], [255, '1'], [500, '1'], [-20, '0'], [Number.NaN, '0']]) {
            act(() => audioPower.set(energy as number));
            expect(line.style.opacity).toBe(opacity);
        }
        act(() => audioPower.set(255));
        act(() => spectrum.set(new Uint8Array(0)));
        expect(line.style.opacity).toBe('0');
        expect(host.querySelector('#bottom-bar')!.getAttribute('style')).toBe(parentStyle);
        expect(invalidate).not.toHaveBeenCalled();
    });

    it('settles local feedback on pause, visibility loss and the UI motion policy', () => {
        render(false);
        const line = () => host.querySelector<HTMLElement>('.mineradio-dock-accent')!;
        act(() => audioPower.set(255));
        expect(line().style.opacity).toBe('1');
        render();
        expect(line().style.opacity).toBe('0');
        render(false);
        act(() => useMotionSettingsStore.setState(state => ({ reducedMotionSurfaces: { ...state.reducedMotionSurfaces, uiMicroMotion: true } })));
        expect(line().style.opacity).toBe('0');
        act(() => useMotionSettingsStore.setState(state => ({ reducedMotionSurfaces: { ...state.reducedMotionSurfaces, uiMicroMotion: false } })));
        expect(line().style.opacity).toBe('1');
        const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        act(() => document.dispatchEvent(new Event('visibilitychange')));
        expect(line().style.opacity).toBe('0');
        hidden.mockReturnValue(false);
        act(() => document.dispatchEvent(new Event('visibilitychange')));
        expect(line().style.opacity).toBe('1');
    });

    it('uses separate ambience for external playback and stops it under the same gates', () => {
        render(false, true);
        const line = () => host.querySelector<HTMLElement>('.mineradio-dock-accent')!;
        act(() => audioPower.set(255));
        expect(line().classList.contains('is-ambient')).toBe(true);
        expect(line().style.opacity).toBe('0');
        render(true, true);
        expect(line().classList.contains('is-ambient')).toBe(false);
        render(false, true);
        act(() => useMotionSettingsStore.setState(state => ({ reducedMotionSurfaces: { ...state.reducedMotionSurfaces, uiMicroMotion: true } })));
        expect(line().classList.contains('is-ambient')).toBe(false);
        controls.isHidden = true;
        render(false, true);
        expect(host.querySelector('.mineradio-dock-accent')).toBeNull();
    });

    it.each([false, true])('stops the dock accent in static mode independently of UI motion, external=%s', external => {
        render(false, external);
        act(() => audioPower.set(255));
        const line = host.querySelector<HTMLElement>('.mineradio-dock-accent')!;
        expect(line.style.opacity).toBe(external ? '0' : '1');
        expect(line.classList.contains('is-ambient')).toBe(external);
        act(() => useThemeSettingsStore.setState({ staticMode: true }));
        expect(line.style.opacity).toBe('0');
        expect(line.classList.contains('is-ambient')).toBe(false);
        act(() => useThemeSettingsStore.setState({ staticMode: false }));
        expect(line.style.opacity).toBe(external ? '0' : '1');
        expect(line.classList.contains('is-ambient')).toBe(external);
    });
});
