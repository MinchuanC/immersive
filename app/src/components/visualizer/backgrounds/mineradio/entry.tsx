import React from 'react';
import { defineVisualizerBackground } from '../definition';
import MineradioBackground from './MineradioBackground';
import { QuickControlChip } from '../../../shared/QuickControlChip';
import { MINERADIO_DEFAULT_SETTINGS } from '../../../../integrations/mineradio/donorDefaults';
import './tuning';
import { openMineradioConsole } from '../../../../integrations/mineradio/MineradioHost';
import { BEAT_EFFECT_IDS } from '../../../../services/beatFx/beatEffects';
import SceneTourControl from './SceneTourControl';
import VisualMoodControl from './VisualMoodControl';
import SurpriseSceneControl from './SurpriseSceneControl';

// Registers the original thirteen-preset MineRadio scene beside Folia's backgrounds.
const PRESETS = ['Emily', 'Tunnel', 'Planet', 'Void', 'Record', 'Star River', 'Requiem', 'Sonic Topography', 'Sonic Workshop', 'Eclipse Halo', 'Neon Drizzle', 'Prism Flock', 'Abyssal Bloom'];
export default defineVisualizerBackground({
    mode: 'mineradio',
    order: 5,
    labelKey: 'options.visualizerBackgroundModeMineradio',
    labelFallback: 'MineRadio',
    glyph: <><circle cx="12" cy="12" r="3" /><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-30 12 12)" /></>,
    command: { title: 'Background: MineRadio', description: 'Original MineRadio particle stage and 3D collection shelf', keywords: ['mineradio', 'immersive', 'particles', 'sonic', '3d shelf'] },
    beatEffects: [{ id: BEAT_EFFECT_IDS.mineradioPulse, nameKey: 'options.beatEffect_mineradioPulse', descKey: 'options.beatEffect_mineradioPulseDesc', source: 'beats' }],
    render: props => <MineradioBackground {...props} />,
    renderQuickControls: ({ config, actions, t }) => {
        const preset = Number(config?.mineradio?.tuning?.preset ?? MINERADIO_DEFAULT_SETTINGS.preset);
        return <>
            <QuickControlChip label={PRESETS[preset] ?? PRESETS[12]} title={t('options.mineradioPreset')} onClick={() => actions?.mineradio?.onTuningChange?.({ preset: (preset + 1) % PRESETS.length })} />
            <QuickControlChip label={t('options.mineradioVisualConsole')} title={t('options.mineradioVisualConsole')} onClick={openMineradioConsole} />
            <SceneTourControl />
            <VisualMoodControl tuning={config?.mineradio?.tuning} onTuningChange={actions?.mineradio?.onTuningChange} />
            <SurpriseSceneControl />
        </>;
    },
    resetSettings: actions => actions?.mineradio?.onTuningChange?.(MINERADIO_DEFAULT_SETTINGS),
});
