import { isAlias, parseDocument, visit } from 'yaml';
import type { Line, LyricData, Word } from '../../types';
import { parseLRC } from '../../utils/lyrics/parserCore';
import { prepareHonestLyricTiming } from '../../utils/lyrics/honestTiming';

export type LrclibResult =
    | { kind: 'timed'; lyrics: LyricData }
    | { kind: 'plain'; text: string }
    | { kind: 'instrumental' }
    | { kind: 'unavailable' };

export interface LyricSignature {
    title: string;
    artist: string;
    album: string;
    durationSeconds: number;
}

export const lrclibLyrics = (result: LrclibResult): LyricData | null => (
    result.kind === 'timed' ? result.lyrics : result.kind === 'plain' ? { lines: [], plainText: result.text, isWordByWord: false } : null
);

const MAX_TEXT = 512 * 1024;
const object = (value: unknown): Record<string, unknown> | null => (
    value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
);
const text = (value: unknown): string => typeof value === 'string' && value.length <= MAX_TEXT ? value : '';
const time = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

// Lyricsfile 1.0 is a draft: nonzero offsets have no agreed meaning yet.
const parseLyricsfile = (source: string): LyricData | null => {
    if (!source || source.length > MAX_TEXT) return null;
    try {
        const document = parseDocument(source, { schema: 'core', uniqueKeys: true });
        if (document.errors.length || document.warnings.length) return null;
        let unsafe = false;
        visit(document, (_key, node, path) => {
            if (path.length > 32 || isAlias(node)) unsafe = true;
        });
        if (unsafe) return null;
        const data = object(document.toJS({ maxAliasCount: 0 }));
        const metadata = object(data?.metadata);
        if (data?.version !== '1.0' || !metadata || !text(metadata.title) || !text(metadata.artist)
            || (metadata.offset_ms !== undefined && metadata.offset_ms !== 0)
            || !Array.isArray(data.lines) || !data.lines.length || data.lines.length > 10_000) return null;
        const lines: Line[] = [];
        for (const row of data.lines) {
            const line = object(row);
            if (!line || !text(line.text) || !time(line.start_ms)
                || (line.end_ms !== undefined && (!time(line.end_ms) || line.end_ms < line.start_ms))) return null;
            const startTime = line.start_ms / 1000;
            const words: Word[] = [];
            if (line.words !== undefined && !Array.isArray(line.words)) return null;
            if (Array.isArray(line.words)) {
                if (line.words.length > 10_000) return null;
                for (const item of line.words) {
                    const word = object(item);
                    if (!word || !text(word.text) || !time(word.start_ms)
                        || (word.end_ms !== undefined && (!time(word.end_ms) || word.end_ms < word.start_ms))) return null;
                    if (words.length && word.start_ms / 1000 < words[words.length - 1].startTime) return null;
                    words.push({ text: word.text as string, startTime: word.start_ms / 1000, endTime: ((word.end_ms ?? word.start_ms) as number) / 1000 });
                }
                if (words.length && words.map(word => word.text).join('') !== line.text) return null;
            }
            // A missing line end controls display only; it never creates word timing.
            const endTime = line.end_ms === undefined ? Math.max(startTime + 5, ...words.map(word => word.endTime)) : line.end_ms / 1000;
            lines.push({
                fullText: line.text as string, startTime, endTime,
                timingGranularity: words.length ? 'word' : 'line',
                words: words.length ? words : [{ text: line.text as string, startTime, endTime: startTime }],
            });
        }
        return prepareHonestLyricTiming({
            title: metadata.title as string, artist: metadata.artist as string,
            isWordByWord: lines.some(line => line.timingGranularity === 'word'),
            lines: lines.sort((a, b) => a.startTime - b.startTime),
        });
    } catch {
        return null;
    }
};

export const parseLrclibRecord = (value: unknown): LrclibResult => {
    const record = object(value);
    if (!record) return { kind: 'unavailable' };
    if (record.instrumental === true) return { kind: 'instrumental' };
    const lyricsfile = parseLyricsfile(text(record.lyricsfile));
    if (lyricsfile) return { kind: 'timed', lyrics: lyricsfile };
    const synced = text(record.syncedLyrics);
    if (synced) {
        const lyrics = prepareHonestLyricTiming(parseLRC(synced, '', { includeInterludes: false }));
        if (lyrics.lines.length) return { kind: 'timed', lyrics };
    }
    const plain = text(record.plainLyrics);
    return plain.trim() ? { kind: 'plain', text: plain } : { kind: 'unavailable' };
};

const normalized = (value: unknown) => text(value).normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export const lookupLrclib = async (signature: LyricSignature, signal?: AbortSignal): Promise<LrclibResult> => {
    if (!signature.title.trim() || !signature.artist.trim() || !Number.isFinite(signature.durationSeconds) || signature.durationSeconds <= 0) return { kind: 'unavailable' };
    const url = new URL('https://lrclib.net/api/get');
    url.search = new URLSearchParams({
        track_name: signature.title, artist_name: signature.artist, album_name: signature.album,
        duration: String(signature.durationSeconds),
    }).toString();
    try {
        const response = await fetch(url.toString(), { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000) });
        if (!response.ok || Number(response.headers.get('content-length')) > MAX_TEXT * 2) return { kind: 'unavailable' };
        const body = await response.text();
        if (body.length > MAX_TEXT * 2) return { kind: 'unavailable' };
        const record = object(JSON.parse(body));
        if (!record || normalized(record.trackName) !== normalized(signature.title)
            || normalized(record.artistName) !== normalized(signature.artist)
            || (signature.album && normalized(record.albumName) !== normalized(signature.album))
            || typeof record.duration !== 'number' || Math.abs(record.duration - signature.durationSeconds) > 2) return { kind: 'unavailable' };
        return parseLrclibRecord(record);
    } catch {
        return { kind: 'unavailable' };
    }
};
