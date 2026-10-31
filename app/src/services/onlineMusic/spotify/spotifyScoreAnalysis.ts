import type { SongResult } from '../../../types';
import { getPlaybackSongKey, getPlaybackSourceRef } from '../../../utils/appPlaybackGuards';
import { usePlaybackStore } from '../../../stores/usePlaybackStore';
import { useSpotifyPlaybackModeStore } from './spotifyPlaybackMode';
import { decodeAtRate, toMidSide } from '../../analysis/decodeAudio';
import { PROFILE_SAMPLE_RATE, type TrackProfile } from '../../automix/trackProfile';

const MAX_BYTES = 24 * 1024 * 1024;
const MAX_SECONDS = 600;

export interface SpotifyScoreInput {
    audioSrc: string | null;
    signal?: AbortSignal;
}

const matchesPlayback = (song: SongResult, input: SpotifyScoreInput): boolean => {
    const source = getPlaybackSourceRef(song);
    if (source.kind !== 'online' || source.providerId !== 'spotify' || !input.audioSrc || input.signal?.aborted) return false;
    const current = usePlaybackStore.getState();
    if (useSpotifyPlaybackModeStore.getState().active !== 'embedded' || current.audioSrc !== input.audioSrc
        || !current.currentSong || getPlaybackSongKey(current.currentSong) !== getPlaybackSongKey(song)) return false;
    try {
        const url = new URL(input.audioSrc);
        return url.protocol === 'folia-spotify:' && url.hostname === 'audio' && url.pathname === `/${source.mediaId}` && !!url.searchParams.get('k');
    } catch { return false; }
};

const readAudio = async (src: string, signal?: AbortSignal): Promise<ArrayBuffer | null> => {
    const response = await fetch(src, { cache: 'no-store', signal });
    const length = Number(response.headers.get('content-length'));
    if (response.status !== 200 || !response.body || !Number.isFinite(length) || length <= 0 || length > MAX_BYTES
        || !/^audio\//i.test(response.headers.get('content-type') ?? '')) {
        await response.body?.cancel();
        return null;
    }
    const reader = response.body.getReader();
    const cancel = () => { void reader.cancel().catch(() => {}); };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > length || size > MAX_BYTES || signal?.aborted) return null;
            chunks.push(value);
        }
        if (size !== length || signal?.aborted) return null;
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        return bytes.buffer;
    } finally {
        signal?.removeEventListener('abort', cancel);
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
};

// One energy value per second, sampled across the recording without retaining the PCM.
const energyBySecond = (samples: Float32Array, rate: number): number[] => {
    const values: number[] = [];
    const stride = Math.max(1, Math.floor(rate / 2000));
    for (let start = 0; start < samples.length; start += rate) {
        let sum = 0; let count = 0;
        const end = Math.min(samples.length, start + rate);
        for (let index = start; index < end; index += stride) { sum += samples[index] ** 2; count++; }
        values.push(count ? Math.sqrt(sum / count) : 0);
    }
    return values;
};

const analyse = (mid: Float32Array, side: Float32Array | null, rate: number, signal?: AbortSignal): Promise<TrackProfile | null> => {
    if (typeof Worker === 'undefined' || signal?.aborted) return Promise.resolve(null);
    return new Promise(resolve => {
        let worker: Worker;
        try { worker = new Worker(new URL('../../../workers/automixAnalysis.worker.ts', import.meta.url), { type: 'module' }); }
        catch { resolve(null); return; }
        let finished = false;
        const finish = (value: TrackProfile | null) => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            signal?.removeEventListener('abort', abort);
            worker.terminate();
            resolve(value);
        };
        const abort = () => finish(null);
        const timeout = setTimeout(abort, 60_000);
        signal?.addEventListener('abort', abort, { once: true });
        worker.onmessage = event => finish(event.data?.error ? null : event.data?.result ?? null);
        worker.onerror = abort;
        try {
            worker.postMessage({ id: 1, kind: 'profile', mono: mid, sampleRate: rate, options: { partial: false, side, gridless: true } },
                side ? [mid.buffer, side.buffer] : [mid.buffer]);
        } catch { finish(null); }
        if (signal?.aborted) abort();
    });
};

let queue: Promise<unknown> = Promise.resolve();

/** Reads and analyses only the currently playing embedded recording, without storing its audio or profile. */
export function analyseSpotifyScore(song: SongResult, input: SpotifyScoreInput): Promise<{ profile: TrackProfile; energy: number[] } | null> {
    const task = queue.then(async () => {
        const statedDuration = song.durationMs / 1000;
        if (!matchesPlayback(song, input) || !Number.isFinite(statedDuration) || statedDuration <= 1 || statedDuration > MAX_SECONDS) return null;
        try {
            const bytes = await readAudio(input.audioSrc!, input.signal);
            if (!bytes || !matchesPlayback(song, input)) return null;
            const buffer = await decodeAtRate(bytes, PROFILE_SAMPLE_RATE);
            if (!buffer || !matchesPlayback(song, input) || !Number.isFinite(buffer.duration)
                || Math.abs(buffer.duration - statedDuration) > Math.max(2, statedDuration * 0.02)
                || buffer.duration > MAX_SECONDS || buffer.sampleRate !== PROFILE_SAMPLE_RATE
                || !Number.isInteger(buffer.length) || buffer.length > MAX_SECONDS * PROFILE_SAMPLE_RATE
                || buffer.numberOfChannels < 1 || buffer.numberOfChannels > 2) return null;
            const channels = toMidSide(buffer);
            if (!channels || !matchesPlayback(song, input)) return null;
            const energy = energyBySecond(channels.mid, buffer.sampleRate);
            const profile = await analyse(channels.mid, channels.side, buffer.sampleRate, input.signal);
            return profile && Math.abs(profile.duration - buffer.duration) < 0.1 && matchesPlayback(song, input) ? { profile, energy } : null;
        } catch { return null; }
    });
    queue = task.then(() => undefined, () => undefined);
    return task;
}
