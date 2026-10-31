// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import { afterEach, expect, it, vi } from 'vitest';
import ProgressBar from '@/components/ProgressBar';

// Checks fill writes and the existing seek contract without a running playback backend.
const cleanups: (() => void)[] = [];
afterEach(() => {
    cleanups.splice(0).forEach(cleanup => cleanup());
    vi.unstubAllGlobals();
});

function mountProgress() {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let resize: ((width: number) => void) | undefined;
    vi.stubGlobal('ResizeObserver', class {
        constructor(callback: ResizeObserverCallback) {
            resize = width => callback([{ devicePixelContentBoxSize: [{ inlineSize: width }] } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
        }
        observe() { resize?.(480); }
        disconnect() {}
    });
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    const currentTime = motionValue(50);
    const onSeek = vi.fn(), onSeekStart = vi.fn(), onSeekEnd = vi.fn();
    const render = (duration: number) => act(() => root.render(React.createElement(ProgressBar, {
        currentTime, duration, onSeek, onSeekStart, onSeekEnd,
    })));
    render(100);
    cleanups.push(() => { act(() => root.unmount()); host.remove(); });
    const fill = host.querySelector<HTMLElement>('[data-folium-part="progress.fill"]')!;
    const input = host.querySelector('input')!;
    return { fill, input, currentTime, onSeek, onSeekStart, onSeekEnd, render, resize: (width: number) => resize?.(width) };
}

it('writes the fill only after a quarter device-pixel step and redraws at the new width', () => {
    const view = mountProgress();
    const observer = new MutationObserver(() => {});
    observer.observe(view.fill, { attributes: true });
    cleanups.push(() => observer.disconnect());
    act(() => view.currentTime.set(50.005));
    expect(observer.takeRecords()).toHaveLength(0);
    act(() => view.currentTime.set(50.03));
    expect(view.fill.style.clipPath).toBe('inset(0 49.9479% 0 0 round 999px)');
    act(() => view.resize(960));
    expect(view.fill.style.clipPath).toBe('inset(0 49.9740% 0 0 round 999px)');
});

it('keeps drag input in control and holds the fill while duration is unknown', () => {
    const view = mountProgress();
    view.input.setPointerCapture = vi.fn();
    act(() => view.input.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(view.onSeekStart).toHaveBeenCalledOnce();
    act(() => view.currentTime.set(60));
    expect(view.fill.style.clipPath).toBe('inset(0 50.0000% 0 0 round 999px)');
    act(() => {
        view.input.value = '80';
        view.input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(view.fill.style.clipPath).toBe('inset(0 20.0000% 0 0 round 999px)');
    expect(view.onSeek).not.toHaveBeenCalled();
    act(() => view.currentTime.set(70));
    act(() => view.input.dispatchEvent(new Event('pointerup', { bubbles: true })));
    expect(view.onSeek).toHaveBeenCalledExactlyOnceWith(80);
    expect(view.onSeekEnd).toHaveBeenCalledOnce();
    view.render(0);
    expect(view.fill.style.clipPath).toBe('inset(0 20.0000% 0 0 round 999px)');
    view.render(100);
    expect(view.fill.style.clipPath).toBe('inset(0 30.0000% 0 0 round 999px)');
});
