import { afterEach, describe, expect, it } from 'vitest';
import { liveBeatEffects, visualizerWantsBeats, visualizerWantsDrumHits, type BeatClockSettings } from '@/components/visualizer/beatClockTargets';
import { DEFAULT_SMART_BEAT_SETTINGS } from '@/types';
import { smartBeatMayAnalyse } from '@/services/beatFx/beatEffects';
import * as beatFx from '@/services/beatFx/beatFxLive';
import { beatImpact } from '@/stores/motionSignals';

const effectId = 'mineradio.pulse';
const settings = (mode: 'off' | 'cached' | 'on', standalone = false): BeatClockSettings => ({
    smartBeat: { ...DEFAULT_SMART_BEAT_SETTINGS, mode, effects: {} },
    visualizerMode: standalone ? 'mineradio' : 'classic',
    visualizerBackgroundMode: 'mineradio',
});

afterEach(() => { beatFx.stopBeatFx(); beatFx.setBeatFxLiveEffects({}); beatFx.setBeatFxIntensities(1, 1); });

describe('MineRadio optional analysed accents', () => {
    it.each([false, true])('selects one shared beat effect for standalone=%s', standalone => {
        const selected = settings('on', standalone);
        expect(liveBeatEffects(selected).map(effect => effect.id)).toEqual([effectId]);
        expect(visualizerWantsDrumHits(selected)).toBe(false);
    });

    it.each([false, true])('preserves off, cached and on semantics for standalone=%s', standalone => {
        const modes = ['off', 'cached', 'on'] as const;
        expect(modes.map(mode => visualizerWantsBeats(settings(mode, standalone)))).toEqual([false, true, true]);
        expect(modes.map(mode => smartBeatMayAnalyse(settings(mode, standalone).smartBeat))).toEqual([false, false, true]);
        const selected = settings('on', standalone);
        selected.smartBeat = { ...selected.smartBeat, effects: { [effectId]: { on: false, strength: 1 } } };
        expect(visualizerWantsBeats(selected)).toBe(false);
    });

    it('keeps the visible Tempera drum effect independent of MineRadio beat accents', () => {
        const selected = { ...settings('on'), visualizerMode: 'tempera' as const };
        expect(liveBeatEffects(selected).map(effect => effect.id)).toEqual(['tempera.inkFlash', effectId]);
        expect(visualizerWantsBeats(selected)).toBe(true);
        expect(visualizerWantsDrumHits(selected)).toBe(true);

        selected.smartBeat = { ...selected.smartBeat, effects: { [effectId]: { on: false, strength: 1 } } };
        expect(visualizerWantsBeats(selected)).toBe(false);
        expect(visualizerWantsDrumHits(selected)).toBe(true);

        selected.smartBeat = { ...selected.smartBeat, effects: { 'tempera.inkFlash': { on: false, strength: 1 } } };
        expect(visualizerWantsBeats(selected)).toBe(true);
        expect(visualizerWantsDrumHits(selected)).toBe(false);
    });

    it('reads the named strength without another visualizer’s global scaling', () => {
        beatFx.beginBeatFxTrack('local');
        beatFx.setBeatFxEvents('local', [{ t: 1, kind: 'beat' }], 'beat_this');
        beatFx.setBeatFxIntensities(0, 0);
        beatFx.setBeatFxLiveEffects({ [effectId]: 1.5, 'sonnet.lensTear': 0.2 });
        const media = { currentTime: 0.9, paused: false, ended: false } as HTMLMediaElement;
        beatFx.tickBeatFx(media, null);
        media.currentTime = 1;
        beatFx.tickBeatFx(media, null);
        expect(beatImpact.get()).toBe(0);
        expect(beatFx.getBeatListImpact(effectId)).toBeCloseTo(1.5);
        expect(beatFx.getBeatListImpact('sonnet.lensTear')).toBeCloseTo(0.2);
        expect(beatFx.getBeatListImpact('missing')).toBe(0);
        beatFx.setBeatFxLiveEffects({ [effectId]: 0.4 });
        expect(beatFx.getBeatListImpact(effectId)).toBeCloseTo(0.4);
        beatFx.tickBeatFx(null, null);
        expect(beatFx.getBeatListImpact(effectId)).toBe(0);
    });

    it('stays quiet until an analysed beat is available', () => {
        beatFx.beginBeatFxTrack('loading');
        beatFx.setBeatFxLiveEffects({ [effectId]: 1 });
        beatFx.tickBeatFx({ currentTime: 1, paused: false, ended: false } as HTMLMediaElement, null);
        expect(beatFx.getBeatListImpact(effectId)).toBe(0);
    });
});
