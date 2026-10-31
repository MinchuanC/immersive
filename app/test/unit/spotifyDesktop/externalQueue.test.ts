// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { UnifiedSong } from '@/types';
import { OnlineProviderError } from '@/types/onlineMusic';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useExternalPlaybackStore } from '@/components/app/externalPlayback/useExternalPlaybackStore';
import { useExternalPlaybackIntegration } from '@/components/app/externalPlayback/useExternalPlaybackIntegration';
import QueueTab from '@/components/panelTab/QueueTab';
import { closeLoginWindow, useLoginWindowStore } from '@/components/login/loginWindowStore';

const env = vi.hoisted(() => ({ read: vi.fn(), connection: vi.fn(), revision: 0 }));
vi.mock('@/services/onlineMusic/omni', () => ({ omni: {
    hasExternalPlayback: (song: UnifiedSong) => song.sourceRef.kind === 'online',
    getExternalPlaybackQueue: (...args: unknown[]) => env.read(...args), getProviderLabel: () => 'Spotify',
    getExternalPlaybackConnectionStatus: (...args: unknown[]) => env.connection(...args),
} }));
vi.mock('@/components/app/externalPlayback/externalPlaybackRuntime', () => ({
    attachExternalPlaybackRuntime: () => () => {}, getExternalWatchSong: () => null, observeExternalPlayback() {},
    getExternalIntentRevision: () => env.revision,
    usesExternalQueue: (song: UnifiedSong | null) => song?.sourceRef.kind === 'online',
}));
vi.mock('@/components/app/externalPlayback/useExternalPlaybackSync', () => ({ useExternalPlaybackSync() {} }));
vi.mock('react-i18next', async importOriginal => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/modal/settings/kit/motion', () => ({ useKitReducedMotion: () => true }));
const song = (letter: string): UnifiedSong => ({ id: letter.repeat(22), name: `Song ${letter}`, artists: [], album: { id: '', name: '' }, durationMs: 120000,
    sourceRef: { kind: 'online', providerId: 'spotify', mediaId: letter.repeat(22) } });
const current = song('a'); const upcoming = song('b'); const stale = song('c');
let root: Root; let host: HTMLDivElement;
function Harness() {
    useExternalPlaybackIntegration({ audioRef: { current: null }, abortTransition() {}, setLyrics() {}, setIsLyricsLoading() {}, persistSession: async () => {} });
    return null;
}
const mount = async () => { await act(async () => root.render(React.createElement(Harness))); };
const showQueue = async (shown = current) => {
    await act(async () => root.render(React.createElement(QueueTab, {
        playQueue: [stale], currentSong: shown, queueScrollRef: { current: null }, onPlaySong() {},
        onRemoveSong() {}, onMoveSongToEnd() {}, onMoveSongToNext() {},
    })));
};
beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    Object.defineProperty(window, 'electron', { configurable: true, value: {} });
    env.read.mockReset().mockResolvedValue({ currentSong: current, songs: [upcoming, upcoming] });
    env.revision = 0;
    env.connection.mockReset().mockResolvedValue({ configured: true, connected: true, encryptionAvailable: true, clientId: '' });
    usePlaybackStore.setState({ currentSong: current, playQueue: [stale] });
    useExternalPlaybackStore.setState({ context: null, queue: null, queueStatus: 'unavailable' });
    host = document.body.appendChild(document.createElement('div')); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); closeLoginWindow(); Reflect.deleteProperty(window, 'electron'); vi.unstubAllGlobals(); vi.useRealTimers(); });
it('never presents the saved app playlist as the Spotify queue', async () => {
    await showQueue();
    expect(host.textContent).not.toContain(stale.name);
    expect(host.textContent).toContain('Spotify queue is unavailable');
});
it('shows the verified queue without allowing a row click to replace Spotify context', async () => {
    useExternalPlaybackStore.setState({ queue: [current, upcoming], queueStatus: 'ready' });
    await showQueue();
    expect(host.textContent).toContain(current.name);
    expect(host.textContent).toContain(upcoming.name);
    expect(host.textContent).not.toContain(stale.name);
    expect([...host.querySelectorAll('button')].every(button => button.disabled)).toBe(true);
});
it('retains the saved app queue for local playback', async () => {
    await showQueue({ ...current, sourceRef: { kind: 'local', mediaId: 'local' } });
    expect(host.textContent).toContain(stale.name);
    expect(host.textContent).toContain('queue.title');
});
it('opens the existing account screen when queue access needs reconnection', async () => {
    useExternalPlaybackStore.setState({ queue: null, queueStatus: 'reconnect' });
    await showQueue();
    await act(async () => host.querySelector('button')!.click());
    expect(useLoginWindowStore.getState()).toMatchObject({ isOpen: true, providerId: 'spotify', intent: 'sign-in' });
});
it('publishes the verified current recording and upcoming order without replacing the app queue', async () => {
    await mount();
    expect(useExternalPlaybackStore.getState()).toMatchObject({ queue: [current, upcoming, upcoming], queueStatus: 'ready' });
    expect(usePlaybackStore.getState().playQueue).toEqual([stale]);
});
it('withholds a queue acknowledged for another recording or device', async () => {
    env.read.mockResolvedValue({ currentSong: stale, songs: [upcoming] });
    await mount();
    expect(useExternalPlaybackStore.getState()).toMatchObject({ queue: null, queueStatus: 'mismatch' });
});
it('explains when Spotify does not identify the current recording', async () => {
    env.read.mockResolvedValue({ currentSong: null, songs: [upcoming] });
    await mount();
    expect(useExternalPlaybackStore.getState()).toMatchObject({ queue: null, queueStatus: 'no-current' });
});
it('reports rate limiting and retries after Spotify’s requested delay', async () => {
    vi.useFakeTimers();
    env.read.mockRejectedValueOnce(new OnlineProviderError('network', 'Limited', 'spotify', undefined, 429, 10000));
    await mount();
    expect(useExternalPlaybackStore.getState()).toMatchObject({ queue: null, queueStatus: 'rate-limited' });
    await act(async () => vi.advanceTimersByTimeAsync(9999));
    expect(env.read).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(useExternalPlaybackStore.getState()).toMatchObject({ queue: [current, upcoming, upcoming], queueStatus: 'ready' });
});
it('retries an obsolete queue observation without calling it an account mismatch', async () => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    const pending = new Promise(resolve => { finish = resolve; });
    env.read.mockImplementationOnce(() => pending);
    await mount();
    env.revision++;
    await act(async () => finish({ currentSong: current, songs: [upcoming] }));
    expect(useExternalPlaybackStore.getState()).toMatchObject({ queue: null, queueStatus: 'loading' });
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(useExternalPlaybackStore.getState()).toMatchObject({ queue: [current, upcoming, upcoming], queueStatus: 'ready' });
});
it.each([
    [{ configured: false, connected: false }, 'setup'],
    [{ configured: true, connected: false }, 'connect'],
] as const)('reports connection setup state %s before requesting queue data', async (connection, queueStatus) => {
    env.connection.mockResolvedValue({ ...connection, encryptionAvailable: true, clientId: '' });
    await mount();
    expect(useExternalPlaybackStore.getState()).toMatchObject({ queue: null, queueStatus });
    expect(env.read).not.toHaveBeenCalled();
});
it.each([
    ['unsupported', 'unsupported'],
    ['not-public', 'denied'],
] as const)('distinguishes %s from an expired connection', async (code, queueStatus) => {
    env.read.mockRejectedValue(new OnlineProviderError(code, 'Unavailable', 'spotify'));
    await mount();
    expect(useExternalPlaybackStore.getState()).toMatchObject({ queue: null, queueStatus });
});
it('reports missing or expired permission without falling back to the saved playlist', async () => {
    env.read.mockRejectedValue(new OnlineProviderError('auth-required', 'Sign in again', 'spotify'));
    await mount();
    expect(useExternalPlaybackStore.getState()).toMatchObject({ queue: null, queueStatus: 'reconnect' });
});
it('ignores an old request after the external recording changes', async () => {
    let finish!: (value: unknown) => void;
    const pending = new Promise(resolve => { finish = resolve; });
    env.read.mockImplementationOnce(() => pending);
    await mount();
    env.read.mockResolvedValue({ currentSong: upcoming, songs: [stale] });
    await act(async () => usePlaybackStore.setState({ currentSong: upcoming }));
    await act(async () => finish({ currentSong: current, songs: [upcoming] }));
    expect(useExternalPlaybackStore.getState()).toMatchObject({ queue: [upcoming, stale], queueStatus: 'ready' });
});
it('discards an in-flight queue when local playback takes over', async () => {
    let finish!: (value: unknown) => void;
    const pending = new Promise(resolve => { finish = resolve; });
    env.read.mockImplementation(() => pending);
    await mount();
    await act(async () => usePlaybackStore.setState({ currentSong: { ...stale, sourceRef: { kind: 'local', mediaId: 'local' } } }));
    await act(async () => finish({ currentSong: current, songs: [upcoming] }));
    expect(useExternalPlaybackStore.getState()).toMatchObject({ queue: null, queueStatus: 'unavailable' });
});
