import { describe, expect, it } from 'vitest';
import { dockProgress, seekFromPointer, homeContinueAction } from '../../../src/integrations/mineradio/controls';

// The transplanted controls always act on the shared player's seconds-based timeline.
describe('MineRadio shared controls', () => {
    it('clamps seeks to the actual track and rejects unknown durations', () => {
        expect(seekFromPointer(75, { left: 25, width: 100 }, 240)).toBe(120);
        expect(seekFromPointer(-10, { left: 25, width: 100 }, 240)).toBe(0);
        expect(seekFromPointer(999, { left: 25, width: 100 }, 240)).toBe(240);
        expect(seekFromPointer(75, { left: 25, width: 100 }, 0)).toBeNull();
    });

    it('never displays invalid or overflowing playback progress', () => {
        expect(dockProgress(300, 200)).toBe(1);
        expect(dockProgress(-1, 200)).toBe(0);
        expect(dockProgress(NaN, 200)).toBe(0);
        expect(dockProgress(10, 0)).toBe(0);
    });

    it('continues genuine current/queued music or opens import for an empty library', () => {
        expect(homeContinueAction({ title: 'Playing song' }, [], true)).toEqual({ action: 'playPause' });
        expect(homeContinueAction({ title: 'Playing song' }, [], false)).toEqual({ action: 'openPlayer' });
        expect(homeContinueAction(undefined, [{ id: 'real', title: 'Queued song' }], true)).toEqual({ action: 'selectTrack', value: 'real' });
        expect(homeContinueAction(undefined, [], true)).toEqual({ action: 'openFiles' });
    });
});
