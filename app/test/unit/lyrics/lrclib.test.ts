import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupLrclib, parseLrclibRecord } from '@/services/lyrics/lrclib';

const record = {
    trackName: 'Example Song', artistName: 'Example Artist', albumName: 'Example Album', duration: 120,
    syncedLyrics: '[00:01.20]Hello world\n[00:04.00]Again', plainLyrics: 'Hello world\nAgain',
};
const lyricsfile = `version: '1.0'
metadata: {title: Example Song, artist: Example Artist}
lines:
  - text: Hello world
    start_ms: 1200
    end_ms: 2800
    words:
      - {text: 'Hello ', start_ms: 1200, end_ms: 1900}
      - {text: world, start_ms: 1900}
  - {text: Again, start_ms: 4000}
`;

afterEach(() => vi.unstubAllGlobals());

describe('LRCLIB timing boundary', () => {
    it('uses real absolute word times, without inventing missing word ends', () => {
        const result = parseLrclibRecord({ ...record, lyricsfile });
        expect(result.kind).toBe('timed');
        if (result.kind !== 'timed') return;
        expect(result.lyrics.lines[0].words).toEqual([
            { text: 'Hello ', startTime: 1.2, endTime: 1.9 },
            { text: 'world', startTime: 1.9, endTime: 1.9 },
        ]);
        expect(result.lyrics.lines[1].timingGranularity).toBe('line');
        expect(result.lyrics.lines[1].words[0].startTime).toBe(4);
    });

    it.each([
        lyricsfile.replace("version: '1.0'", "version: '2.0'"),
        lyricsfile.replace('start_ms: 1900', 'start_ms: -1'),
        lyricsfile.replace('metadata: {title: Example Song, artist: Example Artist}', 'metadata: &x {title: Example Song}\nextra: *x'),
        lyricsfile.replace('metadata:', 'metadata: !!js/object'),
        "version: '1.0'\nversion: '1.0'",
        'x'.repeat(600_000),
    ])('falls back safely from invalid or unsafe YAML', invalid => {
        const result = parseLrclibRecord({ ...record, lyricsfile: invalid, hasWordSync: true });
        expect(result.kind).toBe('timed');
        if (result.kind === 'timed') {
            expect(result.lyrics.isWordByWord).toBe(false);
            expect(result.lyrics.lines[0].words.every(word => word.startTime === 1.2 && word.endTime === 1.2)).toBe(true);
        }
    });

    it('falls back from unresolved nonzero offsets and mismatching word text', () => {
        for (const invalid of [lyricsfile.replace('metadata: {', 'metadata: {offset_ms: 100, '), lyricsfile.replace("text: 'Hello '", "text: 'Goodbye '")]) {
            const result = parseLrclibRecord({ ...record, lyricsfile: invalid });
            expect(result.kind === 'timed' && result.lyrics.isWordByWord).toBe(false);
        }
    });

    it('keeps plain and instrumental responses explicit', () => {
        expect(parseLrclibRecord({ plainLyrics: 'Only text' })).toEqual({ kind: 'plain', text: 'Only text' });
        expect(parseLrclibRecord({ instrumental: true })).toEqual({ kind: 'instrumental' });
        expect(parseLrclibRecord({})).toEqual({ kind: 'unavailable' });
    });

    it('sends the full recording signature and refuses a different recording', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...record, duration: 150 })));
        vi.stubGlobal('fetch', fetchMock);
        expect(await lookupLrclib({ title: record.trackName, artist: record.artistName, album: record.albumName, durationSeconds: 120 })).toEqual({ kind: 'unavailable' });
        const url = new URL(fetchMock.mock.calls[0][0]);
        expect(Object.fromEntries(url.searchParams)).toEqual({ track_name: record.trackName, artist_name: record.artistName, album_name: record.albumName, duration: '120' });
    });

    it('accepts a matched signature and handles network absence', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(record))).mockRejectedValueOnce(new Error('offline')));
        const signature = { title: record.trackName, artist: record.artistName, album: record.albumName, durationSeconds: 120 };
        expect((await lookupLrclib(signature)).kind).toBe('timed');
        expect(await lookupLrclib(signature)).toEqual({ kind: 'unavailable' });
    });
});
