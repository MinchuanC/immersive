import React from 'react';
import { motion, useTransform, type MotionValue } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { Line, Word } from '../../../types';
import { useReducedMotionFor } from '../../../hooks/useReducedMotionFor';
import { resolveThemeFontStack, resolveThemeFontWeight, resolveThemeTranslationFontStack } from '../../../utils/fontStacks';
import { resolveSubtitleOverlayLayout } from '../../../utils/lyrics/subtitleOverlayLayout';
import type { VisualizerSharedProps } from '../definition';
import VisualizerShell from '../VisualizerShell';
import { resolveVisualizerSubtitleOverlayContent } from '../VisualizerSubtitleOverlay';

const gapRows = (lines: Line[], next: number): { line: Line; index: number; active: boolean }[] => {
    const previous = next === -1 ? lines.length - 1 : next - 1;
    return [previous, next].filter(i => i >= 0 && i < lines.length)
        .map(i => ({ line: lines[i], index: i, active: false }));
};

export const lyricRows = (lines: Line[], index: number, time: number): { line: Line; index: number; active: boolean }[] => {
    if (!lines.length) return [];
    if (index >= 0 && index < lines.length) {
        return [index - 1, index, index + 1].filter(i => i >= 0 && i < lines.length)
            .map(i => ({ line: lines[i], index: i, active: i === index }));
    }
    return gapRows(lines, lines.findIndex(line => line.startTime > time));
};

export const timedWords = (line: Line): (string | Word)[] | null => {
    if (line.timingGranularity !== 'word' || !line.words.length) return null;
    const parts: (string | Word)[] = [];
    let cursor = 0;
    for (const [index, word] of line.words.entries()) {
        if (!word.text || !Number.isFinite(word.startTime) || !Number.isFinite(word.endTime)
            || word.endTime < word.startTime || (index > 0 && word.startTime < line.words[index - 1].startTime)) return null;
        const start = line.fullText.indexOf(word.text, cursor);
        if (start < 0) return null;
        if (start > cursor) parts.push(line.fullText.slice(cursor, start));
        parts.push(word);
        cursor = start + word.text.length;
    }
    if (cursor < line.fullText.length) parts.push(line.fullText.slice(cursor));
    return parts;
};

const TimedWord = ({ word, time }: { word: Word; time: MotionValue<number> }) => {
    const opacity = useTransform(time, value => value < word.startTime ? 0.55 : value < word.endTime ? 1 : 0.82);
    return <motion.span style={{ opacity }}>{word.text}</motion.span>;
};

const ImmersiveLyrics: React.FC<VisualizerSharedProps> = props => {
    const { currentTime, currentLineIndex, lines, theme, subtitleTheme, audioPower, audioBands,
        lyricsFontScale = 1, subtitleFontScale = 1, hideTranslationSubtitle = false, showText = true,
        paused = false, staticMode = false, isDaylight = false, plainLyrics } = props;
    const { t } = useTranslation();
    const reducedMotion = useReducedMotionFor('uiMicroMotion');
    const animate = !reducedMotion && !paused && !staticMode;
    const inGap = currentLineIndex < 0 || currentLineIndex >= lines.length;
    const subscribe = React.useCallback((notify: () => void) => inGap ? currentTime.on('change', notify) : () => {}, [currentTime, inGap]);
    const getGapNext = React.useCallback(() => inGap ? lines.findIndex(line => line.startTime > currentTime.get()) : -1, [currentTime, inGap, lines]);
    const gapNext = React.useSyncExternalStore(subscribe, getGapNext, getGapNext);
    const rows = inGap ? gapRows(lines, gapNext) : lyricRows(lines, currentLineIndex, currentTime.get());
    const subtitleLayout = resolveSubtitleOverlayLayout(props.subtitleOverlayLayout, props.subtitleContentMode, props.showSubtitleTranslation);
    const scale = Number.isFinite(lyricsFontScale) ? lyricsFontScale : 1;
    const translationScale = Number.isFinite(subtitleFontScale) ? subtitleFontScale : 1;

    return <VisualizerShell theme={theme} audioPower={audioPower} audioBands={audioBands} sharedProps={props}>
        {showText && <div className="pointer-events-none absolute inset-x-0 top-[8%] bottom-[18%] z-10 flex items-center justify-center px-6 sm:px-12">
            <div className="flex max-h-full w-full max-w-4xl flex-col rounded-3xl px-5 py-5 text-center" style={{
                background: isDaylight ? 'rgba(255, 255, 255, 0.52)' : 'rgba(0, 0, 0, 0.38)',
                color: theme.primaryColor,
                fontFamily: resolveThemeFontStack(theme),
            }}>
                {plainLyrics ? <p tabIndex={0} className="pointer-events-auto min-h-0 overflow-y-auto whitespace-pre-line break-words">{plainLyrics}</p> : rows.length ? rows.map(({ line, index, active }) => {
                    const words = active ? timedWords(line) : null;
                    const subtitles = active ? resolveVisualizerSubtitleOverlayContent({
                        showText, activeLine: line, recentCompletedLine: null, nextLines: [], hideTranslationSubtitle,
                        subtitleOverlayLayout: subtitleLayout,
                    }).rows.filter(row => row.source === 'translation' || row.source === 'romanization') : [];
                    return <motion.div key={index} layout={animate} initial={false}
                        animate={{ opacity: active ? 1 : 0.68, scale: active ? 1 : 0.92 }}
                        transition={{ duration: animate ? 0.28 : 0, ease: 'easeOut' }}
                        aria-current={active ? 'true' : undefined} tabIndex={active ? 0 : undefined}
                        title={active ? undefined : line.fullText}
                        className="my-3 break-words leading-snug" style={{
                            minHeight: 0,
                            flexShrink: active ? 1 : 0,
                            maxHeight: active ? undefined : '12vh',
                            overflowY: active ? 'auto' : 'hidden',
                            overflowX: 'hidden',
                            pointerEvents: active ? 'auto' : 'none',
                            fontSize: active ? `clamp(${1.25 * scale}rem, ${3.2 * scale}vw, ${2.6 * scale}rem)` : `clamp(${0.95 * scale}rem, ${2.2 * scale}vw, ${1.55 * scale}rem)`,
                            fontWeight: resolveThemeFontWeight(theme, active ? 700 : 500),
                            textShadow: isDaylight ? '0 1px 4px rgba(255,255,255,0.7)' : '0 1px 6px rgba(0,0,0,0.85)',
                            whiteSpace: active ? 'pre-wrap' : 'nowrap',
                            textOverflow: active ? undefined : 'ellipsis',
                            overflowWrap: 'anywhere',
                        }}>
                        {words
                            ? words.map((part, partIndex) => typeof part === 'string' ? part : <TimedWord key={partIndex} word={part} time={currentTime} />)
                            : line.fullText}
                        {subtitles.map(subtitle => <div key={subtitle.key} className="mt-2 leading-snug" style={{
                            color: (subtitleTheme ?? theme).primaryColor,
                            fontFamily: resolveThemeTranslationFontStack(subtitleTheme ?? theme),
                            fontSize: `clamp(${1 * translationScale}rem, ${1.6 * translationScale}vw, ${1.2 * translationScale}rem)`,
                            fontWeight: resolveThemeFontWeight(subtitleTheme ?? theme, 500),
                            opacity: 0.88,
                        }}>{subtitle.text}</div>)}
                    </motion.div>;
                }) : <p>{t('ui.noLyricsAvailable')}</p>}
            </div>
        </div>}
    </VisualizerShell>;
};

export default ImmersiveLyrics;
