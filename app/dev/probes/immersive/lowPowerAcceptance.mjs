import assert from 'node:assert/strict';
import fs from 'node:fs';

// Run after localPlaybackSmoke.mjs against driver serve --production; uses only its isolated fixture.
const baseline = process.argv.includes('--baseline');
const command = async (cmd, ...args) => {
    const result = await fetch('http://127.0.0.1:9230', { method: 'POST', body: JSON.stringify({ cmd, args }), signal: AbortSignal.timeout(60000) }).then(response => response.json());
    assert.equal(result.ok, true, result.error);
    return result.output;
};
const evaluate = async (fn, ...args) => JSON.parse(await command('eval', `(${fn})(...${JSON.stringify(args)})`));
const main = async expression => JSON.parse(await command('main-eval', expression));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const windowAction = action => main(`electron.BrowserWindow.getAllWindows().filter(w => w.webContents.getURL().startsWith('file:')).map(w => { ${action}; return {visible:w.isVisible(),minimized:w.isMinimized()}; })`);
const metrics = () => main('({at:performance.now(),processes:electron.app.getAppMetrics().map(({pid,creationTime,type,cpu,memory})=>({pid,creationTime,type,cpu,memory}))})');
const snapshot = () => evaluate(async () => {
    const audio = [...document.querySelectorAll('audio')].find(a => a.duration === 45);
    const stage = document.querySelector('iframe[title="MineRadio visual stage"]')?.contentWindow;
    const shaders = [...document.querySelectorAll('[data-paper-shader]')].map(e => e.paperShaderMount).filter(Boolean);
    return { time: audio?.currentTime, paused: audio?.paused, visibility: document.visibilityState,
        policy: await window.electron.getBackgroundThrottlingState(), low: localStorage.getItem('low_power_mode'),
        points: stage?.renderer.info.render.points, stageFrames: stage?.renderer.info.render.frame,
        stageTime: stage?.audio.currentTime, stageLyricTime: stage?.stageSnapshot.lyricTime,
        stageDpr: stage?.renderer.getPixelRatio(), stageLow: stage?.stageSnapshot.lowPowerMode,
        shaderFrames: shaders.map(m => m.getCurrentFrame()),
        shaderPixels: shaders.map(m => m.canvasElement.width * m.canvasElement.height),
        lyricPixels: [...document.querySelectorAll('[data-testid=player-visual-surface] canvas')].filter(c => !c.closest('[data-paper-shader]')).map(c => c.width * c.height),
        raf: window.lowPowerFrames || 0, intervals: window.lowPowerIntervals || [] };
});
const status = JSON.parse(await command('status'));
assert.ok(status.profile.endsWith('/test-results/run-desktop/userdata'));
assert.ok(status.page.startsWith('file:'), 'Use the production bundle');
const environment = await main('({dev:process.env.ELECTRON_DEV,electron:process.versions.electron,platform:process.platform,arch:process.arch,packaged:electron.app.isPackaged})');
assert.equal(environment.dev, 'false');
await windowAction('w.webContents.closeDevTools(); w.setSize(1440,900); w.restore(); w.show()');
if (await evaluate(() => !!document.querySelector('.mineradio-home'))) await command('click', '.mineradio-dock #control-title');
const results = [];
try {
    for (const [name, lyric, background] of [
        ['mineradio-lyrics', 'MineRadio', 'MineRadio'], ['sonnet-mineradio', 'Sonnet', 'MineRadio'],
        ['sonnet-latent', 'Sonnet', 'Latent'], ['sonnet-nomand', 'Sonnet', 'Nomand'],
    ]) {
        await command('palette', 'Visualizer: ' + lyric);
        await command('palette', 'Background: ' + background);
        await wait(2000);
        for (const state of ['playing', 'paused', 'hidden']) {
            for (let run = 0; run < (baseline ? 3 : 6); run++) {
                const low = !baseline && run % 2 === 1;
                await windowAction('w.restore(); w.show()');
                if (!baseline && (await snapshot()).low !== String(low)) await command('palette', 'Low Power mode');
                let current = await snapshot();
                if (current.paused !== (state === 'paused')) await command('press', 'Space');
                await evaluate(() => {
                    const audio = [...document.querySelectorAll('audio')].find(a => a.duration === 45);
                    audio.currentTime = 12;
                    cancelAnimationFrame(window.lowPowerRaf);
                    window.lowPowerFrames = 0; window.lowPowerIntervals = []; let previous = performance.now();
                    const frame = now => { window.lowPowerFrames++; window.lowPowerIntervals.push(now - previous); previous = now; window.lowPowerRaf = requestAnimationFrame(frame); };
                    window.lowPowerRaf = requestAnimationFrame(frame);
                    return true;
                });
                if (state === 'hidden') await windowAction('w.minimize()');
                await wait(1200);
                const before = await snapshot();
                const start = await metrics();
                await wait(3000);
                const end = await metrics();
                const after = await snapshot();
                assert.equal(after.paused, state === 'paused');
                assert.ok(state === 'paused' ? Math.abs(after.time - before.time) < .1 : after.time - before.time > 2.5, 'Authoritative audio clock');
                assert.equal(after.policy.active, low);
                assert.equal(after.policy.hidden, low && state === 'hidden');
                if (low && state === 'hidden') {
                    if (before.stageFrames !== undefined) assert.equal(after.stageFrames, before.stageFrames, 'Hidden MineRadio GPU draws stop');
                    assert.deepEqual(after.shaderFrames, before.shaderFrames, 'Hidden shader clocks stop');
                }
                const seconds = (end.at - start.at) / 1000;
                const processCpu = end.processes.map(process => {
                    const first = start.processes.find(p => p.pid === process.pid && p.creationTime === process.creationTime);
                    assert.ok(first, 'No process restarted during a sample');
                    return { type: process.type, percent: (process.cpu.cumulativeCPUUsage - first.cpu.cumulativeCPUUsage) / seconds * 100, workingSetKiB: process.memory.workingSetSize };
                });
                const intervals = after.intervals.slice(before.intervals.length).sort((a,b) => a-b);
                const result = {name,state,run,low,seconds,cpu:processCpu.reduce((n,p)=>n+p.percent,0),processCpu,
                    frames:after.raf-before.raf,p95FrameMs:intervals[Math.floor(intervals.length*.95)] ?? null,before,after};
                results.push(result);
                await windowAction('w.restore(); w.show()');
                await wait(250);
                if (background === 'MineRadio') {
                    const restored = await snapshot();
                    assert.ok(Math.abs(restored.stageTime-restored.time) < .7, 'Scene resumes at the live audio position');
                    if (!baseline) assert.equal(restored.stageLow, low);
                }
                console.log(JSON.stringify({name,state,run,low,cpu:result.cpu,frames:result.frames,points:after.points,pixels:after.shaderPixels}));
            }
        }
    }
} finally {
    await windowAction('w.restore(); w.show()');
    await evaluate(() => {cancelAnimationFrame(window.lowPowerRaf); return true;});
    fs.mkdirSync('test-results/low-power', {recursive:true});
    fs.writeFileSync(`test-results/low-power/${baseline ? 'baseline' : 'feature'}.json`, JSON.stringify({environment,status,results},null,2));
}
console.log('PASS: repeated production resource comparisons, audio clock, visibility policy and live restore.');
