import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Clapperboard, Home, Library, ListMusic, Maximize2, Pause, Play, Settings, Shuffle, SkipBack, SkipForward, Sparkles, Volume2 } from 'lucide-react';
import { formatTime } from '../../utils/appPlaybackHelpers';
import { dockProgress, seekFromPointer } from './controls';
import { openMineradioConsole, useMineradioHost } from './MineradioHost';
import type { StageCommand, StageMetadata } from './stageBridge';
import type FloatingPlayerControls from '../../components/FloatingPlayerControls';
import PlayerControlSlotButton from '../../components/floating-player/PlayerControlSlotButton';
import LyricsTimelineModal from '../../components/modal/LyricsTimelineModal';
import { usePlayerBottomBarBottomPx } from '../../hooks/usePlayerBottomBarBottomPx';
import { usePlayerOverlayObstacle } from '../../hooks/usePlayerOverlayLayout';
import { resolveLyricSeekMediaTime } from '../../utils/lyrics/lyricSeekTime';
import { useReducedMotionFor } from '../../hooks/useReducedMotionFor';
import { audioPower, spectrum } from '../../stores/motionSignals';
import { useThemeSettingsStore } from '../../stores/useThemeSettingsStore';
import { useDockIdle } from './useDockIdle';
import './MineradioDock.donor.css';
import './MineradioShell.css';

// MineRadio's glass transport transplanted onto Folia's one audible playback clock.
export interface MineradioDockProps {
    metadata?: StageMetadata;
    currentTime: number | { get(): number; on(event: 'change', callback: (value: number) => void): () => void };
    duration: number;
    paused: boolean;
    volume: number;
    onCommand: (command: StageCommand) => void;
    onOpenExperience?: () => void;
    compactOnIdle?: boolean;
    controls?: React.ComponentProps<typeof FloatingPlayerControls>;
    t?: (key: string) => string;
}

export function MineradioDock({ metadata, currentTime, duration, paused, volume, onCommand, onOpenExperience, compactOnIdle = false, controls, t }: MineradioDockProps) {
    const accent = useRef<HTMLDivElement>(null);
    const external = useMineradioHost().audioAvailable === false;
    const reducedMotion = useReducedMotionFor('uiMicroMotion');
    const staticMode = useThemeSettingsStore(state => state.staticMode);
    const progress = useRef<HTMLDivElement>(null);
    const fill = useRef<HTMLDivElement>(null);
    const thumb = useRef<HTMLDivElement>(null);
    const timeLabel = useRef<HTMLDivElement>(null);
    const dragTime = useRef<number | null>(null);
    const dragBounds = useRef<DOMRect | null>(null);
    const [timelineOpen, setTimelineOpen] = useState(false);
    const bottom = usePlayerBottomBarBottomPx(18);
    const hidden = controls?.hideControlBar || (controls?.isHidden && !compactOnIdle);
    const { compact, ...idleInteraction } = useDockIdle(compactOnIdle && !hidden, timelineOpen);
    const secondary = { 'data-dock-extra': true, inert: compact, 'aria-hidden': compact || undefined };
    const { ref: layoutRef, invalidate } = usePlayerOverlayObstacle('player-controls', 'playback', !hidden);
    const disabled = controls?.controlsDisabled || !metadata?.title;
    const accentActive = !paused && !hidden && !disabled && !reducedMotion && !staticMode;
    useEffect(() => {
        const line = accent.current;
        if (!line) return;
        const update = () => {
            const visible = accentActive && !document.hidden;
            line.classList.toggle('is-ambient', visible && external);
            const energy = visible && !external && spectrum.get().length ? audioPower.get() / 255 : 0;
            line.style.opacity = String(Number.isFinite(energy) ? Math.max(0, Math.min(1, energy)) : 0);
        };
        update();
        if (!accentActive) return;
        const stopPower = external ? undefined : audioPower.on('change', update);
        const stopSpectrum = external ? undefined : spectrum.on('change', update);
        document.addEventListener('visibilitychange', update);
        return () => { stopPower?.(); stopSpectrum?.(); document.removeEventListener('visibilitychange', update); };
    }, [accentActive, external]);
    const text = (key: string, fallback: string) => { const translated = t?.(`options.mineradio${key}`); return translated && translated !== `options.mineradio${key}` ? translated : fallback; };
    const position = () => typeof currentTime === 'number' ? currentTime : currentTime.get();
    const command = (action: StageCommand['action'], value?: unknown) => onCommand({ action, ...(value === undefined ? {} : { value }) });
    const update = useCallback((value: number, force = false) => {
            const fraction = dockProgress(value, duration);
            if (fill.current) fill.current.style.transform = `scaleX(${fraction})`;
            if (thumb.current) thumb.current.style.left = `${fraction * 100}%`;
            const second = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
            if (force || progress.current?.getAttribute('aria-valuenow') !== String(second)) {
                const elapsed = `${formatTime(second)} / ${formatTime(Math.max(0, duration))}`;
                if (timeLabel.current) timeLabel.current.textContent = elapsed;
                progress.current?.setAttribute('aria-valuenow', String(second));
                progress.current?.setAttribute('aria-valuetext', elapsed);
            }
    }, [duration]);
    useEffect(() => {
        const follow = (value: number) => { if (dragTime.current === null) update(value); };
        const cancelPreview = () => {
            dragTime.current = null;
            dragBounds.current = null;
            follow(typeof currentTime === 'number' ? currentTime : currentTime.get());
        };
        if (dragTime.current === null) update(typeof currentTime === 'number' ? currentTime : currentTime.get(), true);
        const stop = typeof currentTime === 'number' ? undefined : currentTime.on('change', follow);
        window.addEventListener('blur', cancelPreview);
        return () => { stop?.(); window.removeEventListener('blur', cancelPreview); };
    }, [currentTime, update, hidden]);
    const previewSeek = (event: React.PointerEvent<HTMLDivElement>) => {
        const next = seekFromPointer(event.clientX, dragBounds.current ?? event.currentTarget.getBoundingClientRect(), duration);
        if (next !== null) { dragTime.current = next; update(next); }
    };
    const commitSeek = (value: number) => controls ? controls.onSeek(value) : command('seek', value);
    const slots = controls ? {
        ...controls.slotContext, loopMode: controls.loopMode, onToggleLoop: controls.onToggleLoop,
        onToggleTimeline: () => setTimelineOpen(true), hasLyrics: !!controls.lyrics,
        canPrev: !!controls.trackNavigation?.canPrev, canNext: !!controls.trackNavigation?.canNext,
        onPrev: controls.trackNavigation?.onPrev ?? (() => {}), onNext: controls.trackNavigation?.onNext ?? (() => {}),
    } : null;
    if (hidden) return null;
    return <><div className="mineradio-dock diy-mode" onClick={event => event.stopPropagation()}>
        <motion.div className="mineradio-dock-anchor" style={{ bottom }}>
        <motion.div id="bottom-bar" ref={layoutRef}
            style={{ borderRadius: 50, transitionDuration: reducedMotion ? '0s' : undefined }} onUpdate={invalidate} onTransitionEnd={invalidate}
            {...idleInteraction} data-dock-state={compact ? 'compact' : 'expanded'}
            className={`visible${compactOnIdle ? ' can-compact' : ''}${compact ? ' is-compact' : ''}`} role="region" aria-label={text('PlaybackControls', 'Playback controls')}>
            <div ref={accent} className="mineradio-dock-accent" aria-hidden="true" style={{ opacity: 0 }} />
            <motion.div
                style={{ transitionDuration: reducedMotion ? '0s' : undefined }}
                id="progress-bar" ref={progress} role="slider" tabIndex={duration > 0 && !disabled ? 0 : -1} aria-disabled={disabled || duration <= 0}
                aria-label={text('Seek', 'Playback position')} aria-valuemin={0} aria-valuemax={Math.max(0, duration)}
                onPointerDown={event => { if (disabled || duration <= 0 || event.button !== 0) return; event.preventDefault(); dragBounds.current = event.currentTarget.getBoundingClientRect(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); previewSeek(event); }}
                onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) previewSeek(event); }}
                onPointerUp={event => {
                    if (dragTime.current === null) return;
                    previewSeek(event);
                    const value = dragTime.current;
                    dragTime.current = null;
                    dragBounds.current = null;
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    commitSeek(value);
                }}
                onPointerCancel={event => { dragTime.current = null; dragBounds.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); update(position()); }}
                onLostPointerCapture={() => { dragBounds.current = null; if (dragTime.current !== null) { dragTime.current = null; update(position()); } }}
                onKeyDown={event => {
                    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || duration <= 0 || disabled) return;
                    event.preventDefault();
                    event.stopPropagation();
                    commitSeek(event.key === 'Home' ? 0 : event.key === 'End' ? duration : Math.max(0, Math.min(duration, position() + (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -5 : 5))));
                }}
            >
                <div id="progress-fill" ref={fill} /><div id="progress-thumb" ref={thumb} aria-hidden="true" />
            </motion.div>
            <div id="controls">
                <motion.div className="control-cluster actions">
                    <button className="control-cover" id="control-cover" type="button" onClick={() => command(metadata?.title ? 'openPlayer' : 'openFiles')} aria-label={metadata?.title ? text('OpenPlayer', 'Now playing') : text('ImportMusic', 'Import your music')}>
                        {metadata?.coverUrl ? <img src={metadata.coverUrl} alt="" /> : <Library size={20} />}
                    </button>
                    <motion.div className="control-meta">
                        <button id="control-title" className="control-title" type="button" onClick={() => command(metadata?.title ? 'openPlayer' : 'openFiles')}><span className="control-title-text">{metadata?.title || text('ImportMusic', 'Import your music')}</span></button>
                        <div id="control-artist" className="control-artist">{metadata?.artist || text('ReadyToListen', 'Ready when you are')}</div>
                    </motion.div>
                </motion.div>
                <motion.div className="control-cluster transport">
                    <span {...secondary} className="mineradio-dock-shortcuts">
                        <button className="ctrl-btn" type="button" onClick={() => command('openHome')} title={text('MusicHome', 'Music home')} aria-label={text('MusicHome', 'Music home')}><Home size={18} /></button>
                        <button id="shuffle-btn" className="ctrl-btn" type="button" disabled={disabled || !controls?.slotContext.canShuffle} onClick={() => controls?.slotContext.onShuffle()} title={text('Shuffle', 'Shuffle and play')} aria-label={text('Shuffle', 'Shuffle and play')}><Shuffle size={18} /></button>
                    </span>
                    <span className="mineradio-dock-primary">
                    <button id="prev-btn" className="ctrl-btn" type="button" disabled={disabled || (controls ? !controls.trackNavigation?.canPrev : false)} onClick={() => controls ? controls.trackNavigation?.onPrev() : command('previous')} title={controls?.trackNavigation?.prevTitle ?? text('Previous', 'Previous track')} aria-label={text('Previous', 'Previous track')}><SkipBack size={19} fill="currentColor" /></button>
                    <button id="play-btn" className="ctrl-btn" type="button" disabled={disabled || (controls ? !controls.canTogglePlay : false)} onClick={() => controls ? controls.onTogglePlay() : command('playPause')} title={paused ? text('Play', 'Play') : text('Pause', 'Pause')} aria-label={paused ? text('Play', 'Play') : text('Pause', 'Pause')}>
                        {paused ? <Play size={21} fill="currentColor" /> : <Pause size={21} fill="currentColor" />}
                    </button>
                    <button id="next-btn" className="ctrl-btn" type="button" disabled={disabled || (controls ? !controls.trackNavigation?.canNext : false)} onClick={() => controls ? controls.trackNavigation?.onNext() : command('next')} title={controls?.trackNavigation?.nextTitle ?? text('Next', 'Next track')} aria-label={text('Next', 'Next track')}><SkipForward size={19} fill="currentColor" /></button>
                    </span>
                    <button {...secondary} id="mini-queue-btn" className="ctrl-btn mineradio-dock-queue" type="button" onClick={() => command('openQueue')} title={text('Queue', 'Queue')} aria-label={text('Queue', 'Queue')}><ListMusic size={19} /></button>
                </motion.div>
                <motion.div className="control-cluster modes" inert={compact} aria-hidden={compact || undefined}>
                    {controls && slots && <span className="mineradio-dock-slots" data-ponder-slots>
                        <PlayerControlSlotButton actionId={controls.slotPrimary} context={slots} primaryColor="currentColor" controlsDisabled={disabled} className="ctrl-btn" />
                        <PlayerControlSlotButton actionId={controls.slotSecondary} context={slots} primaryColor="currentColor" controlsDisabled={disabled} className="ctrl-btn" />
                    </span>}
                    <label className="mineradio-dock-volume" title={text('Volume', 'Volume')}><Volume2 size={17} aria-hidden="true" /><input id="volume-slider" type="range" min={0} max={1} step={0.01} value={Math.max(0, Math.min(1, volume))} onChange={event => command('volume', Number(event.target.value))} aria-label={text('Volume', 'Volume')} /></label>
                    <button className="ctrl-btn mineradio-dock-library" type="button" onClick={() => command('openLibrary')} title={text('FoliaLibrary', 'Music library')} aria-label={text('FoliaLibrary', 'Music library')}><Library size={18} /></button>
                    {onOpenExperience && <button data-immersion-open className="ctrl-btn mineradio-dock-experience" type="button" onClick={onOpenExperience} title={t?.('immersion.title') || 'Listening experience'} aria-label={t?.('immersion.title') || 'Listening experience'}><Clapperboard size={18} /></button>}
                    <button data-mineradio-console className="ctrl-btn" type="button" onClick={event => { command('openPlayer'); openMineradioConsole(event); }} title={text('VisualConsole', 'Visual effects')} aria-label={text('VisualConsole', 'Visual effects')}><Sparkles size={18} /></button>
                    <button className="ctrl-btn mineradio-dock-settings" type="button" onClick={() => command('openSettings')} title={text('Settings', 'Settings')} aria-label={text('Settings', 'Settings')}><Settings size={18} /></button>
                    <button className="ctrl-btn mineradio-dock-fullscreen" type="button" onClick={() => command('fullscreen')} title={text('Fullscreen', 'Full screen')} aria-label={text('Fullscreen', 'Full screen')}><Maximize2 size={17} /></button>
                    <div id="time-display" ref={timeLabel} aria-hidden="true" />
                </motion.div>
            </div>
        </motion.div>
        </motion.div>
    </div>
    {controls && <LyricsTimelineModal isOpen={timelineOpen} onClose={() => setTimelineOpen(false)} lyrics={controls.lyrics}
        duration={duration} currentTime={controls.lyricCurrentTime ?? controls.currentTime} disabled={disabled}
        isDaylight={controls.isDaylight} theme={controls.theme} onSeek={time => {
            const target = resolveLyricSeekMediaTime(time, { mediaTimeSec: controls.currentTime.get(), lyricTimeSec: controls.lyricCurrentTime?.get() ?? controls.currentTime.get(), durationSec: duration });
            if (target !== null) controls.onSeek(target);
        }} />}</>;
}
