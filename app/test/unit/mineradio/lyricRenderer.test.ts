// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import { expect, it, vi } from 'vitest';
import { MineradioStage } from '../../../src/integrations/mineradio/MineradioStage';
import VisualizerMineradio from '../../../src/components/visualizer/mineradio/VisualizerMineradio';
import { prepareHonestLyricTiming } from '../../../src/utils/lyrics/honestTiming';
import type { VisualizerSharedProps } from '../../../src/components/visualizer/definition';

// Check timing provenance across the real lyric-renderer-to-stage boundary.
vi.mock('../../../src/integrations/mineradio/MineradioStage', () => ({ MineradioStage: vi.fn(() => null) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it('retains supplied start-only words and an independent renderer choice when text is hidden', () => {
    const lines = prepareHonestLyricTiming({ isWordByWord: true, lines: [{
        fullText: 'One two', startTime: 1, endTime: 4,
        words: [{ text: 'One', startTime: 1, endTime: 1 }, { text: 'two', startTime: 2, endTime: 2 }],
    }] }).lines;
    const props = { currentTime: motionValue(2), lines, currentLineIndex: 0, duration: 8, showText: false,
        theme: {}, audioPower: motionValue(0), audioBands: {}, isPreviewMode: true,
    } as VisualizerSharedProps;
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    try {
        act(() => root.render(React.createElement(VisualizerMineradio, props)));
        const stage = vi.mocked(MineradioStage).mock.calls.at(-1)![0];
        expect(stage.wordTiming).toBe(true);
        expect(stage.lines).toEqual(lines);
        expect(stage.lyricRenderer).toBe('mineradio');
        expect(stage.showLyrics).toBe(false);
        expect(stage.lines![0].words.map(word => word.endTime - word.startTime)).toEqual([0, 0]);
    } finally { act(() => root.unmount()); host.remove(); }
});
