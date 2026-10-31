import { describe, expect, it } from 'vitest';
import type { Line } from '@/types';
import { timedWords, lyricRows } from '@/components/visualizer/immersive-lyrics/ImmersiveLyrics';

const lines: Line[] = [
    { fullText: 'First', startTime: 1, endTime: 2, words: [], timingGranularity: 'line' },
    { fullText: 'Second line', startTime: 3, endTime: 4, words: [{ text: 'Second ', startTime: 3, endTime: 3.5 }, { text: 'line', startTime: 3.5, endTime: 4 }], timingGranularity: 'word', translation: 'Translation' },
    { fullText: 'Third', startTime: 5, endTime: 6, words: [], timingGranularity: 'line' },
];

describe('Immersive Lyrics timing', () => {
    it('shows the active line with its previous and next lines', () => {
        expect(lyricRows(lines, 1, 3.5).map(row => [row.line.fullText, row.active])).toEqual([
            ['First', false], ['Second line', true], ['Third', false],
        ]);
    });

    it('updates immediately after seeking and does not mark a line active in a gap', () => {
        expect(lyricRows(lines, 2, 5.4).map(row => [row.line.fullText, row.active])).toEqual([['Second line', false], ['Third', true]]);
        expect(lyricRows(lines, -1, 2.5).map(row => [row.line.fullText, row.active])).toEqual([['First', false], ['Second line', false]]);
    });

    it('shows no rows for empty lyrics', () => expect(lyricRows([], -1, 0)).toEqual([]));

    it('uses genuine word timing while preserving the complete displayed text', () => {
        expect(timedWords(lines[1])).toEqual(lines[1].words);
        expect(timedWords({ ...lines[1], timingGranularity: 'line' })).toBeNull();
        expect(timedWords({ ...lines[1], words: [{ ...lines[1].words[0], text: 'missing' }] })).toBeNull();
        expect(timedWords({ ...lines[1], words: [{ ...lines[1].words[0], text: 'Second' }, lines[1].words[1]] })).toEqual([
            { ...lines[1].words[0], text: 'Second' }, ' ', lines[1].words[1],
        ]);
    });
});
