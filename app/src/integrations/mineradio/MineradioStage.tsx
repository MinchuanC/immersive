import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createStageChannel, makeStageFrame, type StageCommand, type StageInput } from './stageBridge';
import { consumeMineradioConsoleRequest, restoreMineradioConsoleFocus, setMineradioConsoleOpen } from './MineradioHost';
import { mineradioConsoleEn, type StageConsoleCopy } from './consoleCopy';
import { getImmersionDirectionRevision } from '../../services/immersion/director';

// Mounts only the donor graphics realm; high-frequency state is sampled outside React.
export interface MineradioStageProps extends Omit<StageInput, 'currentTime' | 'lyricTime'> {
    currentTime: number | { get(): number };
    lyricTime?: number | { get(): number };
    sampleAudio?: () => StageInput['audio'];
    sampleDirection?: () => StageInput['direction'];
    onCommand?: (command: StageCommand) => void;
    onReady?: () => void;
    className?: string;
}

export function MineradioStage(props: MineradioStageProps) {
    const { t, i18n } = useTranslation();
    const locale = (i18n.resolvedLanguage ?? i18n.language ?? 'en').replace(/^in$/, 'id');
    const consoleCopy = useMemo(() => t('mineradioConsole', { returnObjects: true, defaultValue: mineradioConsoleEn }) as unknown as StageConsoleCopy, [t, locale]);
    const frameRef = useRef<HTMLIFrameElement>(null);
    const latest = useRef(props);
    latest.current = { ...props, locale, consoleCopy };
    const [session] = useState(() => crypto.randomUUID());
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const target = frameRef.current?.contentWindow;
        if (!ready || !target) return;
        const channel = createStageChannel(target, session, command => latest.current.onCommand?.(command), shortcut => {
            const key = shortcut.code === 'Space' ? ' ' : shortcut.code.replace(/^Key/, '');
            window.dispatchEvent(new KeyboardEvent('keydown', { ...shortcut, key, bubbles: true, cancelable: true }));
        }, () => { setMineradioConsoleOpen(session, false); restoreMineradioConsoleFocus(); }, () => setMineradioConsoleOpen(session, true));
        const receive = (event: MessageEvent) => {
            if (event.source === target && event.data?.scope === 'immersive-mineradio' && event.data?.session === session && event.data?.type === 'drawn') latest.current.onReady?.();
            channel.receive(event.data, event.source);
        };
        const openConsole = () => { if (consumeMineradioConsoleRequest()) channel.openConsole(); };
        window.addEventListener('message', receive);
        window.addEventListener('immersive-mineradio-console', openConsole);
        openConsole();
        let raf = 0;
        let lastSent = -Infinity;
        let wasSuspended = false;
        let staticValues: unknown[] = [];
        const update = (now: number) => {
            const state = latest.current;
            if (now - lastSent >= 1000 / 30 && (!state.renderingSuspended || !wasSuspended)) {
                const frame = makeStageFrame({ ...state, currentTime: typeof state.currentTime === 'number' ? state.currentTime : state.currentTime.get(), lyricTime: typeof state.lyricTime === 'object' ? state.lyricTime.get() : state.lyricTime, audio: state.sampleAudio?.() ?? state.audio, direction: state.sampleDirection?.() ?? null, directionRevision: getImmersionDirectionRevision() });
                const nextStaticValues = [state.duration, state.paused, state.metadata, state.lines, state.wordTiming, state.collections, state.queue, state.settings, state.showControls, state.showLyrics, state.reducedMotion, state.lowPowerMode, state.renderingSuspended, state.lyricRendererLabel, state.lyricRenderer, state.locale, state.consoleCopy];
                const changed = nextStaticValues.some((value, index) => value !== staticValues[index]);
                channel.send(changed ? frame : { currentTime: frame.currentTime, lyricTime: frame.lyricTime, audio: frame.audio, direction: frame.direction, directionRevision: frame.directionRevision });
                staticValues = nextStaticValues;
                lastSent = now;
                wasSuspended = state.renderingSuspended === true;
            }
            raf = requestAnimationFrame(update);
        };
        raf = requestAnimationFrame(update);
        return () => {
            cancelAnimationFrame(raf);
            setMineradioConsoleOpen(session, false);
            window.removeEventListener('message', receive);
            window.removeEventListener('immersive-mineradio-console', openConsole);
            channel.dispose();
        };
    }, [session, ready]);
    return <iframe
        ref={frameRef}
        src={`${import.meta.env.BASE_URL}mineradio/stage.html?session=${encodeURIComponent(session)}`}
        title={consoleCopy.stageTitle}
        className={props.className}
        style={{ border: 0, width: '100%', height: '100%', display: 'block', background: 'transparent', pointerEvents: 'auto' }}
        sandbox="allow-scripts allow-same-origin allow-pointer-lock"
        onLoad={() => setReady(true)}
    />;
}
