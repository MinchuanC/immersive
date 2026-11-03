import { useDesktopSettingsStore } from '../../../stores/useDesktopSettingsStore';
import { useBackgroundLyricHoldStore } from './backgroundLyricHoldStore';

// Native visibility already includes the live-output exceptions; focus loss alone never holds it.
export const useLowPowerRenderHold = () => {
    const lowPowerMode = useDesktopSettingsStore(state => state.lowPowerMode);
    const held = useBackgroundLyricHoldStore(state => state.held);
    return lowPowerMode && held;
};
