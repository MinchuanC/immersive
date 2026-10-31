// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDockIdle } from '../../../src/integrations/mineradio/useDockIdle';

// Drive the dock's idle policy through real focus and pointer events without animation timing.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
function Fixture({ enabled = true, heldOpen = false }: { enabled?: boolean; heldOpen?: boolean }) {
    const { compact, ...handlers } = useDockIdle(enabled, heldOpen);
    return React.createElement('div', null,
        React.createElement('div', { ...handlers, 'data-dock': true, 'data-compact': compact },
            React.createElement('button', { 'data-first': true }, 'Play'),
            React.createElement('button', { 'data-second': true }, 'Next')),
        React.createElement('button', { 'data-outside': true }, 'Outside'));
}
const dock = () => host.querySelector<HTMLElement>('[data-dock]')!;
const first = () => host.querySelector<HTMLButtonElement>('[data-first]')!;
const outside = () => host.querySelector<HTMLButtonElement>('[data-outside]')!;
const compact = () => dock().dataset.compact === 'true';
const advance = (time: number) => act(() => vi.advanceTimersByTime(time));
const render = (enabled = true, heldOpen = false) => act(() => root.render(React.createElement(Fixture, { enabled, heldOpen })));
const pointer = (target: EventTarget, type: string, relatedTarget: EventTarget | null = null) => act(() => target.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget })));
const enter = () => pointer(dock(), 'pointerover', document.body);
const leave = () => pointer(dock(), 'pointerout', outside());
beforeEach(() => {
    vi.useFakeTimers();
    host = document.body.appendChild(document.createElement('div'));
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
});
describe('dock idle policy', () => {
    it('starts expanded and compacts after three seconds without pointer activity', () => {
        render();
        expect(compact()).toBe(false);
        advance(2999);
        expect(compact()).toBe(false);
        advance(1);
        expect(compact()).toBe(true);
    });
    it('postpones initial collapse on outside movement but never reveals a compact dock', () => {
        render();
        advance(2500);
        pointer(outside(), 'pointermove');
        advance(2999);
        expect(compact()).toBe(false);
        advance(1);
        expect(compact()).toBe(true);
        pointer(outside(), 'pointermove');
        advance(3000);
        expect(compact()).toBe(true);
    });
    it('expands and stays open on hover, then allows a cancellable 100ms leave grace', () => {
        render();
        advance(3000);
        enter();
        expect(compact()).toBe(false);
        advance(10000);
        expect(compact()).toBe(false);
        leave();
        pointer(outside(), 'pointermove');
        advance(99);
        expect(compact()).toBe(false);
        enter();
        advance(10000);
        expect(compact()).toBe(false);
        leave();
        advance(100);
        expect(compact()).toBe(true);
    });
    it('does not let focus from a pointer click pin the dock after leaving', () => {
        render();
        enter();
        pointer(first(), 'pointerdown');
        act(() => first().focus());
        pointer(first(), 'pointerup');
        leave();
        advance(100);
        expect(document.activeElement).toBe(first());
        expect(compact()).toBe(true);
    });
    it('holds keyboard focus within the dock until focus leaves', () => {
        render();
        advance(3000);
        act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })));
        act(() => first().focus());
        expect(compact()).toBe(false);
        advance(10000);
        expect(compact()).toBe(false);
        act(() => host.querySelector<HTMLButtonElement>('[data-second]')!.focus());
        advance(10000);
        expect(compact()).toBe(false);
        act(() => outside().focus());
        advance(100);
        expect(compact()).toBe(true);
    });
    it('holds programmatic accessibility focus and promotes pointer focus on keyboard use', () => {
        render();
        advance(3000);
        expect(compact()).toBe(true);
        act(() => first().focus());
        advance(10000);
        expect(compact()).toBe(false);
        pointer(first(), 'pointerdown');
        pointer(first(), 'pointerup');
        act(() => first().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
        advance(10000);
        expect(compact()).toBe(false);
    });
    it.each(['pointerup', 'pointercancel'])('holds a drag outside the dock until global %s', release => {
        render();
        enter();
        pointer(first(), 'pointerdown');
        act(() => first().focus());
        leave();
        advance(10000);
        expect(compact()).toBe(false);
        pointer(outside(), release);
        advance(99);
        expect(compact()).toBe(false);
        advance(1);
        expect(compact()).toBe(true);
    });
    it('releases a lost drag and keyboard hold when the window loses focus', () => {
        render();
        enter();
        pointer(first(), 'pointerdown');
        act(() => first().focus());
        act(() => first().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
        act(() => window.dispatchEvent(new Event('blur')));
        advance(100);
        expect(compact()).toBe(true);
        act(() => first().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
        expect(compact()).toBe(false);
    });
    it('repairs a missing pointer release when the pointer returns without a pressed button', () => {
        render();
        enter();
        pointer(first(), 'pointerdown');
        leave();
        advance(10000);
        pointer(outside(), 'pointermove');
        advance(100);
        expect(compact()).toBe(true);
    });
    it('holds an open modal and restarts idle time when it closes', () => {
        render();
        advance(3000);
        render(true, true);
        expect(compact()).toBe(false);
        advance(10000);
        expect(compact()).toBe(false);
        render(true, false);
        advance(2999);
        expect(compact()).toBe(false);
        advance(1);
        expect(compact()).toBe(true);
    });
    it('disables compact mode and clears pending timers until reenabled', () => {
        render();
        advance(3000);
        render(false);
        expect(compact()).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
        advance(10000);
        render();
        advance(3000);
        expect(compact()).toBe(true);
    });
    it('removes timers and global listeners on unmount', () => {
        const added = vi.spyOn(window, 'addEventListener');
        const removed = vi.spyOn(window, 'removeEventListener');
        render();
        const listeners = added.mock.calls.filter(([type]) => ['pointermove', 'pointerdown', 'pointerup', 'pointercancel', 'keydown', 'blur'].includes(type));
        act(() => root.unmount());
        root = createRoot(host);
        expect(vi.getTimerCount()).toBe(0);
        expect(listeners.length).toBeGreaterThan(0);
        for (const listener of listeners) expect(removed).toHaveBeenCalledWith(...listener);
    });
});
