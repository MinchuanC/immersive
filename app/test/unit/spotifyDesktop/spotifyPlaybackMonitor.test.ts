// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SpotifyPlaybackMonitor from '@/components/app/externalPlayback/spotify/SpotifyPlaybackMonitor';
import { startPlay } from '@/components/app/playback/currentSong';
import { useSpotifyPlaybackModeStore } from '@/services/onlineMusic/spotify/spotifyPlaybackMode';

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), interrupt: vi.fn(), monitorFailure: vi.fn() }));
vi.mock('@/services/onlineMusic/spotify/spotifyDesktopPlayback', () => ({ spotifyDesktopPlayback: { snapshot: mocks.snapshot } }));
vi.mock('@/components/app/externalPlayback/externalPlaybackRuntime', () => ({ getExternalIntentRevision: () => 0 }));
vi.mock('@/components/app/externalPlayback/spotify/spotifyDesktopInterruption', () => ({
    interruptEmbeddedForDesktop: mocks.interrupt,
    stopEmbeddedForMonitoringFailure: mocks.monitorFailure,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
    Object.defineProperty(window, 'electron', { value: {}, configurable: true });
    useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
    root = createRoot(document.body.appendChild(document.createElement('div')));
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
    delete (window as unknown as { electron?: unknown }).electron;
    useSpotifyPlaybackModeStore.setState({ active: 'desktop', desired: 'desktop' });
    vi.resetAllMocks();
});

it('ignores a desktop snapshot when a new play starts before the snapshot resolves', async () => {
    let finish!: (value: unknown) => void;
    mocks.snapshot.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await act(async () => { root.render(React.createElement(SpotifyPlaybackMonitor)); });
    startPlay();
    await act(async () => { finish({ availability: 'ready', state: 'playing' }); });
    expect(mocks.interrupt).not.toHaveBeenCalled();
});

it('still handles a current desktop snapshot when no new play started', async () => {
    mocks.snapshot.mockResolvedValue({ availability: 'ready', state: 'playing' });
    await act(async () => { root.render(React.createElement(SpotifyPlaybackMonitor)); });
    expect(mocks.interrupt).toHaveBeenCalledOnce();
});

it('ignores a monitoring failure that arrived after a newer play started', async () => {
    let fail!: (error: Error) => void;
    mocks.snapshot.mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
    await act(async () => { root.render(React.createElement(SpotifyPlaybackMonitor)); });
    startPlay();
    await act(async () => { fail(new Error('desktop unavailable')); });
    expect(mocks.monitorFailure).not.toHaveBeenCalled();
});
