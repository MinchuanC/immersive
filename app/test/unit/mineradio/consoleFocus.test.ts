// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { MineradioHostRegistration, openMineradioConsole, restoreMineradioConsoleFocus, consumeMineradioConsoleRequest } from '../../../src/integrations/mineradio/MineradioHost';

afterEach(() => { document.body.replaceChildren(); consumeMineradioConsoleRequest(); });
function button() {
    const node = document.body.appendChild(document.createElement('button'));
    node.getClientRects = () => [{}] as unknown as DOMRectList;
    return node;
}
it('activates the background when opening the console without a visible stage', () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    const activate = vi.fn();
    try {
        act(() => root.render(React.createElement(MineradioHostRegistration, { onOpenConsole: activate } as any)));
        act(() => openMineradioConsole());
        expect(activate).toHaveBeenCalledOnce();
        expect(consumeMineradioConsoleRequest()).toBe(true);
        const stage = document.body.appendChild(document.createElement('iframe'));
        stage.title = 'MineRadio visual stage';
        stage.getClientRects = () => [{}] as unknown as DOMRectList;
        act(() => openMineradioConsole());
        expect(activate).toHaveBeenCalledOnce();
    } finally { act(() => root.unmount()); }
});
it('returns to the actual opener, then falls back to the visible dock when it disappears', () => {
    const opener = button();
    const fallback = button();
    fallback.dataset.mineradioConsole = '';
    openMineradioConsole({ currentTarget: opener });
    fallback.focus();
    restoreMineradioConsoleFocus();
    expect(document.activeElement).toBe(opener);
    openMineradioConsole({ currentTarget: opener });
    opener.remove();
    restoreMineradioConsoleFocus();
    expect(document.activeElement).toBe(fallback);
    let clicked = false;
    fallback.onclick = () => { clicked = true; };
    (document.activeElement as HTMLElement).click();
    expect(clicked).toBe(true);
});
it('returns to an essential playback target when the dock extras have compacted', () => {
    const opener = button();
    opener.dataset.mineradioConsole = '';
    openMineradioConsole({ currentTarget: opener });
    opener.getClientRects = () => [] as unknown as DOMRectList;
    const play = button();
    play.id = 'play-btn';
    restoreMineradioConsoleFocus();
    expect(document.activeElement).toBe(play);
});
