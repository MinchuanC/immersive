import assert from 'node:assert/strict';
import fs from 'node:fs';

// Run after localPlaybackSmoke: generated music only, in the isolated driver profile.
const command = async (cmd, ...args) => {
    const reply = await fetch('http://127.0.0.1:9230', { method: 'POST', body: JSON.stringify({ cmd, args }), signal: AbortSignal.timeout(60000) }).then(response => response.json());
    assert.equal(reply.ok, true, reply.error);
    return reply.output;
};
const evaluate = async (fn, ...args) => JSON.parse(await command('eval', `(${fn})(...${JSON.stringify(args)})`));
const status = JSON.parse(await command('status'));
assert.ok(status.profile.endsWith('/test-results/run-desktop/userdata'));
assert.equal(await evaluate(() => ({ paused: Array.from(document.querySelectorAll('audio')).every(audio => audio.paused) })).then(value => value.paused), true);
await command('click', '.mineradio-dock #progress-bar');
await command('press', 'Home');
await command('click', '.mineradio-dock #play-btn[aria-label="Play"]');
const sampled = await evaluate(async () => {
    const stage = document.querySelector('iframe[title="MineRadio visual stage"]')?.contentWindow;
    if (!stage) throw Error('Visual stage missing');
    const rows = [];
    const dock = document.querySelector('.mineradio-dock #bottom-bar').getBoundingClientRect();
    const accent = document.querySelector('.mineradio-dock-accent');
    const start = performance.now();
    await new Promise(resolve => {
        function sample(at) {
            const audio = Array.from(document.querySelectorAll('audio')).find(item => !item.paused);
            const signal = stage.stageSnapshot?.audio;
            rows.push({ time: audio?.currentTime, beat: signal?.beat ?? 0, energy: signal?.energy ?? 0, regions: signal?.regions ?? [], camera: stage.camera.position.toArray(), accentOpacity: Number(getComputedStyle(accent).opacity) });
            if (at - start < 11500) requestAnimationFrame(sample); else resolve();
        }
        requestAnimationFrame(sample);
    });
    const end = document.querySelector('.mineradio-dock #bottom-bar').getBoundingClientRect();
    return { rows, accentPointerEvents: getComputedStyle(accent).pointerEvents, accentHidden: accent.getAttribute('aria-hidden'), dockMovement: Math.max(Math.abs(end.x - dock.x), Math.abs(end.y - dock.y), Math.abs(end.width - dock.width), Math.abs(end.height - dock.height)) };
});
await command('ss', 'verified-music-reactivity-playing');
await command('click', '.mineradio-dock #play-btn[aria-label="Pause"]');
fs.writeFileSync('test-results/run-desktop/music-reactivity-samples.json', JSON.stringify(sampled));
const attacks = [.8, 1.37, 2.19, 2.91, 4.08, 4.73, 5.51, 6.82, 7.49, 8.33, 9.61, 10.29];
const accents = attacks.map(time => {
    const candidates = sampled.rows.filter(row => row.time >= time && row.time <= time + .3);
    const peak = candidates.reduce((best, row) => row.beat > (best?.beat ?? -1) ? row : best, null);
    const response = candidates.find(row => row.beat > .1);
    return peak && { attack: time, responseDelayMs: response ? Math.round((response.time - time) * 1000) : null, beat: peak.beat, region: peak.regions.indexOf(Math.max(...peak.regions)) };
}).filter(value => value?.beat > .1);
assert.ok(accents.length >= 8, `Too few audible attacks detected: ${JSON.stringify(accents)}`);
assert.ok(new Set(accents.map(value => value.region)).size > 3, `Accents remained in one region: ${JSON.stringify(accents)}`);
assert.ok(sampled.rows.every(row => row.regions.length === 16 && row.regions.every(value => value >= 0 && value <= 1)), 'Spatial response must stay bounded');
assert.ok(sampled.rows.some(row => row.energy > .01), 'Actual local audio must reach the stage');
assert.ok(sampled.dockMovement < .5, 'Music must not move or resize the dock');
assert.equal(sampled.accentPointerEvents, 'none');
assert.equal(sampled.accentHidden, 'true');
assert.ok(sampled.rows.some(row => row.accentOpacity > .001), 'The local decorative line must receive actual energy');
const maxCameraStep = Math.max(...sampled.rows.slice(1).map((row, index) => Math.hypot(...row.camera.map((value, axis) => value - sampled.rows[index].camera[axis]))));
assert.ok(maxCameraStep < .05, `Music moved the camera: ${maxCameraStep}`);
const settled = await evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 850));
    const stage = document.querySelector('iframe[title="MineRadio visual stage"]')?.contentWindow;
    return { paused: stage.stageSnapshot.paused, available: stage.stageSnapshot.audio.available, beat: stage.stageSnapshot.audio.beat, regions: stage.stageSnapshot.audio.regions };
});
assert.equal(settled.paused, true);
assert.equal(settled.available, false);
assert.equal(settled.beat, 0);
await command('ss', 'verified-music-reactivity');
console.log(JSON.stringify({ result: 'PASS', fixture: 'irregular 65Hz attacks at three strengths', frames: sampled.rows.length, accents, regionsVisited: new Set(accents.map(value => value.region)).size, dockMovement: sampled.dockMovement, maxCameraStep, accentPointerEvents: sampled.accentPointerEvents, maxAccentOpacity: Math.max(...sampled.rows.map(row => row.accentOpacity)), pausedAudioAvailable: settled.available }, null, 2));
