// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { resolveCycledPanelTab, usePlayerPanelTabShortcut } from '../../../src/hooks/usePlayerPanelTabShortcut';

// test/unit/player-panel/panelTabShortcut.test.ts
// Covers forward, reverse, wraparound, and stale-tab recovery for panel keyboard navigation.

const tabs = ['cover', 'controls', 'queue', 'account'] as const;

describe('player panel tab shortcut', () => {
    it('cycles forward and wraps to the first tab', () => {
        expect(resolveCycledPanelTab('controls', [...tabs], 1)).toBe('queue');
        expect(resolveCycledPanelTab('account', [...tabs], 1)).toBe('cover');
    });

    it('cycles backward and wraps to the last tab', () => {
        expect(resolveCycledPanelTab('queue', [...tabs], -1)).toBe('controls');
        expect(resolveCycledPanelTab('cover', [...tabs], -1)).toBe('account');
    });

    it('recovers when a source-specific current tab is no longer available', () => {
        expect(resolveCycledPanelTab('local', [...tabs], 1)).toBe('cover');
        expect(resolveCycledPanelTab('local', [...tabs], -1)).toBe('account');
    });

    it('returns null when there are no available tabs', () => {
        expect(resolveCycledPanelTab('cover', [], 1)).toBeNull();
    });
});


it('leaves Tab focus navigation alone and cycles with Ctrl+Tab', () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    const onTabChange = vi.fn();
    function Harness() { usePlayerPanelTabShortcut({ isOpen: true, currentTab: 'queue', availableTabs: [...tabs], onTabChange }); return null; }
    act(() => root.render(React.createElement(Harness)));
    for (const shiftKey of [false, true]) {
        const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, cancelable: true });
        window.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
    }
    expect(onTabChange).not.toHaveBeenCalled();
    const event = new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onTabChange).toHaveBeenCalledWith('account');
    act(() => root.unmount()); host.remove();
});
