import { defineBackgroundTuning, type StoredTuningFields } from '../../tuningDefinition';
import { MINERADIO_DEFAULT_SETTINGS } from '../../../../integrations/mineradio/donorDefaults';
import { normalizeMineradioSettings } from '../../../../integrations/mineradio/settings';
import type { StageSettings } from '../../../../integrations/mineradio/stageBridge';

// MineRadio's original console uses Folia's shared tuning persistence and config transfer.
declare module '../definition' {
    interface VisualizerBackgroundConfig {
        mineradio?: BackgroundTuningSlot<StageSettings>;
    }
    interface VisualizerBackgroundActions {
        mineradio?: BackgroundTuningActionSlot<StageSettings>;
    }
}
declare module '../../tuningDefinition' {
    interface VisualizerTuningSettings extends StoredTuningFields<'mineradioBackgroundTuning', 'handleSetMineradioBackgroundTuning', 'handleResetMineradioBackgroundTuning', StageSettings> {}
}

export default defineBackgroundTuning<StageSettings>({
    mode: 'mineradio',
    defaults: MINERADIO_DEFAULT_SETTINGS,
    settingsKey: 'mineradioBackgroundTuning',
    settingsSetterKey: 'handleSetMineradioBackgroundTuning',
    settingsResetterKey: 'handleResetMineradioBackgroundTuning',
    storage: {
        key: 'mineradio_background_tuning',
        read: normalizeMineradioSettings,
        merge: (held, patch) => normalizeMineradioSettings({ ...held, ...patch }),
    },
});
