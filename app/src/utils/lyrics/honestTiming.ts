import type { Line, LyricData, Word } from '../../types';
import { isInterludeLine } from './parserCore';

// Layout tokens may be estimated; their activation times must come from the lyric source.
const validTime = (value: number) => Number.isFinite(value) && value >= 0;

const lineTimedWords = (words: Word[], text: string, startTime: number): Word[] => (
    (words.length ? words : [{ text, startTime, endTime: startTime }]).map(word => ({
        text: word.text,
        startTime,
        endTime: startTime,
    }))
);

export const prepareHonestLyricTiming = (lyrics: LyricData): LyricData => ({
    ...lyrics,
    lines: lyrics.lines.filter(line => (
        validTime(line.startTime) && validTime(line.endTime) && line.endTime >= line.startTime
    )).map((line): Line => {
        if (isInterludeLine(line)) return line;
        const genuine = lyrics.isWordByWord === true && line.timingGranularity !== 'line' && line.words.length > 0 && line.words.every(word => (
            validTime(word.startTime) && validTime(word.endTime) && word.endTime >= word.startTime
        ));
        if (genuine) return { ...line, timingGranularity: 'word' };
        const convertVocal = (vocal: NonNullable<Line['backgroundVocal']>) => ({
            ...vocal,
            words: lineTimedWords(vocal.words, vocal.text, vocal.startTime),
        });
        return {
            ...line,
            timingGranularity: 'line',
            words: lineTimedWords(line.words, line.fullText, line.startTime),
            ...(line.backgroundVocal ? { backgroundVocal: convertVocal(line.backgroundVocal) } : {}),
            ...(line.backgroundVocals ? { backgroundVocals: line.backgroundVocals.map(convertVocal) } : {}),
        };
    }),
});
