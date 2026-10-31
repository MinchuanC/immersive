// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedSong } from '@/types';
import { PlayerState } from '@/types';
import type { ExternalPlaybackSnapshot } from '@/types/onlineMusic';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useAudioSettingsStore } from '@/stores/useAudioSettingsStore';
import { useExternalPlaybackIntegration } from '@/components/app/externalPlayback/useExternalPlaybackIntegration';
import { playsDroppedSoFar } from '@/components/app/playback/currentSong';

// Native observations must update the same volume and mute controls as local playback.
const env = vi.hoisted(() => ({ publish: null as null | ((snapshot: ExternalPlaybackSnapshot, outsideChange: boolean) => void | Promise<void>),
    poll: null as null | ((snapshot: ExternalPlaybackSnapshot, revision: number) => void | Promise<void>), observe: vi.fn(), abort: vi.fn() }));
vi.mock('@/components/app/externalPlayback/externalPlaybackRuntime', () => ({
    attachExternalPlaybackRuntime: (ports: { onSnapshot: NonNullable<typeof env.publish> }) => {
        env.publish = ports.onSnapshot;
        return () => { env.publish = null; };
    },
    getExternalWatchSong: () => null,
    observeExternalPlayback: (...args: unknown[]) => env.observe(...args),
    usesExternalQueue: () => false,
}));
vi.mock('@/components/app/externalPlayback/useExternalPlaybackSync', () => ({ useExternalPlaybackSync: (options: { onSnapshot: NonNullable<typeof env.poll> }) => { env.poll = options.onSnapshot; } }));
vi.mock('@/services/onlineMusic/omni', () => ({ omni: { hasExternalPlayback: () => true } }));
const song: UnifiedSong = { id: 'a'.repeat(22), name: 'Spotify track', artists: [], album: { id: '', name: '' }, durationMs: 120000, sourceRef: { kind: 'online', providerId: 'spotify', mediaId: 'a'.repeat(22) } };
const sample = (volume: number): ExternalPlaybackSnapshot => ({ availability: 'ready', currentSong: song, state: 'playing', positionMs: 1000, durationMs: 120000, volume, shuffle: false, repeat: false, observedAt: Date.now() });
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    env.observe.mockClear(); env.abort.mockClear();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    usePlaybackStore.setState({ currentSong: song });
    useAudioSettingsStore.setState({ volume: .8, isMuted: false });
    host = document.body.appendChild(document.createElement('div'));
    root = createRoot(host);
    function Harness() {
        useExternalPlaybackIntegration({ audioRef: { current: null }, abortTransition: env.abort, setLyrics: () => {}, setIsLyricsLoading: () => {}, persistSession: async () => {} });
        return null;
    }
    act(() => root.render(React.createElement(Harness)));
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('external playback volume observations', () => {
    it('does not cancel an in-flight play when a paused Spotify snapshot is adopted', async () => {
        const dropped = playsDroppedSoFar();
        await act(async () => { await env.publish!({ ...sample(.5), state: 'paused' }, true); });
        expect(playsDroppedSoFar()).toBe(dropped);
        expect(env.abort).not.toHaveBeenCalled();
    });
    it('passes a paused Spotify snapshot through discovery when no song is selected', async () => {
        await act(async () => usePlaybackStore.setState({ currentSong: null, playerState: PlayerState.PAUSED, isLoadingToPlay: false, activePlaybackContext: 'main' }));
        const paused = { ...sample(.5), state: 'paused' as const };
        await act(async () => { await env.poll!(paused, 1); });
        expect(env.observe).toHaveBeenCalledWith(paused, 1);
    });
    it('shows a volume change made in Spotify in the shared controls', async () => {
        await act(async () => { await env.publish!(sample(.37), false); });
        expect(useAudioSettingsStore.getState().volume).toBe(.37);
    });

    it('preserves the remembered volume while muted and follows Spotify when it becomes audible', async () => {
        useAudioSettingsStore.setState({ isMuted: true });
        await act(async () => { await env.publish!(sample(0), false); });
        expect(useAudioSettingsStore.getState()).toMatchObject({ volume: .8, isMuted: true });
        await act(async () => { await env.publish!(sample(.45), false); });
        expect(useAudioSettingsStore.getState()).toMatchObject({ volume: .45, isMuted: false });
    });
});
