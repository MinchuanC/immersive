import { useEffect } from 'react';
import { create } from 'zustand';
import type { StageCollection, StageCommand, StageTrack } from './stageBridge';

// Supplies the one application's navigation and transport actions to the graphics background.
export interface MineradioHostValue {
    collections?: StageCollection[];
    queue?: StageTrack[];
    onCommand?: (command: StageCommand) => void;
    onOpenConsole?: () => void;
    audioAvailable?: boolean;
    showControls?: boolean;
    showLyrics?: boolean;
}
const useHost = create<MineradioHostValue>(() => ({}));
let owner: object | null = null;
export function MineradioHostRegistration(value: MineradioHostValue) {
    useEffect(() => {
        const token = {};
        owner = token;
        useHost.setState(value, true);
        return () => {
            if (owner === token) { owner = null; useHost.setState({}, true); }
        };
    }, [value.onCommand, value.onOpenConsole, value.collections, value.queue, value.audioAvailable, value.showControls, value.showLyrics]);
    return null;
}
export const useMineradioHost = () => useHost();
const useConsole = create<{ session: string | null }>(() => ({ session: null }));
export const useMineradioConsoleOpen = () => useConsole(state => state.session !== null);
export const setMineradioConsoleOpen = (session: string, open: boolean) => {
    useConsole.setState(state => open ? { session } : state.session === session ? { session: null } : state);
};
let consoleRequested = false;
let consoleOpener: HTMLElement | null = null;
export const openMineradioConsole = (event?: { currentTarget: EventTarget | null }) => {
    const opener = event?.currentTarget ?? document.activeElement;
    consoleOpener = opener instanceof HTMLElement ? opener : null;
    consoleRequested = true;
    if (![...document.querySelectorAll('iframe[title="MineRadio visual stage"]')].some(stage => stage.getClientRects().length > 0)) useHost.getState().onOpenConsole?.();
    window.dispatchEvent(new Event('immersive-mineradio-console'));
};
export const consumeMineradioConsoleRequest = () => {
    const requested = consoleRequested;
    consoleRequested = false;
    return requested;
};

export const restoreMineradioConsoleFocus = () => {
    const visible = (element: HTMLElement | null): element is HTMLElement => !!element?.isConnected && element.getClientRects().length > 0;
    const fallback = document.querySelector<HTMLElement>('[data-mineradio-console]');
    const play = document.getElementById('play-btn');
    const target = visible(consoleOpener) ? consoleOpener : visible(fallback) ? fallback : visible(play) ? play : null;
    consoleOpener = null;
    target?.focus();
};
