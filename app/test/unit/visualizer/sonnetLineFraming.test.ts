import { describe, expect, it } from 'vitest';
import { Container, Point } from 'pixi.js';
import { DEFAULT_SONNET_TUNING } from '@/types';
import { DEFAULT_THEME } from '@/services/baseThemes';
import { updateSonnetShot } from '@/components/visualizer/sonnet/sonnetShotFrame';
import type { ShotView } from '@/components/visualizer/sonnet/sonnetSceneBuilder';

const buildView = () => ({
    shot: { id: 'test', kind: 'type-impact', startTime: 0, endTime: 4, camera: { x: 0, y: 0, zoom: 1.35, rotation: 0 } },
    container: new Container(),
    segments: [0, 2].map(startTime => ({
        role: 'support',
        trackingGlyphs: [{ baseX: 0, baseY: 0, startTime }],
        glyphs: [],
        guide: { container: new Container(), startTime: 10, endTime: 11 },
    })),
    basePivotX: 0, basePivotY: 0, baseX: 640, baseY: 400,
    mgLayer: {},
    // The abandoned framing override used these line bounds to trigger a large camera pan.
    lineFrames: [
        { startTime: 0, endTime: 2, x: -600, y: -180, width: 1500, height: 360 },
        { startTime: 2, endTime: 4, x: 400, y: 220, width: 700, height: 200 },
    ],
} as unknown as ShotView);
const update = (view: ShotView, time: number) => updateSonnetShot(view, time, 1280, 800, 0, {
    tuning: DEFAULT_SONNET_TUNING, smartBeatEnabled: false, theme: DEFAULT_THEME, mod: () => 1,
});

describe('Sonnet original camera motion', () => {
    it('moves continuously without a new camera pan at a lyric boundary', () => {
        const view = buildView();
        let previous: { x: number; y: number; zoom: number } | undefined;
        for (let step = 0; step <= 36; step++) {
            update(view, 1.7 + step / 60);
            const point = view.container.toGlobal(new Point(0, 0));
            const current = { x: point.x, y: point.y, zoom: view.container.scale.x };
            if (previous) {
                expect(Math.hypot(current.x - previous.x, current.y - previous.y)).toBeLessThan(5);
                expect(Math.abs(current.zoom - previous.zoom)).toBeLessThan(0.01);
            }
            previous = current;
        }
    });

    it('reconstructs the same Folia camera after seeking away and back', () => {
        const view = buildView();
        update(view, 2);
        const position = view.container.toGlobal(new Point(0, 0));
        const scale = view.container.scale.x;
        update(view, 3);
        update(view, 2);
        expect(view.container.toGlobal(new Point(0, 0))).toEqual(position);
        expect(view.container.scale.x).toBe(scale);
    });
});
