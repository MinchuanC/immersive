// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerState, type UnifiedSong } from '@/types';
import type { ExternalPlaybackSnapshot } from '@/types/onlineMusic';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useOnlineProviderAccountStore } from '@/stores/useOnlineProviderAccountStore';
import { currentTime } from '@/stores/motionSignals';
import { useExternalPlaybackIntegration } from '@/components/app/externalPlayback/useExternalPlaybackIntegration';
import * as runtime from '@/components/app/externalPlayback/externalPlaybackRuntime';

// Discover the existing desktop recording through the real polling, ownership and integration paths.
const env = vi.hoisted(() => ({ read: vi.fn(), command: vi.fn(), externalAvailable: true }));
vi.mock('@/services/onlineMusic/omni', () => ({ omni: {
    hasExternalPlayback: (song: UnifiedSong) => env.externalAvailable && song.sourceRef.kind === 'online',
    providerHasExternalPlayback: () => env.externalAvailable,
    getProviderExternalPlaybackSnapshot: (...args: unknown[]) => env.read(...args),
    getExternalPlaybackSnapshot: () => env.read('spotify'),
    getExternalPlaybackQueue: async () => ({ currentSong: nativeSong, songs: [] }),
    getExternalPlaybackConnectionStatus: async () => ({ configured: true, connected: true, encryptionAvailable: true, clientId: '' }),
    commandExternalPlayback: (...args: unknown[]) => env.command(...args),
} }));
vi.mock('@/services/onlinePlayback', () => ({ loadOnlineSongLyrics: async (_song: unknown, _prefetched: unknown, _user: unknown, callbacks: { isCurrent(): boolean; onDone(): void }) => {
    if (callbacks.isCurrent()) callbacks.onDone();
} }));
const nativeSong: UnifiedSong = { id: 'a'.repeat(22), name: 'Existing native recording', artists: [], album: { id: '', name: '' }, durationMs: 120000,
    sourceRef: { kind: 'online', providerId: 'spotify', mediaId: 'a'.repeat(22) } };
const localSong: UnifiedSong = { ...nativeSong, id: 'local', name: 'Local recording', sourceRef: { kind: 'local', mediaId: 'local' } };
const sample = (state: 'playing' | 'paused' = 'playing'): ExternalPlaybackSnapshot => ({ availability: 'ready', currentSong: nativeSong, state,
    positionMs: 42000, durationMs: 120000, volume: 1, shuffle: false, repeat: false, observedAt: Date.now() });
let root: Root;
let host: HTMLDivElement;
let mounted: boolean;

beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    env.command.mockResolvedValue(sample('paused'));
    env.externalAvailable = true;
    await runtime.prepareLocalPlayback();
    vi.spyOn(runtime, 'getExternalWatchSong').mockReturnValue(null);
    env.read.mockReset().mockImplementation(async () => sample());
    env.command.mockClear();
    usePlaybackStore.setState({ currentSong: null, audioSrc: null, playerState: PlayerState.IDLE, isLoadingToPlay: false,
        activePlaybackContext: 'main', playQueue: [], duration: 0, lyrics: null });
    useOnlineProviderAccountStore.setState({ activeProviderId: 'spotify', accounts: {} });
    useOnlineProviderAccountStore.getState().updateAccount('spotify', { status: 'authenticated', user: { id: 'listener', nickname: 'Listener' } });
    Object.defineProperty(window, 'electron', { configurable: true, value: {} });
    currentTime.set(0);
    host = document.body.appendChild(document.createElement('div')); root = createRoot(host); mounted = true;
    vi.useFakeTimers();
});
afterEach(() => {
    if (mounted) act(() => root.unmount());
    host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); Reflect.deleteProperty(window, 'electron');
});
const mount = async () => {
    function Harness() {
        useExternalPlaybackIntegration({ audioRef: { current: null }, abortTransition: () => {},
            setLyrics: lyrics => usePlaybackStore.getState().setLyricsState(lyrics), setIsLyricsLoading: () => {}, persistSession: async () => {} });
        return null;
    }
    await act(async () => root.render(React.createElement(Harness)));
    return async () => { await act(async () => root.render(React.createElement(Harness))); };
};

describe('native playback discovery on startup', () => {
    it('does not discover an external session until the provider enables external playback', async () => {
        env.externalAvailable = false;
        const rerender = await mount();
        expect(env.read).not.toHaveBeenCalled();
        env.externalAvailable = true;
        await rerender();
        expect(env.read).toHaveBeenCalled();
    });
    it('adopts an already playing recording and clock without a remembered external song', async () => {
        await mount();
        expect(usePlaybackStore.getState()).toMatchObject({ currentSong: { name: 'Existing native recording' }, playerState: PlayerState.PLAYING, duration: 120 });
        expect(currentTime.get()).toBe(42);
        expect(env.command).not.toHaveBeenCalled();
    });

    it('leaves a paused native recording alone', async () => {
        env.read.mockImplementation(async () => sample('paused'));
        await mount();
        expect(usePlaybackStore.getState().currentSong).toBeNull();
        expect(env.command).not.toHaveBeenCalled();
    });

    it('does not take playback from an actively playing local source', async () => {
        usePlaybackStore.setState({ currentSong: localSong, playerState: PlayerState.PLAYING });
        await mount();
        expect(usePlaybackStore.getState().currentSong).toBe(localSong);
        expect(env.command).not.toHaveBeenCalled();
    });

    it('does not replace a local song that is loading to play', async () => {
        usePlaybackStore.setState({ currentSong: localSong, playerState: PlayerState.IDLE, isLoadingToPlay: true });
        await mount();
        expect(usePlaybackStore.getState().currentSong).toBe(localSong);
        expect(env.command).not.toHaveBeenCalled();
    });

    it('does not take over a paused stage session', async () => {
        usePlaybackStore.setState({ currentSong: localSong, playerState: PlayerState.PAUSED, activePlaybackContext: 'stage' });
        await mount();
        expect(usePlaybackStore.getState().currentSong).toBe(localSong);
        expect(env.command).not.toHaveBeenCalled();
    });

    it('does not adopt a discovery that was started before local playback began', async () => {
        let finish!: (snapshot: ExternalPlaybackSnapshot) => void;
        env.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        await mount();
        await act(async () => usePlaybackStore.setState({ currentSong: localSong, playerState: PlayerState.PLAYING }));
        await act(async () => finish(sample()));
        expect(usePlaybackStore.getState().currentSong).toBe(localSong);
    });

    it('stops discovery when the account disconnects', async () => {
        env.read.mockImplementation(async () => sample('paused'));
        await mount();
        expect(env.read).toHaveBeenCalledOnce();
        await act(async () => useOnlineProviderAccountStore.getState().clearAccount('spotify'));
        await act(async () => vi.advanceTimersByTimeAsync(3000));
        expect(env.read).toHaveBeenCalledOnce();
    });

    it('drops a discovery that completes in the same turn as account disconnect', async () => {
        let finish!: (snapshot: ExternalPlaybackSnapshot) => void;
        env.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        await mount();
        await act(async () => {
            useOnlineProviderAccountStore.getState().clearAccount('spotify');
            finish(sample());
        });
        expect(usePlaybackStore.getState().currentSong).toBeNull();
    });

    it('drops an outstanding discovery after unmount', async () => {
        let finish!: (snapshot: ExternalPlaybackSnapshot) => void;
        env.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        await mount();
        expect(env.read).toHaveBeenCalledOnce();
        act(() => root.unmount()); mounted = false;
        await act(async () => finish(sample()));
        await act(async () => vi.advanceTimersByTimeAsync(3000));
        expect(usePlaybackStore.getState().currentSong).toBeNull();
        expect(env.read).toHaveBeenCalledOnce();
    });
});
