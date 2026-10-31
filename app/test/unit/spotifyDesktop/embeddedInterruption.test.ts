import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { interruptEmbeddedForDesktop } from '@/components/app/externalPlayback/spotify/spotifyDesktopInterruption';
import { useSpotifyPlaybackModeStore } from '@/services/onlineMusic/spotify/spotifyPlaybackMode';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { ExternalPlaybackSnapshot } from '@/types/onlineMusic';

const actions = vi.hoisted(() => ({ stop: vi.fn(), observe: vi.fn(), status: vi.fn(), revision: 0 }));
vi.mock('@/components/app/externalPlayback/spotify/spotifyPlaybackHandoff', () => ({ stopSpotifyEmbeddedPlayback: actions.stop }));
vi.mock('@/components/app/externalPlayback/externalPlaybackRuntime', () => ({ observeExternalPlayback: actions.observe, getExternalIntentRevision: () => actions.revision }));
vi.mock('@/stores/useStatusMessageStore', () => ({ setStatusMessage: actions.status }));
const id = 'a'.repeat(22);
const sample: ExternalPlaybackSnapshot = { availability: 'ready', state: 'playing', positionMs: 0, durationMs: 1000, volume: .5, shuffle: false, repeat: false, observedAt: 0, currentSong: { id, name: 'Song', artists: [], album: { id: '', name: '' }, durationMs: 1000, sourceRef: { kind: 'online', providerId: 'spotify', mediaId: id } } };
beforeEach(() => { actions.stop.mockResolvedValue(true); });
afterEach(() => { vi.resetAllMocks(); actions.revision = 0; useSpotifyPlaybackModeStore.setState({ active: 'desktop', desired: 'desktop' }); usePlaybackStore.setState({ currentSong: null }); });

it('ignores paused or stale desktop snapshots while embedded owns Spotify', async () => {
    useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
    expect(await interruptEmbeddedForDesktop({ ...sample, state: 'paused' }, () => true)).toBe(false);
    expect(await interruptEmbeddedForDesktop(sample, () => false)).toBe(false);
    expect(actions.stop).not.toHaveBeenCalled();
});

it('stops embedded audio before adopting a current playing desktop snapshot', async () => {
    const order: string[] = [];
    useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
    actions.stop.mockImplementation(async () => { order.push('stop'); return true; });
    actions.observe.mockImplementation(async () => { order.push('observe'); });
    expect(await interruptEmbeddedForDesktop(sample, () => true)).toBe(true);
    expect(order).toEqual(['stop', 'observe']);
    expect(actions.observe).toHaveBeenCalledWith(sample, 0);
});

it('does not adopt a desktop snapshot after a newer playback intent starts during the stop', async () => {
    useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
    let finish!: () => void;
    const stopping = new Promise<boolean>(resolve => { finish = () => resolve(true); });
    actions.stop.mockImplementation(() => { actions.revision++; return stopping; });
    const interruption = interruptEmbeddedForDesktop(sample, () => true);
    actions.revision++;
    finish();
    expect(await interruption).toBe(false);
    expect(actions.observe).not.toHaveBeenCalled();
});

it('stops embedded Spotify and reports monitoring failure without adopting an unknown desktop state', async () => {
    useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
    usePlaybackStore.setState({ currentSong: sample.currentSong });
    expect(await interruptEmbeddedForDesktop({ ...sample, availability: 'permission-denied', state: 'stopped' }, () => true)).toBe(true);
    expect(actions.stop).toHaveBeenCalledOnce();
    expect(actions.observe).not.toHaveBeenCalled();
    expect(actions.status).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
});

it('does not interrupt for an unavailable snapshot that became stale or for Spotify not running', async () => {
    useSpotifyPlaybackModeStore.setState({ active: 'embedded', desired: 'embedded' });
    usePlaybackStore.setState({ currentSong: sample.currentSong });
    expect(await interruptEmbeddedForDesktop({ ...sample, availability: 'error' }, () => false)).toBe(false);
    expect(await interruptEmbeddedForDesktop({ ...sample, availability: 'not-running', state: 'stopped' }, () => true)).toBe(false);
    expect(actions.stop).not.toHaveBeenCalled();
});
