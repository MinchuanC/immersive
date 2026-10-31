import React from 'react';
import { defineVisualizer } from '../definition';
import { QuickControlChip } from '../../shared/QuickControlChip';
import { openMineradioConsole } from '../../../integrations/mineradio/MineradioHost';
import { BEAT_EFFECT_IDS } from '../../../services/beatFx/beatEffects';

// Registers the donor lyric renderer without a second background or playback engine.
const VisualizerMineradio = React.lazy(() => import('./VisualizerMineradio'));
export default defineVisualizer({
    mode: 'mineradio', order: 35, labelKey: 'options.visualizerBackgroundModeMineradio', labelFallback: 'MineRadio',
    previewSeed: 'mineradio', previewStartOffset: 0,
    glyph: <><circle cx="12" cy="12" r="3" /><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-30 12 12)" /></>,
    command: { title: 'Visualizer: MineRadio', description: 'Original MineRadio particle lyrics and visual console', keywords: ['mineradio', 'particle lyrics', 'cinema', 'immersive'] },
    background: false,
    beatEffects: [{ id: BEAT_EFFECT_IDS.mineradioPulse, nameKey: 'options.beatEffect_mineradioPulse', descKey: 'options.beatEffect_mineradioPulseDesc', source: 'beats' }],
    render: props => <VisualizerMineradio {...props} />,
    renderQuickControls: ({ t }) => <QuickControlChip label={t('options.mineradioVisualConsole')} title={t('options.mineradioVisualConsole')} onClick={openMineradioConsole} />,
});
