import React, { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { QuickControlChip } from '../../../shared/QuickControlChip';
import { MINERADIO_DEFAULT_SETTINGS } from '../../../../integrations/mineradio/donorDefaults';
import type { StageSettings } from '../../../../integrations/mineradio/stageBridge';

type MoodValues = Pick<StageSettings, 'intensity' | 'speed' | 'bloom' | 'bloomStrength'>;
type Props = { tuning?: StageSettings; onTuningChange?: (patch: Partial<StageSettings>) => void };

const moods: Record<'calm' | 'balanced' | 'vivid', MoodValues> = {
    calm: { intensity: 0.45, speed: 0.65, bloom: false, bloomStrength: 0.3 },
    balanced: { intensity: 0.85, speed: 1, bloom: false, bloomStrength: 0.62 },
    vivid: { intensity: 1.2, speed: 1.2, bloom: true, bloomStrength: 0.85 },
};
const keys = ['intensity', 'speed', 'bloom', 'bloomStrength'] as const;
let savedMood: { previous: MoodValues; applied: MoodValues } | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getSnapshot = () => savedMood;
const updateSavedMood = (value: typeof savedMood) => { savedMood = value; listeners.forEach(listener => listener()); };

const VisualMoodControl: React.FC<Props> = ({ tuning, onTuningChange }) => {
    const { t } = useTranslation();
    const saved = useSyncExternalStore(subscribe, getSnapshot, () => null);

    const apply = (mood: MoodValues) => {
        if (!onTuningChange) return;
        const current = { ...MINERADIO_DEFAULT_SETTINGS, ...tuning };
        const previous: MoodValues = savedMood ? { ...savedMood.previous } : { intensity: current.intensity, speed: current.speed, bloom: current.bloom, bloomStrength: current.bloomStrength };
        if (savedMood) for (const key of keys) if (current[key] !== savedMood.applied[key]) previous[key] = current[key];
        updateSavedMood({ previous, applied: mood });
        onTuningChange(mood);
    };
    const restore = () => {
        if (!savedMood || !onTuningChange) return;
        const current = { ...MINERADIO_DEFAULT_SETTINGS, ...tuning };
        const patch: Partial<MoodValues> = {};
        for (const key of keys) if (current[key] === savedMood.applied[key]) patch[key] = savedMood.previous[key];
        updateSavedMood(null);
        onTuningChange(patch);
    };

    return <>
        <QuickControlChip label={t('immersion.moodCalm', { defaultValue: 'Calm' })} title={t('immersion.moodCalmTitle', { defaultValue: 'Calm visual mood' })} onClick={() => apply(moods.calm)} disabled={!onTuningChange} />
        <QuickControlChip label={t('immersion.moodBalanced', { defaultValue: 'Balanced' })} title={t('immersion.moodBalancedTitle', { defaultValue: 'Balanced visual mood' })} onClick={() => apply(moods.balanced)} disabled={!onTuningChange} />
        <QuickControlChip label={t('immersion.moodVivid', { defaultValue: 'Vivid' })} title={t('immersion.moodVividTitle', { defaultValue: 'Vivid visual mood' })} onClick={() => apply(moods.vivid)} disabled={!onTuningChange} />
        {saved && <QuickControlChip label={t('immersion.moodRestore', { defaultValue: 'Restore' })} title={t('immersion.moodRestoreTitle', { defaultValue: 'Restore previous visual settings' })} onClick={restore} />}
    </>;
};

export default VisualMoodControl;
