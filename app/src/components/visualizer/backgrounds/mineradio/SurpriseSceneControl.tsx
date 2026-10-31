import React from 'react';
import { useTranslation } from 'react-i18next';
import { QuickControlChip } from '../../../shared/QuickControlChip';
import { useVisualizerSettingsStore } from '../../../../stores/useVisualizerSettingsStore';

export function chooseSurpriseScene(current: number, random = Math.random): number {
    if (!Number.isInteger(current) || current < 0 || current > 12) return Math.floor(random() * 13);
    const index = Math.floor(random() * 12);
    return index >= current ? index + 1 : index;
}

export default function SurpriseSceneControl() {
    const { t } = useTranslation();
    const label = t('immersion.surpriseScene', { defaultValue: 'Surprise scene' });
    return <QuickControlChip label={label} title={label} onClick={() => {
        const state = useVisualizerSettingsStore.getState();
        state.handleSetMineradioBackgroundTuning({ preset: chooseSurpriseScene(Number(state.mineradioBackgroundTuning.preset)) });
    }} />;
}
