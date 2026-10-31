// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSpotifyPlaybackModeStore } from '@/services/onlineMusic/spotify/spotifyPlaybackMode';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { SongResult } from '@/types';
import { useExternalPlaybackStore } from '@/components/app/externalPlayback/useExternalPlaybackStore';
import SpotifyEmbeddedControl from '@/components/app/externalPlayback/spotify/SpotifyEmbeddedControl';

const request = vi.hoisted(() => vi.fn());
const stop = vi.hoisted(() => vi.fn());
vi.mock('@/services/onlineMusic/spotify/spotifyEmbeddedTransport', () => ({ requestSpotifyEmbedded: request }));
vi.mock('@/components/app/externalPlayback/spotify/spotifyPlaybackHandoff', () => ({ stopSpotifyEmbeddedPlayback: stop }));
vi.mock('react-i18next', async importOriginal => ({ ...(await importOriginal<typeof import('react-i18next')>()), useTranslation: () => ({ t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const song = { id: 'track', sourceRef: { kind: 'online', providerId: 'spotify', mediaId: 'track' } } as SongResult;
const originalPlayback = usePlaybackStore.getState();
beforeEach(() => { stop.mockResolvedValue(true); });
afterEach(() => { useSpotifyPlaybackModeStore.setState({ active: 'desktop', desired: 'desktop' }); usePlaybackStore.setState({ currentSong: originalPlayback.currentSong, playQueue: originalPlayback.playQueue, activePlaybackContext: originalPlayback.activePlaybackContext }); useExternalPlaybackStore.setState({ queue: null, queueStatus: 'unavailable' }); request.mockReset(); stop.mockReset(); document.body.innerHTML = ''; Reflect.deleteProperty(window, 'electron'); });

it('offers an explicit restart of the selected Spotify track without changing the queue', async () => {
    request.mockImplementation(async operation => operation === 'login_status' ? { nickname: 'Listener' } : null);
    Object.defineProperty(window, 'electron', { configurable: true, value: { embeddedPlaybackRequest: vi.fn() } });
    const queue = [song];
    usePlaybackStore.setState({ currentSong: song, playQueue: queue, activePlaybackContext: 'main' });
    useSpotifyPlaybackModeStore.setState({ active: 'desktop', desired: 'embedded' });
    const onPlayCurrent = vi.fn().mockResolvedValue(undefined);
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    await act(async () => { root.render(React.createElement(SpotifyEmbeddedControl, { onPlayCurrent })); });
    expect(host.textContent).toContain('Restarts this track from the beginning using your verified Spotify queue, or only this track if the queue is unavailable.');
    const button = [...host.querySelectorAll('button')].find(item => item.textContent === 'Restart current track with immersive playback');
    expect(button).toBeDefined();
    await act(async () => button!.click());
    expect(onPlayCurrent).toHaveBeenCalledOnce();
    expect(onPlayCurrent).toHaveBeenCalledWith(song, [song]);
    expect(usePlaybackStore.getState().playQueue).toBe(queue);
    await act(async () => root.unmount());
});

it('uses the verified current Spotify queue and never a stale queue', async () => {
    request.mockImplementation(async operation => operation === 'login_status' ? { nickname: 'Listener' } : null);
    Object.defineProperty(window, 'electron', { configurable: true, value: { embeddedPlaybackRequest: vi.fn() } });
    const next = { ...song, id: 'next', sourceRef: { kind: 'online', providerId: 'spotify', mediaId: 'next' } } as SongResult;
    const stale = { ...song, id: 'stale', sourceRef: { kind: 'online', providerId: 'spotify', mediaId: 'stale' } } as SongResult;
    usePlaybackStore.setState({ currentSong: song, playQueue: [stale], activePlaybackContext: 'main' });
    useSpotifyPlaybackModeStore.setState({ active: 'desktop', desired: 'embedded' });
    const onPlayCurrent = vi.fn();
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    await act(async () => { root.render(React.createElement(SpotifyEmbeddedControl, { onPlayCurrent })); });
    const click = async () => { const button = [...host.querySelectorAll('button')].find(item => item.textContent === 'Restart current track with immersive playback'); await act(async () => button!.click()); };
    useExternalPlaybackStore.setState({ queueStatus: 'ready', queue: [song, next] });
    await click();
    expect(onPlayCurrent).toHaveBeenLastCalledWith(song, [song, next]);
    useExternalPlaybackStore.setState({ queueStatus: 'ready', queue: [stale, next] });
    await click();
    expect(onPlayCurrent).toHaveBeenLastCalledWith(song, [song]);
    useExternalPlaybackStore.setState({ queueStatus: 'loading', queue: [song, next] });
    await click();
    expect(onPlayCurrent).toHaveBeenLastCalledWith(song, [song]);
    await act(async () => { usePlaybackStore.setState({ currentSong: next }); });
    useExternalPlaybackStore.setState({ queueStatus: 'ready', queue: [song, next] });
    await click();
    expect(onPlayCurrent).toHaveBeenLastCalledWith(next, [next]);
    await act(async () => root.unmount());
});

it('only offers the restart while a Spotify track and immersive mode are pending', async () => {
    request.mockImplementation(async operation => operation === 'login_status' ? { nickname: 'Listener' } : null);
    Object.defineProperty(window, 'electron', { configurable: true, value: { embeddedPlaybackRequest: vi.fn() } });
    useSpotifyPlaybackModeStore.setState({ active: 'desktop', desired: 'embedded' });
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    await act(async () => { root.render(React.createElement(SpotifyEmbeddedControl, { onPlayCurrent: vi.fn() })); });
    const offered = () => host.textContent?.includes('Restart current track with immersive playback');
    expect(offered()).toBe(false);
    await act(async () => { usePlaybackStore.setState({ currentSong: song, activePlaybackContext: 'main' }); });
    expect(offered()).toBe(true);
    await act(async () => { usePlaybackStore.setState({ activePlaybackContext: 'stage' }); });
    expect(offered()).toBe(false);
    await act(async () => { usePlaybackStore.setState({ activePlaybackContext: 'main', currentSong: { ...song, sourceRef: { kind: 'online', providerId: 'other', mediaId: 'track' } } }); });
    expect(offered()).toBe(false);
    await act(async () => { usePlaybackStore.setState({ currentSong: song }); useSpotifyPlaybackModeStore.setState({ active: 'embedded' }); });
    expect(offered()).toBe(false);
    await act(async () => root.unmount());
});

it('reports a restart failure without changing the queue or playback mode', async () => {
    request.mockImplementation(async operation => operation === 'login_status' ? { nickname: 'Listener' } : null);
    Object.defineProperty(window, 'electron', { configurable: true, value: { embeddedPlaybackRequest: vi.fn() } });
    const queue = [song];
    usePlaybackStore.setState({ currentSong: song, playQueue: queue, activePlaybackContext: 'main' });
    useSpotifyPlaybackModeStore.setState({ active: 'desktop', desired: 'embedded' });
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    await act(async () => { root.render(React.createElement(SpotifyEmbeddedControl, { onPlayCurrent: vi.fn().mockRejectedValue(new Error('Restart failed')) })); });
    const button = [...host.querySelectorAll('button')].find(item => item.textContent === 'Restart current track with immersive playback');
    expect(button).toBeDefined();
    await act(async () => button!.click());
    expect(host.querySelector('[role=alert]')?.textContent).toBe('Restart failed');
    expect(usePlaybackStore.getState().playQueue).toBe(queue);
    expect(useSpotifyPlaybackModeStore.getState()).toMatchObject({ active: 'desktop', desired: 'embedded' });
    await act(async () => root.unmount());
});

it('keeps desktop playback active when the listener requests embedded mode for the next selection', async () => {
    request.mockImplementation(async operation => operation === 'login_status' ? { nickname: 'Listener' } : null);
    Object.defineProperty(window, 'electron', { configurable: true, value: { embeddedPlaybackRequest: vi.fn() } });
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    await act(async () => { root.render(React.createElement(SpotifyEmbeddedControl)); });
    expect(host.textContent).toContain('unofficial');
    expect(host.textContent).toContain('may violate');
    const button = [...host.querySelectorAll('button')].find(item => item.textContent === 'Use immersive playback')!;
    await act(async () => button.click());
    expect(useSpotifyPlaybackModeStore.getState()).toMatchObject({ active: 'desktop', desired: 'embedded' });
    expect(host.textContent).toContain('next Spotify track');
    await act(async () => root.unmount());
});

it('cancels a sign-in created after the account panel has closed', async () => {
    let finish!: (value: { key: string; expiresInMs: number }) => void;
    request.mockImplementation(operation => operation === 'login_status' ? Promise.resolve(null)
        : operation === 'login_start' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(true));
    Object.defineProperty(window, 'electron', { configurable: true, value: { embeddedPlaybackRequest: vi.fn() } });
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    await act(async () => { root.render(React.createElement(SpotifyEmbeddedControl)); });
    const button = [...host.querySelectorAll('button')].find(item => item.textContent === 'Connect immersive audio')!;
    await act(async () => button.click());
    await act(async () => root.unmount());
    await act(async () => finish({ key: 'pending', expiresInMs: 10000 }));
    expect(request).toHaveBeenCalledWith('login_cancel', { key: 'pending' });
    expect(request).not.toHaveBeenCalledWith('login_open', { key: 'pending' });
});

it('does not sign out if a newer play superseded the audio stop', async () => {
    request.mockImplementation(async operation => operation === 'login_status' ? { nickname: 'Listener' } : null);
    stop.mockResolvedValue(false);
    Object.defineProperty(window, 'electron', { configurable: true, value: { embeddedPlaybackRequest: vi.fn() } });
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    await act(async () => { root.render(React.createElement(SpotifyEmbeddedControl)); });
    const button = [...host.querySelectorAll('button')].find(item => item.textContent === 'Disconnect immersive audio')!;
    await act(async () => button.click());
    expect(request).not.toHaveBeenCalledWith('logout');
    expect(host.textContent).toContain('Playback changed. Try disconnecting again.');
    await act(async () => root.unmount());
});
