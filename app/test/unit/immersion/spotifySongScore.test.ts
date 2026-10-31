import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongResult } from '@/types';
import { makeProfile } from '../automix/trackProfileFixture';

const id = 'a'.repeat(22);
const song: SongResult = { id, name: 'Test', artists: [], album: { id: 'album', name: 'Album' }, durationMs: 120_000,
    sourceRef: { kind: 'online', providerId: 'spotify', mediaId: id } };
const src = `folia-spotify://audio/${id}?k=secret`;
const state = vi.hoisted(() => ({ song: null as SongResult | null, src: null as string | null, mode: 'embedded', desired: 'embedded' }));
const decoded = vi.hoisted(() => ({ decode: vi.fn(), channels: vi.fn() }));
vi.mock('@/stores/usePlaybackStore', () => ({ usePlaybackStore: { getState: () => ({ currentSong: state.song, audioSrc: state.src }) } }));
vi.mock('@/services/onlineMusic/spotify/spotifyPlaybackMode', () => ({ useSpotifyPlaybackModeStore: { getState: () => ({ active: state.mode, desired: state.desired }) } }));
vi.mock('@/services/analysis/decodeAudio', () => ({ decodeAtRate: decoded.decode, toMidSide: decoded.channels }));
vi.mock('@/services/automix/profileService', () => ({ ensureTrackProfile: vi.fn(), getTrackProfile: vi.fn(), profilesSettled: vi.fn() }));

const profile = makeProfile({ duration: 120, leadIn: 4, sections: [20, 60], bodyOut: 12, leadOut: 2 });
let workers: FakeWorker[] = [];
class FakeWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    terminated = false;
    constructor() { workers.push(this); }
    postMessage() { queueMicrotask(() => this.onmessage?.({ data: { id: 1, result: profile } } as MessageEvent)); }
    terminate() { this.terminated = true; }
}
const { loadSongScore, evaluateSongScore } = await import('@/services/immersion/songScore');

describe('Spotify Song Score', () => {
    beforeEach(() => {
        state.song = song; state.src = src; state.mode = 'embedded'; state.desired = 'embedded'; workers = [];
        vi.stubGlobal('Worker', FakeWorker);
        decoded.decode.mockResolvedValue({ duration: 120, sampleRate: 22050, length: 120 * 22050, numberOfChannels: 2 });
        const mid = new Float32Array(120 * 22050);
        mid.fill(0.05, 0, 60 * 22050); mid.fill(0.8, 60 * 22050);
        decoded.channels.mockReturnValue({ mid, side: null });
        vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(32000), { headers: { 'content-length': '32000', 'content-type': 'audio/ogg' } })));
    });
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

    it('does not analyze while switching away from embedded playback', async () => {
        state.desired = 'desktop';
        expect(await loadSongScore(song, undefined, { audioSrc: src })).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('analyses the active matching embedded recording in memory with honest provenance', async () => {
        const signal = new AbortController().signal;
        const score = await loadSongScore(song, undefined, { audioSrc: src, signal });
        expect(score?.trackKey).toBe(`online:spotify:${id}`);
        expect(score?.evidence).toEqual({ kind: 'online-stream-analysis', providerId: 'spotify', profileVersion: profile.version });
        expect(score?.cues.map(cue => cue.atSec)).toEqual(expect.arrayContaining([0, 4, 20, 60, 108, 118, 120]));
        expect(score?.cues.find(cue => cue.atSec === 20)?.source).toBe('section');
        expect(score?.cues.find(cue => cue.atSec === 10)?.source).toBe('energy');
        expect(fetch).toHaveBeenCalledWith(src, expect.objectContaining({ cache: 'no-store', signal }));
        expect(workers[0].terminated).toBe(true);
    });

    it('uses measured quiet and loud passages to direct intensity deterministically', async () => {
        const score = await loadSongScore(song, undefined, { audioSrc: src });
        expect(score).not.toBeNull();
        expect(evaluateSongScore(score!, 35).intensity).toBeLessThan(evaluateSongScore(score!, 85).intensity);
        expect(evaluateSongScore(score!, 85)).toEqual(evaluateSongScore(score!, 85));
        const first = score!.cues.find(cue => cue.atSec === 4)!;
        const second = score!.cues.find(cue => cue.atSec === 20)!;
        expect(first.motif).toBe(second.motif);
        expect(first.recipe.intensity).toBeCloseTo(second.recipe.intensity);
        expect(score!.cues.find(cue => cue.atSec === 118)!.recipe.intensity)
            .toBeCloseTo(score!.cues.find(cue => cue.atSec === 108)!.recipe.intensity);
    });

    it.each(['online:spotify:0000000000000000000084', 'seed-a', 'seed-b', 'seed-c', 'seed-d'])('keeps louder sections more intense for %s', async seed => {
        const mid = new Float32Array(120 * 22050);
        mid.fill(0.05, 0, 20 * 22050);
        mid.fill(0.545, 20 * 22050, 60 * 22050);
        mid.fill(0.8, 60 * 22050);
        decoded.channels.mockReturnValue({ mid, side: null });
        const score = await loadSongScore(song, seed, { audioSrc: src });
        expect(score).not.toBeNull();
        const at = (time: number) => score!.cues.find(cue => cue.atSec === time)!.recipe.intensity;
        expect(at(4)).toBeLessThan(at(20));
        expect(at(20)).toBeLessThan(at(60));
        const speeds = score!.cues.map(cue => cue.recipe.sonicGroundMotionSpeed);
        expect(new Set(speeds).size).toBe(1);
    });

    it('uses measured energy cues when no structural boundaries are found', async () => {
        const flatSections = makeProfile({ duration: 120, leadIn: 0, sections: [], bodyOut: 0, leadOut: 0 });
        vi.spyOn(FakeWorker.prototype, 'postMessage').mockImplementation(function (this: FakeWorker) {
            queueMicrotask(() => this.onmessage?.({ data: { id: 1, result: flatSections } } as MessageEvent));
        });
        const score = await loadSongScore(song, undefined, { audioSrc: src });
        expect(score).not.toBeNull();
        expect(score!.cues.find(cue => cue.atSec === 20)?.source).toBe('energy');
        expect(evaluateSongScore(score!, 30).intensity).toBeLessThan(evaluateSongScore(score!, 80).intensity);
        expect(score!.cues.length).toBeLessThanOrEqual(64);
    });

    it('does not fetch for desktop playback, a different track, or a stale URL', async () => {
        state.mode = 'desktop';
        expect(await loadSongScore(song, undefined, { audioSrc: src })).toBeNull();
        state.mode = 'embedded'; state.src = 'folia-spotify://audio/other?k=x';
        expect(await loadSongScore(song, undefined, { audioSrc: src })).toBeNull();
        state.src = src;
        expect(await loadSongScore(song, undefined, { audioSrc: src.replace(id, 'b'.repeat(22)) })).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('rejects incomplete audio and does not claim a whole-track score', async () => {
        decoded.decode.mockResolvedValue({ duration: 112, sampleRate: 22050, length: 112 * 22050, numberOfChannels: 2 });
        expect(await loadSongScore(song, undefined, { audioSrc: src })).toBeNull();
        expect(workers).toHaveLength(0);
    });

    it('rejects audio whose decoded PCM exceeds the limit', async () => {
        decoded.decode.mockResolvedValue({ duration: 120, sampleRate: 22050, length: 601 * 22050, numberOfChannels: 2 });
        expect(await loadSongScore(song, undefined, { audioSrc: src })).toBeNull();
        expect(workers).toHaveLength(0);
    });

    it('rejects partial HTTP responses rather than treating them as whole tracks', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array(32000), { status: 206, headers: { 'content-length': '32000', 'content-type': 'audio/ogg' } }));
        expect(await loadSongScore(song, undefined, { audioSrc: src })).toBeNull();
        expect(decoded.decode).not.toHaveBeenCalled();
    });

    it('rejects oversized responses and ignores a stale result', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array(1), { headers: { 'content-length': String(40 * 1024 * 1024) } }));
        expect(await loadSongScore(song, undefined, { audioSrc: src })).toBeNull();
        decoded.decode.mockImplementationOnce(async () => { state.song = { ...song, id: 'b'.repeat(22), sourceRef: { kind: 'online', providerId: 'spotify', mediaId: 'b'.repeat(22) } }; return { duration: 120, sampleRate: 22050, length: 120 * 22050, numberOfChannels: 2 }; });
        expect(await loadSongScore(song, undefined, { audioSrc: src })).toBeNull();
        expect(workers).toHaveLength(0);
    });

    it('discards a worker result if ownership changes before it arrives', async () => {
        vi.spyOn(FakeWorker.prototype, 'postMessage').mockImplementation(function (this: FakeWorker) {
            state.mode = 'desktop';
            queueMicrotask(() => this.onmessage?.({ data: { id: 1, result: profile } } as MessageEvent));
        });
        expect(await loadSongScore(song, undefined, { audioSrc: src })).toBeNull();
        expect(workers[0].terminated).toBe(true);
    });

    it('cancels a pending network body when the score is stopped', async () => {
        const controller = new AbortController();
        const cancel = vi.fn();
        let started!: () => void;
        const reading = new Promise<void>(resolve => { started = resolve; });
        const body = new ReadableStream<Uint8Array>({ pull() { started(); }, cancel });
        vi.mocked(fetch).mockResolvedValueOnce(new Response(body, { headers: { 'content-length': '32000', 'content-type': 'audio/ogg' } }));
        const pending = loadSongScore(song, undefined, { audioSrc: src, signal: controller.signal });
        await reading;
        controller.abort();
        expect(await pending).toBeNull();
        expect(cancel).toHaveBeenCalled();
        expect(workers).toHaveLength(0);
    });

    it('terminates analysis if playback changes while the worker is running', async () => {
        const controller = new AbortController();
        vi.spyOn(FakeWorker.prototype, 'postMessage').mockImplementation(() => controller.abort());
        expect(await loadSongScore(song, undefined, { audioSrc: src, signal: controller.signal })).toBeNull();
        expect(workers[0].terminated).toBe(true);
    });
});
