import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import VisualizerRenderer from '../../../src/components/visualizer/VisualizerRenderer';
import { openMineradioConsole, useMineradioConsoleOpen } from '../../../src/integrations/mineradio/MineradioHost';
import { DEFAULT_THEME } from '../../../src/services/baseThemes';
import { useVisualizerSettingsStore } from '../../../src/stores/useVisualizerSettingsStore';
import '../../../src/i18n/config';
import '../../../src/index.css';

const signal = motionValue(0);
useVisualizerSettingsStore.getState().handleSetMineradioBackgroundTuning({ preset: 12 });
const mode = new URLSearchParams(location.search).get('mode') === 'mineradio' ? 'mineradio' : 'classic';
function Fixture() {
    const [mounted, setMounted] = useState(true);
    const open = useMineradioConsoleOpen();
    const tuning = useVisualizerSettingsStore(state => state.mineradioBackgroundTuning);
    return <>
    {mounted && <VisualizerRenderer mode={mode} currentTime={signal} currentLineIndex={-1} lines={[]} theme={DEFAULT_THEME}
        plainLyrics={'Untimed lyrics remain scrollable.\n'.repeat(80)} audioPower={signal}
        audioBands={{ bass: signal, lowMid: signal, mid: signal, vocal: signal, treble: signal }} paused background={{ mode: 'mineradio', mineradio: { tuning } }} />}
    <button type="button" style={{ position: 'fixed', left: 24, bottom: 24, zIndex: 70 }} data-mineradio-console onClick={openMineradioConsole}>Visual effects</button>
    <button type="button" style={{ position: 'fixed', left: 180, bottom: 24, zIndex: 70 }} onClick={() => setMounted(false)}>Remove graphics</button>
    <output hidden data-console-open={open}>{String(open)}</output>
    </>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
