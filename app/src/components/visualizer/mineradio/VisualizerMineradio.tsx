import React from 'react';
import type { VisualizerSharedProps } from '../definition';
import MineradioBackground from '../backgrounds/mineradio/MineradioBackground';

// MineRadio's original particle lyrics and graphics share one stage and the host's lyric clock.
export default function VisualizerMineradio(props: VisualizerSharedProps) {
    return <MineradioBackground config={props.background} coverUrl={props.coverUrl} paused={props.paused ?? false}
        staticMode={props.staticMode ?? false} audioBands={props.audioBands} audioPower={props.audioPower}
        isDaylight={props.isDaylight ?? false} theme={props.theme} lyricView={props} />;
}
