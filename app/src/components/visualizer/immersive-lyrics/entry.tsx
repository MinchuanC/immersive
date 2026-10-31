import React from 'react';
import { defineVisualizer } from '../definition';

const ImmersiveLyrics = React.lazy(() => import('./ImmersiveLyrics'));

export default defineVisualizer({
    mode: 'immersive-lyrics',
    order: 27,
    labelKey: 'ui.visualizerImmersiveLyrics',
    labelFallback: 'Immersive Lyrics',
    previewSeed: 'immersive-lyrics',
    previewStartOffset: 0,
    glyph: <><path d="M5 7h14" opacity="0.4" /><path d="M3 12h18" /><path d="M5 17h14" opacity="0.4" /></>,
    render: props => <ImmersiveLyrics {...props} />,
});
