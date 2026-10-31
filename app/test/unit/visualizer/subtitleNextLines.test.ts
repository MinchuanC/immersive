import { describe, expect, it } from 'vitest';
import { getSubtitleNextLines } from '@/components/visualizer/runtime';
import type { Line } from '@/types';

// Keeps next-line subtitle rows anchored to the displayed line through gaps in the main lyric timeline.
const lines: Line[] = [0, 1, 2, 3].map(index => ({
    startTime: index * 5,
    endTime: index * 5 + 2,
    fullText: `Line ${index}`,
    words: [],
}));

describe('next subtitle lines', () => {
    it('takes the two lines after the active line', () => {
        expect(getSubtitleNextLines(lines, 1, null)).toEqual(lines.slice(2, 4));
    });

    it('keeps the same next lines while the completed line remains on screen in a gap', () => {
        expect(getSubtitleNextLines(lines, -1, lines[1])).toEqual(lines.slice(2, 4));
    });

    it('has no following lines before the first lyric or after the final lyric', () => {
        expect(getSubtitleNextLines(lines, -1, null)).toEqual([]);
        expect(getSubtitleNextLines(lines, -1, lines[3])).toEqual([]);
    });
});
