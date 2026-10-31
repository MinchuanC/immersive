import React, { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotionFor } from '../../../../hooks/useReducedMotionFor';
import { readReducedMotion, useMotionSettingsStore } from '../../../../stores/useMotionSettingsStore';
import { useThemeSettingsStore } from '../../../../stores/useThemeSettingsStore';
import { useVisualizerSettingsStore } from '../../../../stores/useVisualizerSettingsStore';
import { DEFAULT_VISUALIZER_BACKGROUND_MODE } from '../../../../types/visualizerModes';
import { QuickControlChip } from '../../../shared/QuickControlChip';

let timer: number | null = null;
let unsubscribeMotion: (() => void) | undefined;
let unsubscribeBackground: (() => void) | undefined;
let unsubscribeStatic: (() => void) | undefined;
const listeners = new Set<() => void>();
const notify = () => { listeners.forEach(listener => listener()); };
export const subscribeSceneTour = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const isSceneTourRunning = () => timer !== null;

export function stopSceneTour(): void {
    if (timer === null) return;
    window.clearInterval(timer);
    timer = null;
    unsubscribeMotion?.();
    unsubscribeBackground?.();
    unsubscribeStatic?.();
    unsubscribeMotion = undefined;
    unsubscribeBackground = undefined;
    unsubscribeStatic = undefined;
    notify();
}

function startSceneTour(): void {
    if (timer !== null || readReducedMotion('uiMicroMotion') || useThemeSettingsStore.getState().staticMode
        || (useVisualizerSettingsStore.getState().visualizerBackgroundMode ?? DEFAULT_VISUALIZER_BACKGROUND_MODE) !== 'mineradio') return;
    timer = window.setInterval(() => {
        const settings = useVisualizerSettingsStore.getState();
        const value = Number(settings.mineradioBackgroundTuning.preset);
        const next = Number.isInteger(value) && value >= 0 && value < 13 ? (value + 1) % 13 : 0;
        settings.handleSetMineradioBackgroundTuning({ preset: next });
    }, 45_000);
    unsubscribeMotion = useMotionSettingsStore.subscribe(() => {
        if (readReducedMotion('uiMicroMotion')) stopSceneTour();
    });
    unsubscribeBackground = useVisualizerSettingsStore.subscribe(state => {
        if ((state.visualizerBackgroundMode ?? DEFAULT_VISUALIZER_BACKGROUND_MODE) !== 'mineradio') stopSceneTour();
    });
    unsubscribeStatic = useThemeSettingsStore.subscribe(state => {
        if (state.staticMode) stopSceneTour();
    });
    notify();
}

const SceneTourControl: React.FC = () => {
    const { t } = useTranslation();
    const reducedMotion = useReducedMotionFor('uiMicroMotion');
    const staticMode = useThemeSettingsStore(state => state.staticMode);
    const running = useSyncExternalStore(subscribeSceneTour, isSceneTourRunning, () => false);
    const label = running
        ? t('immersion.sceneTourStop', { defaultValue: 'Stop scene tour' })
        : t('immersion.sceneTourStart', { defaultValue: 'Start scene tour' });
    const title = staticMode
        ? t('immersion.sceneTourStaticMode', { defaultValue: 'Scene tour is unavailable in static mode' })
        : reducedMotion
        ? t('immersion.sceneTourReducedMotion', { defaultValue: 'Scene tour is unavailable with reduced motion' })
        : label;
    return <QuickControlChip label={label} title={title} disabled={reducedMotion || staticMode} onClick={running ? stopSceneTour : startSceneTour} />;
};

export default SceneTourControl;
