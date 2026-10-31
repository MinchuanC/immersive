// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppNavigation } from '@/hooks/useAppNavigation';
import { useAppViewStore } from '@/stores/useAppViewStore';
import { useCollectionNavigationStore } from '@/stores/useCollectionNavigationStore';
import { useSearchNavigationStore } from '@/stores/useSearchNavigationStore';
import { MineradioHome } from '@/integrations/mineradio/MineradioHome';
import { resolveNextUpTrack } from '@/components/app/overlays/now-playing-toast/resolveNextUpTrack';
import { usePlaybackInteractionBridge } from '@/components/app/playback/bridges/usePlaybackInteractionBridge';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { omni } from '@/services/onlineMusic/omni';
import { PlayerState, type SongResult } from '@/types';

// The dashboard is a navigation surface, not an independent layer covering library commands.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
let navigation: ReturnType<typeof useAppNavigation>;
const settle = () => act(async () => {
    for (let index = 0; index < 5; index++) await new Promise(resolve => setTimeout(resolve, 0));
});
const mount = (element: React.ReactElement) => act(() => root.render(element));
const NavigationHarness = () => { navigation = useAppNavigation(); return null; };

beforeEach(() => {
    localStorage.clear();
    useAppViewStore.setState({ view: 'home', isPanelOpen: false });
    useCollectionNavigationStore.setState({ snapshot: null });
    useSearchNavigationStore.getState().hideSearchOverlay();
    usePlaybackStore.setState({ currentSong: null, audioSrc: null, activePlaybackContext: 'main', isFmMode: false, playerState: PlayerState.PAUSED });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(async () => {
    act(() => root.unmount());
    host.remove();
    document.body.replaceChildren();
    vi.restoreAllMocks();
    await settle();
});

describe('dashboard and library navigation', () => {
    it('reveals library commands from the startup dashboard and restores dashboard on Back', async () => {
        mount(React.createElement(NavigationHarness));
        expect(useAppViewStore.getState().homeSurface).toBe('dashboard');
        const initialIndex = window.history.state.appHistoryIndex;
        act(() => navigation.navigateToHome());
        expect(useAppViewStore.getState().homeSurface).toBe('library');
        expect(window.history.state.appHistoryIndex).toBe(initialIndex + 1);
        window.history.back();
        await settle();
        expect(useAppViewStore.getState().homeSurface).toBe('dashboard');
    });

    it('keeps the library visible across player trips and opens collections from dashboard', async () => {
        mount(React.createElement(NavigationHarness));
        act(() => navigation.navigateToHome());
        act(() => navigation.navigateToPlayer());
        act(() => navigation.navigateBackFromPlayer());
        await settle();
        expect(useAppViewStore.getState().homeSurface).toBe('library');
        act(() => navigation.navigateToDashboard());
        act(() => navigation.navigateToCollection({ source: 'online', providerId: 'spotify', type: 'album', id: 'album', name: 'Album' }, 'home'));
        expect(useAppViewStore.getState().homeSurface).toBe('library');
        window.history.back();
        await settle();
        expect(useAppViewStore.getState().homeSurface).toBe('dashboard');
    });

    it('treats older history entries as library pages', () => {
        mount(React.createElement(NavigationHarness));
        act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: { view: 'home', appHistoryIndex: 1 } })));
        expect(useAppViewStore.getState().homeSurface).toBe('library');
    });
});

describe('dashboard next up', () => {
    const songs = ['a', 'b', 'c'].map(id => ({ id, name: 'Same title', artists: [], album: { id: 'album', name: 'Album' }, durationMs: 1000 } as SongResult));
    const queue = songs.map((song, index) => ({ id: String(index), title: song.name }));
    it('keeps native upcoming order unknown and opens the read-only queue view', () => {
        expect(resolveNextUpTrack({ playQueue: songs, song: songs[0], loopMode: 'off', isFmMode: false, isStageActive: false, isExternalQueue: true })).toBeNull();
        const onCommand = vi.fn();
        mount(React.createElement(MineradioHome, { externalQueue: true, queue: [], paused: false, onCommand }));
        expect(host.querySelector('#home-next-card')?.textContent).toContain('queue is unavailable');
        act(() => host.querySelector<HTMLButtonElement>('#home-next-card')!.click());
        expect(onCommand).toHaveBeenCalledWith({ action: 'openQueue' });
    });
    it('uses the canonical successor identity, including same-title recordings', () => {
        const successor = resolveNextUpTrack({ playQueue: songs, song: songs[1], loopMode: 'off', isFmMode: false, isStageActive: false });
        const onCommand = vi.fn();
        mount(React.createElement(MineradioHome, { metadata: { title: 'Same title' }, queue, nextUp: queue[songs.indexOf(successor!)], paused: true, onCommand }));
        act(() => host.querySelector<HTMLButtonElement>('#home-next-card')!.click());
        expect(onCommand).toHaveBeenCalledWith({ action: 'selectTrack', value: '2' });
    });
    it('does not invent a next-up track when the queue will not advance', () => {
        const onCommand = vi.fn();
        mount(React.createElement(MineradioHome, { metadata: { title: 'Same title' }, queue, nextUp: null, paused: true, onCommand }));
        expect(host.querySelector('#home-next-card')?.textContent).toContain('No upcoming track');
        act(() => host.querySelector<HTMLButtonElement>('#home-next-card')!.click());
        expect(onCommand).toHaveBeenCalledWith({ action: 'openQueue' });
    });
    it('opens the verified native queue rather than selecting from the saved app queue', () => {
        const onCommand = vi.fn();
        mount(React.createElement(MineradioHome, { metadata: { title: 'Current native track' }, queue, nextUp: queue[1], externalQueue: true, paused: true, onCommand }));
        act(() => host.querySelector<HTMLButtonElement>('#home-next-card')!.click());
        expect(onCommand).toHaveBeenCalledWith({ action: 'openQueue' });
    });
    it('shows an actionable permission state instead of a generic managed-in-Spotify message', () => {
        const onCommand = vi.fn();
        mount(React.createElement(MineradioHome, { metadata: { title: 'Native recording' }, queue: [], nextUp: null, externalQueue: true, externalQueueStatus: 'reconnect', externalSourceLabel: 'Spotify', paused: true, onCommand }));
        expect(host.querySelector('#home-next-card')?.textContent).toContain('Reconnect Spotify');
        act(() => host.querySelector<HTMLButtonElement>('#home-next-card')!.click());
        expect(onCommand).toHaveBeenCalledWith({ action: 'openQueue' });
    });
    it('shows a genuinely empty upcoming queue after a successful native read', () => {
        mount(React.createElement(MineradioHome, { metadata: { title: 'Native recording' }, queue: [{ id: '0', title: 'Native recording' }], nextUp: null, externalQueue: true, externalQueueStatus: 'ready', paused: true, onCommand() {} }));
        expect(host.querySelector('#home-next-card')?.textContent).toContain('Nothing queued after this track');
    });
    it('describes an unmatched queue as track state without diagnosing the account', () => {
        mount(React.createElement(MineradioHome, { metadata: { title: 'Native recording' }, queue: [], nextUp: null, externalQueue: true, externalQueueStatus: 'mismatch', externalSourceLabel: 'Spotify', paused: true, onCommand() {} }));
        expect(host.querySelector('#home-next-card')?.textContent).toContain('Waiting for Spotify’s queue to match this track');
        expect(host.querySelector('#home-next-card')?.textContent).not.toContain('account does not match');
    });
});

describe('external playback keyboard ownership', () => {
    it('toggles an external track with no audio URL but leaves fields and sheets alone', () => {
        vi.spyOn(omni, 'hasExternalPlayback').mockReturnValue(true);
        usePlaybackStore.setState({ currentSong: { id: 'external', name: 'External' } as SongResult });
        const resumePlayback = vi.fn(async () => {});
        function KeyboardHarness() {
            usePlaybackInteractionBridge({ stageActiveEntryKind: null, isNowPlayingStageActive: false, audioRef: { current: null },
                stageLyricsClockRef: { current: { startTimeSec: 0, endTimeSec: 10, baseTimeSec: 0, startedAtMs: null } },
                cyclePlayerChromeVisibilityMode: vi.fn(), handleNextTrack: vi.fn(), handlePrevTrack: vi.fn(), navigateBackFromPlayer: vi.fn(),
                pausePlayback: vi.fn(), resumePlayback, syncStageLyricsClock: vi.fn() });
            return null;
        }
        mount(React.createElement(KeyboardHarness));
        const space = () => new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
        act(() => window.dispatchEvent(space()));
        expect(resumePlayback).toHaveBeenCalledTimes(1);
        const input = document.createElement('input');
        document.body.appendChild(input);
        act(() => input.dispatchEvent(space()));
        expect(resumePlayback).toHaveBeenCalledTimes(1);
        for (const role of [null, 'switch', 'checkbox', 'radio']) {
            const button = document.createElement('button');
            if (role) button.setAttribute('role', role);
            document.body.appendChild(button);
            button.focus();
            const key = space();
            act(() => button.dispatchEvent(key));
            expect(key.defaultPrevented).toBe(false);
            expect(resumePlayback).toHaveBeenCalledTimes(1);
        }
        const sheet = document.createElement('div');
        sheet.setAttribute('data-folia-sheet', 'true');
        document.body.appendChild(sheet);
        act(() => window.dispatchEvent(space()));
        expect(resumePlayback).toHaveBeenCalledTimes(1);
    });
});
