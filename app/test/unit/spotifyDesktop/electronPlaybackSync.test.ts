// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useElectronPlaybackBridge } from '@/components/app/playback/bridges/useElectronPlaybackBridge';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { currentTime } from '@/stores/motionSignals';
import { PlayerState, type UnifiedSong } from '@/types';
import type { RemoteControlCommand } from '@/types/remoteControl';

// The remote and stage must use Spotify's clock and transport rather than a paused local deck.
const env = vi.hoisted(() => ({
    time: 42, external: true, command: vi.fn(),
    remote: null as null | ((command: RemoteControlCommand) => void),
    stage: null as null | ((request: { requestId: string; action: string; positionMs?: number }) => void),
}));
vi.mock('@/components/app/externalPlayback/externalPlaybackRuntime', () => ({
    usesExternalQueue: () => env.external,
    readExternalPlaybackTime: () => env.time,
    commandCurrentExternal: (...args: unknown[]) => env.command(...args),
}));
vi.mock('@/services/onlineMusic/omni', () => ({ omni: {
    hasExternalPlayback: () => env.external, canLikeSong: () => false, getProviderLabel: () => 'Spotify', previewClipStartMsOfAudioSource: () => 0,
} }));
vi.mock('@/hooks/useRemoteControlActions', () => ({ useRemoteControlActions: () => ({ read: () => undefined, activate: async () => false }) }));
vi.mock('@/mods/folium/registries/remoteActions', () => ({ subscribeRemoteActions: () => () => {} }));
const song: UnifiedSong = { id: 'a'.repeat(22), name: 'Spotify track', artists: [], album: { id: '', name: '' }, durationMs: 180000, sourceRef: { kind: 'online', providerId: 'spotify', mediaId: 'a'.repeat(22) } };
const exportState = { status: 'idle', presetId: null, progress: 0, elapsed: 0, duration: 0, countdown: null, filePath: null, error: null } as const;
let root: Root;
let host: HTMLDivElement;
let audio: HTMLAudioElement;
let bridge: ReturnType<typeof fakeBridge>;
function fakeBridge() {
    return {
        getPlaybackSyncBridgeStatus: async () => ({ remoteControlOpen: true, discordPresenceEnabled: true }),
        publishRemoteControlSnapshot: vi.fn(async () => {}), publishDiscordPresenceSnapshot: vi.fn(async () => {}),
        publishStagePlayerSnapshot: vi.fn(async () => {}), reportDevicePixelRatio: vi.fn(),
        onRemoteControlCommand: (callback: NonNullable<typeof env.remote>) => { env.remote = callback; return () => { env.remote = null; }; },
        onStagePlayerControlRequest: (callback: NonNullable<typeof env.stage>) => { env.stage = callback; return () => { env.stage = null; }; },
        completeStagePlayerControlRequest: vi.fn(async () => {}),
    };
}
beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    env.time = 42; env.external = true;
    env.command.mockReset().mockImplementation(async (_action, value) => { env.time = Number(value) / 1000; return { positionMs: value }; });
    bridge = fakeBridge();
    Object.defineProperty(window, 'electron', { configurable: true, value: bridge });
    usePlaybackStore.setState({ currentSong: song, playQueue: [], audioSrc: null, duration: 180, playerState: PlayerState.PLAYING, activePlaybackContext: 'main', transitionDisplay: null });
    currentTime.set(42);
    audio = document.createElement('audio'); audio.currentTime = 7;
    Object.defineProperty(audio, 'duration', { configurable: true, value: 600 });
    host = document.body.appendChild(document.createElement('div'));
    root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); Reflect.deleteProperty(window, 'electron'); });
async function mount() {
    function Harness() {
        useElectronPlaybackBridge({
            isElectronWindow: true, playerChromeVisibilityMode: 'always-visible', isStagePlayerSnapshotEnabled: true,
            isNowPlayingControlDisabledRef: { current: false }, audioRef: { current: audio }, effectiveLoopMode: 'off', isNowPlayingStageActive: false,
            mediaSessionPlayRef: { current: async () => {} }, mediaSessionPauseRef: { current: () => {} },
            mediaSessionPrevRef: { current: () => {} }, mediaSessionNextRef: { current: () => {} },
            taskbarHasTrackRef: { current: true }, taskbarPlayerStateRef: { current: PlayerState.PLAYING },
            exportState, publishTrackTransition: false, isTrackTransitionAudible: () => false, isLiked: false,
        });
        return null;
    }
    await act(async () => root.render(React.createElement(Harness)));
}
describe('external playback Electron publishers', () => {
    it('publishes the native clock, duration and queue availability to every surface', async () => {
        await mount();
        expect(bridge.publishRemoteControlSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ currentTime: 42, duration: 180, canGoPrevious: true, canGoNext: true }));
        expect(bridge.publishDiscordPresenceSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ currentTime: 42, duration: 180 }));
        expect(bridge.publishStagePlayerSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ positionMs: 42000, durationMs: 180000, controlCapabilities: expect.objectContaining({ previous: true, next: true }) }));
    });

    it('routes a remote seek to the native transport without changing the local deck', async () => {
        await mount();
        await act(async () => env.remote!({ type: 'seek', time: 73 }));
        expect(env.command).toHaveBeenCalledWith('seek', 73000);
        expect(audio.currentTime).toBe(7);
    });

    it('acknowledges a stage seek after the native transport completes', async () => {
        await mount();
        let finish!: (snapshot: { positionMs: number }) => void;
        env.command.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        await act(async () => env.stage!({ requestId: 'seek', action: 'seek', positionMs: 89000 }));
        expect(env.command).toHaveBeenCalledWith('seek', 89000);
        expect(audio.currentTime).toBe(7);
        expect(bridge.completeStagePlayerControlRequest).not.toHaveBeenCalled();
        await act(async () => finish({ positionMs: 89000 }));
        expect(bridge.completeStagePlayerControlRequest).toHaveBeenCalledWith({ requestId: 'seek', ok: true, error: null });
    });

    it('reports a failed native stage seek without acknowledging success', async () => {
        await mount();
        env.command.mockRejectedValueOnce(new Error('Automation permission denied'));
        await act(async () => env.stage!({ requestId: 'denied', action: 'seek', positionMs: 89000 }));
        expect(bridge.completeStagePlayerControlRequest).toHaveBeenCalledOnce();
        expect(bridge.completeStagePlayerControlRequest).toHaveBeenCalledWith({ requestId: 'denied', ok: false, error: 'Automation permission denied' });
        expect(audio.currentTime).toBe(7);
    });

    it('keeps a local track on its own audio clock and duration', async () => {
        env.external = false;
        audio.src = 'https://example.com/local.mp3';
        usePlaybackStore.setState({ audioSrc: audio.src });
        await mount();
        expect(bridge.publishRemoteControlSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ currentTime: 7 }));
        expect(bridge.publishStagePlayerSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ positionMs: 7000, durationMs: 600000 }));
    });
});
