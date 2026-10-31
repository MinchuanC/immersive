import React, { useEffect, useState } from 'react';
import mineradio from '../../src/components/visualizer/backgrounds/mineradio/entry';
import { stopSceneTour } from '../../src/components/visualizer/backgrounds/mineradio/SceneTourControl';
import i18n from '../../src/i18n/config';
import { DEFAULT_THEME } from '../../src/services/baseThemes';
import { useThemeSettingsStore } from '../../src/stores/useThemeSettingsStore';
import { useVisualizerSettingsStore } from '../../src/stores/useVisualizerSettingsStore';
import type { ProbeDefinition } from './definition';

const MineradioQuickControlsProbe: React.FC = () => {
    const [visible, setVisible] = useState(true);
    const tuning = useVisualizerSettingsStore(state => state.mineradioBackgroundTuning);
    const setTuning = useVisualizerSettingsStore(state => state.handleSetMineradioBackgroundTuning);

    useEffect(() => {
        useThemeSettingsStore.setState({ staticMode: false });
        return stopSceneTour;
    }, []);

    return <div className="p-8 text-white">
        <button type="button" onClick={() => setVisible(value => !value)}>Toggle controls</button>
        <output data-probe-settings={JSON.stringify(tuning)} />
        {visible && <div className="flex flex-wrap gap-2" data-probe-controls>
            {mineradio.renderQuickControls?.({
                config: { mineradio: { tuning } },
                actions: { mineradio: { onTuningChange: setTuning } },
                t: key => i18n.t(key),
                isDaylight: false,
                theme: DEFAULT_THEME,
            })}
        </div>}
    </div>;
};

const definition: ProbeDefinition = {
    id: 'mineradioQuickControls',
    title: 'MineRadio quick controls',
    description: 'Exercises the real MineRadio quick controls against the visualizer settings store.',
    Component: MineradioQuickControlsProbe,
};

export default definition;
