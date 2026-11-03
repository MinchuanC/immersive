import assert from 'node:assert/strict';
import fs from 'node:fs';

// Observe real production glyphs and render calls; never drive a synthetic animation ticker.
const command = async (cmd, ...args) => {
    const reply = await fetch('http://127.0.0.1:9230', { method: 'POST', body: JSON.stringify({ cmd, args }), signal: AbortSignal.timeout(60000) }).then(response => response.json());
    assert.equal(reply.ok, true, reply.error);
    return reply.output;
};
const evaluate = async (fn, ...args) => JSON.parse(await command('eval', `(${fn})(...${JSON.stringify(args)})`));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const status = JSON.parse(await command('status'));
assert.ok(status.profile.endsWith('/test-results/run-desktop/userdata') && status.page.startsWith('file:'));
const setLowPower = async low => {
    if ((await evaluate(() => localStorage.getItem('low_power_mode') === 'true')) !== low) await command('palette', 'Low Power mode');
};
await command('click', '.mineradio-dock #control-title');
await command('palette', 'Visualizer: MineRadio');
await evaluate(() => {
    window.lowPowerPreviousPixiHook = globalThis.__PIXI_APP_INIT__;
    globalThis.__PIXI_APP_INIT__ = (app, version) => { window.lowPowerPreviousPixiHook?.(app, version); window.lowPowerPixiApp = app; };
    return true;
});
const results = {};
try {
    await command('palette', 'Visualizer: Sonnet');
    if (!(await evaluate(() => [...document.querySelectorAll('audio')].find(a => a.duration === 45).paused))) await command('press', 'Space');
    await evaluate(() => {
        const app = window.lowPowerPixiApp;
        window.lowPowerSonnetIdentity = app;
        window.lowPowerReadSonnet = () => {
            const nodes = [];
            const visit = node => {
                if (!node.visible || node.alpha === 0) return;
                if (typeof node.text === 'string' && node.text.trim()) {
                    const m = node.worldTransform;
                    nodes.push({ text: node.text, pose: [node.x, node.y, node.scale.x, node.scale.y, node.rotation, node.alpha, m.a, m.b, m.c, m.d, m.tx, m.ty] });
                }
                for (const child of node.children || []) visit(child);
            };
            visit(app.stage.children[0]);
            return { nodes, pixels: [app.canvas.width, app.canvas.height], same: app === window.lowPowerSonnetIdentity && app.canvas.isConnected };
        };
        return true;
    });
    const times = [9.9, 10.05, 10.15, 10.35, 10.7, 11.5, 19.9, 20.1, 20.35];
    results.sonnet = [];
    for (const low of [false, true, false]) {
        await setLowPower(low);
        const sequence = await evaluate(async times => {
            const audio = [...document.querySelectorAll('audio')].find(a => a.duration === 45);
            const frames = [];
            for (const time of times) {
                audio.currentTime = time;
                await new Promise(resolve => setTimeout(resolve, 180));
                frames.push({ time: audio.currentTime, ...window.lowPowerReadSonnet() });
            }
            return frames;
        }, times);
        results.sonnet.push({ low, sequence });
    }
    let maximumPoseDelta = 0;
    for (const run of results.sonnet) {
        assert.ok(run.sequence.every(frame => frame.same && frame.nodes.length > 0), 'Sonnet renders actual visible glyphs on the same canvas');
        assert.ok(new Set(run.sequence.map(frame => JSON.stringify(frame.nodes))).size > 4, 'Sonnet glyphs animate through the line transitions');
        for (let i = 0; i < times.length; i++) {
            const before = results.sonnet[0].sequence[i], after = run.sequence[i];
            assert.deepEqual(after.pixels, before.pixels, 'Sonnet sharpness is unchanged');
            assert.deepEqual(after.nodes.map(n => n.text), before.nodes.map(n => n.text), 'Matched visible glyph sequence');
            after.nodes.forEach((node, j) => node.pose.forEach((value, k) => { maximumPoseDelta = Math.max(maximumPoseDelta, Math.abs(value - before.nodes[j].pose[k])); }));
        }
    }
    assert.ok(maximumPoseDelta < .1, 'Sonnet actual glyph transforms match at the same media times: ' + maximumPoseDelta);
    results.maximumPoseDelta = maximumPoseDelta;
    console.log('PASS: Sonnet actual glyph sequence, same canvas and resolution; maximum pose delta', maximumPoseDelta);
    results.live = {};
    for (const style of ['Sonnet', 'MineRadio']) {
        if (style === 'MineRadio') await command('palette', 'Visualizer: MineRadio');
        const runs = [];
        for (const toggle of [false, true]) {
            await setLowPower(false);
            await evaluate(() => { [...document.querySelectorAll('audio')].find(a => a.duration === 45).currentTime = 18; return true; });
            await wait(700);
            await evaluate(style => {
                const audio = [...document.querySelectorAll('audio')].find(a => a.duration === 45);
                const stage = document.querySelector('iframe[title="MineRadio visual stage"]')?.contentWindow;
                const renderer = style === 'Sonnet' ? window.lowPowerPixiApp.renderer : stage.renderer;
                const render = renderer.render;
                window.lowPowerAnimationFrames = [];
                renderer.render = function (...args) {
                    const result = render.apply(this, args);
                    if (audio.paused) return result;
                    let frame;
                    if (style === 'Sonnet') frame = window.lowPowerReadSonnet();
                    else {
                        const mesh = stage.stageLyrics.current, data = mesh?.userData.lyric;
                        frame = { id: mesh?.uuid, age: mesh?.userData.age, cue: stage.stageLyrics.currentIdx,
                            sceneTime: stage.uniforms.uTime.value, pixels: [renderer.domElement.width, renderer.domElement.height],
                            nodes: (data?.rowLayers || []).filter(row => row.mesh.visible).map(row => ({ text: row.text,
                                pose: [...row.mesh.position.toArray(), ...row.mesh.scale.toArray(), row.mat.uniforms.uOpacity.value],
                                quality: row.qualityTier, texture: [row.qualityTexture?.image?.width, row.qualityTexture?.image?.height] })) };
                    }
                    window.lowPowerAnimationFrames.push({ at: performance.now(), time: audio.currentTime, low: localStorage.getItem('low_power_mode') === 'true', ...frame });
                    return result;
                };
                window.lowPowerStopAnimationProbe = () => { renderer.render = render; return window.lowPowerAnimationFrames; };
                return true;
            }, style);
            await command('press', 'Space');
            if (toggle) { await wait(300); await setLowPower(true); await wait(300); await setLowPower(false); await wait(500); }
            else await wait(8500);
            await command('press', 'Space');
            runs.push(await evaluate(() => window.lowPowerStopAnimationProbe()));
        }
        results.live[style] = runs;
        const cadence = frames => (frames.length - 1) * 1000 / (frames.at(-1).at - frames[0].at);
        const control = runs[0], switched = runs[1], lowFrames = switched.filter(frame => frame.low);
        assert.ok(control.length > 100 && lowFrames.length > 50, style + ' records actual rendered frames');
        assert.ok(cadence(lowFrames) >= cadence(control) * .9, style + ' retains actual render cadence');
        for (const frames of [control, lowFrames, switched.filter(frame => !frame.low)]) {
            assert.ok(new Set(frames.map(frame => JSON.stringify(frame.nodes))).size > 20, style + ' visible glyph poses continue moving');
            assert.ok(frames.every(frame => frame.nodes.length > 0), style + ' never drops the lyric geometry');
            assert.ok(frames.every(frame => JSON.stringify(frame.pixels) === JSON.stringify(control[0].pixels)), style + ' keeps lyric resolution');
        }
        if (style === 'Sonnet') assert.ok(switched.every(frame => frame.same), 'Sonnet keeps its application and canvas through both toggles');
        else {
            assert.equal(new Set(switched.map(frame => frame.id)).size, 1, 'MineRadio keeps the live lyric mesh across toggles and line transition');
            assert.ok([1, 2].every(cue => control.some(frame => frame.cue === cue) && switched.some(frame => frame.cue === cue)), 'MineRadio crosses the same lyric boundary');
            assert.ok(switched.every((frame, i) => i === 0 || frame.age >= switched[i - 1].age), 'MineRadio lyric entrance age never restarts');
            assert.ok(switched.every((frame, i) => i === 0 || frame.sceneTime >= switched[i - 1].sceneTime), 'MineRadio animation clock never restarts');
            const quality = frames => [...new Set(frames.flatMap(frame => frame.nodes.map(node => JSON.stringify([node.text, node.quality, node.texture]))))].sort();
            assert.deepEqual(quality(switched), quality(control), 'MineRadio uses the same actual lyric texture quality');
        }
        console.log('PASS:', style, 'live lyric motion; actual renders/sec Standard', cadence(control).toFixed(1), 'Low Power', cadence(lowFrames).toFixed(1));
    }
} finally {
    await evaluate(() => { window.lowPowerStopAnimationProbe?.(); globalThis.__PIXI_APP_INIT__ = window.lowPowerPreviousPixiHook; return true; });
    fs.mkdirSync('test-results/low-power', { recursive: true });
    fs.writeFileSync('test-results/low-power/lyric-parity.json', JSON.stringify(results, null, 2));
}
