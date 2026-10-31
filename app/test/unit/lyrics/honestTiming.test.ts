import { describe, expect, it } from 'vitest';
import { prepareHonestLyricTiming } from '@/utils/lyrics/honestTiming';
import type { LyricData } from '@/types';

// Timing provenance must survive the boundary between lyric parsers and visualizers.
const line = {
    fullText: 'Stay with me', startTime: 2, endTime: 5,
    words: [
        { text: 'Stay', startTime: 2, endTime: 3 },
        { text: 'with', startTime: 3, endTime: 4 },
        { text: 'me', startTime: 4, endTime: 5 },
    ],
};

describe('prepareHonestLyricTiming', () => {
    it('preserves genuine supplied word timestamps', () => {
        const input: LyricData = { lines: [line], isWordByWord: true };
        expect(prepareHonestLyricTiming(input).lines[0].words).toEqual(line.words);
    });

    it('activates a line together instead of using estimated word timestamps', () => {
        const input: LyricData = { lines: [line], isWordByWord: false };
        const result = prepareHonestLyricTiming(input);
        expect(result.lines[0].words.map(word => [word.startTime, word.endTime]))
            .toEqual([[2, 2], [2, 2], [2, 2]]);
        expect(result.lines[0].fullText).toBe(line.fullText);
        expect(result.lines[0].endTime).toBe(5);
        expect(input.lines[0].words[1].startTime).toBe(3);
    });

    it('treats old documents without a timing declaration as line timed', () => {
        expect(prepareHonestLyricTiming({ lines: [line] }).lines[0].words[1].startTime).toBe(2);
    });

    it('falls back per line if a claimed word timestamp is invalid', () => {
        const broken = { ...line, words: [{ text: 'Stay with me', startTime: Number.NaN, endTime: 5 }] };
        const result = prepareHonestLyricTiming({ lines: [broken, line], isWordByWord: true });
        expect(result.lines[0].words[0]).toMatchObject({ startTime: 2, endTime: 2 });
        expect(result.lines[1].words).toEqual(line.words);
    });

    it('does not invent time for an invalid line', () => {
        const result = prepareHonestLyricTiming({ lines: [{ ...line, startTime: -1 }], isWordByWord: true });
        expect(result.lines).toEqual([]);
    });

    it('preserves real overlapping word timings', () => {
        const overlap = { ...line, words: [line.words[0], { ...line.words[1], startTime: 2.5 }] };
        expect(prepareHonestLyricTiming({ lines: [overlap], isWordByWord: true }).lines[0].words).toEqual(overlap.words);
    });

    it('keeps mixed documents line timed where the source explicitly says so', () => {
        const result = prepareHonestLyricTiming({ lines: [{ ...line, timingGranularity: 'line' }, line], isWordByWord: true });
        expect(result.lines[0].words.every(word => word.startTime === 2 && word.endTime === 2)).toBe(true);
        expect(result.lines[1].timingGranularity).toBe('word');
    });
});
