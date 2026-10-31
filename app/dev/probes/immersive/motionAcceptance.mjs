import assert from 'node:assert/strict';

// Follow the local fixture smoke with real pointer/keyboard and renderer acceptance checks.
const command = async (cmd, ...args) => {
    const result = await fetch('http://127.0.0.1:9230', { method: 'POST', body: JSON.stringify({ cmd, args }) }).then(response => response.json());
    assert.equal(result.ok, true, result.error);
    return result.output;
};
const evaluate = async fn => JSON.parse(await command('eval', `(${fn})()`));
const until = async fn => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) { if (await evaluate(fn)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error(`Timed out: ${fn}`);
};
const status = JSON.parse(await command('status'));
assert.ok(status.profile.endsWith('/test-results/run-desktop/userdata'));
assert.equal(await evaluate(() => document.querySelector('#control-title')?.textContent === 'Blue Hour'), true);
await command('click', '#control-title');
await until(() => document.querySelectorAll('iframe[title="MineRadio visual stage"]').length === 1);
const playing = await evaluate(() => [...document.querySelectorAll('audio')].some(audio => !audio.paused));
if (playing) { await command('click', '#play-btn'); await until(() => [...document.querySelectorAll('audio')].every(audio => audio.paused)); }
await command('frame-click', 'iframe[title="MineRadio visual stage"]', '#canvas-container canvas');
await command('press', 'Space');
await until(() => [...document.querySelectorAll('audio')].some(audio => !audio.paused));
const pacing = await evaluate(async () => {
    const intervals = [], longTasks = [];
    const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration)));
    observer.observe({ entryTypes: ['longtask'] });
    const start = performance.now(); let previous = start;
    await new Promise(resolve => { function sample(time) { intervals.push(time - previous); previous = time; if (time - start < 6000) requestAnimationFrame(sample); else resolve(); } requestAnimationFrame(sample); });
    observer.disconnect(); intervals.shift(); intervals.sort((a, b) => a - b);
    return { frames: intervals.length, median: intervals[Math.floor(intervals.length * .5)], p95: intervals[Math.floor(intervals.length * .95)], over25ms: intervals.filter(value => value > 25).length, longTasks };
});
assert.ok(pacing.frames > 250 && pacing.p95 < 25, JSON.stringify(pacing));
await command('press', 'Space');
await until(() => [...document.querySelectorAll('audio')].every(audio => audio.paused));
await command('click', '.mineradio-dock button[aria-label="Visual console"]');
await command('frame-click', 'iframe[title="MineRadio visual stage"]', '[data-fx-tab="lyrics"]');
await command('frame-click', 'iframe[title="MineRadio visual stage"]', '[data-renderer="mineradio"]');
await until(() => document.querySelectorAll('iframe[title="MineRadio visual stage"]').length === 1 && document.querySelector('iframe')?.contentWindow.stageSnapshot?.showLyrics && !!document.querySelector('iframe')?.contentWindow.stageLyrics?.current);
await evaluate(async () => {
    const { usePlaybackStore } = await import('/src/stores/usePlaybackStore.ts');
    window.__qaTimedLyrics = usePlaybackStore.getState().lyrics;
    usePlaybackStore.setState({ lyrics: { lines: [], plainText: 'Fixture plain lyrics remain readable.\nNo timing is invented.' } });
    return true;
});
await until(() => document.body.innerText.includes('Fixture plain lyrics remain readable.') && document.querySelectorAll('iframe[title="MineRadio visual stage"]').length === 1);
await command('ss', 'verified-plain-lyrics-scene');
await evaluate(async () => { const { usePlaybackStore } = await import('/src/stores/usePlaybackStore.ts'); usePlaybackStore.setState({ lyrics: window.__qaTimedLyrics }); delete window.__qaTimedLyrics; return true; });
await until(() => !!document.querySelector('iframe')?.contentWindow.stageLyrics?.current);
await command('ss', 'verified-motion-player');
console.log(JSON.stringify({ result: 'PASS', focusAfterCanvas: 'Space plays and pauses actual local audio', donorLyrics: 'one scene with timed lyrics', plainLyrics: 'static text and graphics retained', pacing }, null, 2));
