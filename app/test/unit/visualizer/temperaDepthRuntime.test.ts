import { afterEach, describe, expect, it, vi } from 'vitest';
import * as pixi from 'pixi.js';
import { DEFAULT_TEMPERA_TUNING } from '@/types';
import { TemperaPixiRuntime } from '@/components/visualizer/tempera/createTemperaPixiRuntime';
import { createTemperaBlurBaker } from '@/components/visualizer/tempera/temperaDepth';
import { TemperaInkFlash } from '@/components/visualizer/tempera/temperaInkFlash';
import { getBeatFxHeard } from '@/services/beatFx/beatFxLive';
import { getDrumHits, type DrumHits } from '@/services/analysis/drumHits';

// Covers the depth effect's runtime boundaries without requiring a GPU or real-time playback.
vi.mock('@/services/beatFx/beatFxLive', () => ({
    getBeatEffectStrength: vi.fn(() => 1),
    getBeatFxHeard: vi.fn(() => ({ key: 'track', time: 4 })),
}));
vi.mock('@/services/analysis/drumHits', () => ({ getDrumHits: vi.fn(), DRUM_HAT: 2 }));

const mountRuntime = () => {
    const runtime = Object.create(TemperaPixiRuntime.prototype) as TemperaPixiRuntime;
    const clear = vi.fn();
    const dropStaged = vi.fn();
    Object.assign(runtime, {
        destroyed: false,
        options: {
            tuning: { ...DEFAULT_TEMPERA_TUNING },
            host: { clientWidth: 800, clientHeight: 800 },
            staticMode: false,
            paused: false,
        },
        app: { renderer: { resolution: 1.5 } },
        sceneCache: { clear, forEach: vi.fn(), get: vi.fn() },
        songSwap: { active: false, dropStaged },
        depthOn: true,
        depthMix: 1,
        depthMixAt: null,
        depthBlurTimer: null,
        lastWidth: 0,
        lastHeight: 0,
    });
    return { runtime, internal: runtime as any, clear, dropStaged };
};

afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe('Tempera depth runtime', () => {
    it('keeps a direct static preview out of depth even when another host has the effect live', () => {
        const { internal, clear } = mountRuntime();
        internal.options.staticMode = true;
        internal.updateDepthSwitch();
        expect(internal.depthOn).toBe(false);
        expect(clear).toHaveBeenCalledOnce();
    });

    it('rebakes once after the depth slider rests, and waits for an active song handover', () => {
        vi.useFakeTimers();
        const { runtime, internal, clear, dropStaged } = mountRuntime();
        runtime.setTuning({ ...DEFAULT_TEMPERA_TUNING, depthOfField: 0.5 });
        vi.advanceTimersByTime(200);
        runtime.setTuning({ ...DEFAULT_TEMPERA_TUNING, depthOfField: 1.5 });
        vi.advanceTimersByTime(249);
        expect(clear).not.toHaveBeenCalled();
        internal.songSwap.active = true;
        vi.advanceTimersByTime(1);
        expect(clear).not.toHaveBeenCalled();
        internal.songSwap.active = false;
        vi.advanceTimersByTime(250);
        expect(clear).toHaveBeenCalledOnce();
        expect(dropStaged).toHaveBeenCalledOnce();
    });

    it('does not queue blur work while depth is off', () => {
        vi.useFakeTimers();
        const { runtime, internal, clear } = mountRuntime();
        internal.depthOn = false;
        runtime.setTuning({ ...DEFAULT_TEMPERA_TUNING, depthOfField: 1.5 });
        vi.runAllTimers();
        expect(clear).not.toHaveBeenCalled();
        expect(internal.depthBlurTimer).toBeNull();
    });
});

describe('Tempera ink suppression', () => {
    const hits: DrumHits = { times: Float64Array.from([1]), strengths: Float32Array.from([1]), kinds: Uint8Array.from([0]), until: 5 };

    it('passes no hits before analysis or after the currently separated range', () => {
        const { internal } = mountRuntime();
        internal.inkFlashSupported = true;
        internal.inkFlash = { update: vi.fn() };
        vi.mocked(getDrumHits).mockReturnValue(null);
        internal.updateInkFlash(4, 800, 800, 0);
        expect(internal.inkFlash.update).toHaveBeenLastCalledWith(expect.objectContaining({ hits: null }));
        vi.mocked(getDrumHits).mockReturnValue(hits);
        vi.mocked(getBeatFxHeard).mockReturnValue({ key: 'track', time: 5 });
        internal.updateInkFlash(5, 800, 800, 0);
        expect(internal.inkFlash.update).toHaveBeenLastCalledWith(expect.objectContaining({ hits: null }));
    });

    it('passes zero strength in static mode and on unsupported renderers', () => {
        const { internal } = mountRuntime();
        internal.inkFlash = { update: vi.fn() };
        internal.inkFlashSupported = true;
        internal.options.staticMode = true;
        internal.updateInkFlash(4, 800, 800, 0);
        expect(internal.inkFlash.update).toHaveBeenLastCalledWith(expect.objectContaining({ strength: 0, hits: null }));
        internal.options.staticMode = false;
        internal.inkFlashSupported = false;
        internal.updateInkFlash(4, 800, 800, 0);
        expect(internal.inkFlash.update).toHaveBeenLastCalledWith(expect.objectContaining({ strength: 0, hits: null }));
    });

    it('draws the same ink after a seek back and after repeating a paused frame', () => {
        const ink = new TemperaInkFlash(pixi);
        const internal = ink as any;
        vi.spyOn(internal, 'ensureMesh').mockReturnValue(true);
        internal.textures = Array.from({ length: 4 }, () => ({ source: {}, destroy: vi.fn() }));
        internal.shader = { resources: {}, destroy: vi.fn() };
        internal.geometry = { positions: new Float32Array(8), destroy: vi.fn() };
        const track: DrumHits = { times: Float64Array.from([1, 3.9]), strengths: Float32Array.from([1, 1]), kinds: Uint8Array.from([0, 0]) };
        const frame = { time: 4, width: 800, height: 600, strength: 1, hits: track, paragraphIndex: 2, inkColor: '#55aaee' };
        const capture = () => [...internal.rows, ...internal.offsets, ...internal.alphas, ...internal.ink];
        ink.update(frame);
        const direct = capture();
        ink.update({ ...frame, time: 2 });
        ink.update(frame);
        expect(capture()).toEqual(direct);
        ink.update(frame);
        expect(capture()).toEqual(direct);
        ink.destroy();
    });

    it('keeps the ink layer hidden with no drum data or a disabled effect', () => {
        const ink = new TemperaInkFlash(pixi);
        const ensureMesh = vi.spyOn(ink as any, 'ensureMesh').mockReturnValue(true);
        const frame = { time: 4, width: 800, height: 800, strength: 1, hits: null, paragraphIndex: 0, inkColor: '#ffffff' };
        ink.update(frame);
        expect(ink.container.visible).toBe(false);
        ensureMesh.mockClear();
        ink.update({ ...frame, strength: 0 });
        expect(ink.container.visible).toBe(false);
        expect(ensureMesh).not.toHaveBeenCalled();
        ink.destroy();
    });
});

describe('Tempera baked depth textures', () => {
    it('destroys every baked scene texture when its scene is retired', () => {
        const { internal } = mountRuntime();
        const container = new pixi.Container();
        internal.pixi = pixi;
        internal.sceneContainer = new pixi.Container();
        internal.sceneContainer.addChild(container);
        const texture = new pixi.Texture();
        const destroy = vi.spyOn(texture, 'destroy');
        const bakedTextures = new Set([texture]);
        internal.destroyScene({ container, shots: [], postProcessFilters: [], bakedTextures });
        expect(destroy).toHaveBeenCalledWith(true);
        expect(bakedTextures.size).toBe(0);
        internal.sceneContainer.destroy();
    });

    it('skips static-mode blur and releases each replaced texture once', () => {
        const textures = new Set<pixi.Texture>();
        const options = { staticMode: true, width: 1280, resolution: 1.5, textures };
        const texture = new pixi.Texture();
        const destroy = vi.spyOn(texture, 'destroy');
        const renderer = { generateTexture: vi.fn(() => texture) } as unknown as pixi.Renderer;
        expect(createTemperaBlurBaker(pixi, renderer, options)).toBeNull();
        const cpuPixi = { ...pixi, BlurFilter: class { padding = 0; destroy() {} } } as unknown as typeof pixi;
        const baker = createTemperaBlurBaker(cpuPixi, renderer, { ...options, staticMode: false })!;
        const source = new pixi.Texture({ source: new pixi.TextureSource({ width: 100, height: 100 }) });
        const node = new pixi.Sprite(source);
        const parent = new pixi.Container();
        parent.addChild(node);
        node.position.set(12, 24);
        const baked = baker.bake(node, 6);
        expect(textures.has(texture)).toBe(true);
        expect(node.parent).toBe(parent);
        expect([node.x, node.y]).toEqual([12, 24]);
        baker.release(baked);
        baker.release(baked);
        expect(destroy).toHaveBeenCalledOnce();
        expect(textures.size).toBe(0);
        parent.destroy({ children: true });
        source.destroy(true);
    });
});
