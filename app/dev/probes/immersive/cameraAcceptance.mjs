import assert from 'node:assert/strict';
import path from 'node:path';

// Check camera continuity and settings writeback in the running isolated desktop fixture.
const profile = path.resolve('test-results/run-desktop/userdata');
const sample = async () => {
    const stage = document.querySelector('iframe[title="MineRadio visual stage"]')?.contentWindow;
    if (!stage) throw new Error('Visual stage is not mounted');
    return stage.eval(`(${async function () {
        const samples = [];
        let cameraWrites = 0;
        const receive = event => {
            if (event.data?.type === 'command' && event.data.action === 'settings' && event.data.value.cameraStateJson) cameraWrites++;
        };
        parent.addEventListener('message', receive);
        try {
            const started = performance.now();
            await new Promise(resolve => {
                function frame(at) {
                    samples.push({ at, position: camera.position.toArray(), rotation: camera.quaternion.toArray(), viewport: stageViewportRevision });
                    if (at - started < 4000) requestAnimationFrame(frame);
                    else resolve();
                }
                requestAnimationFrame(frame);
            });
            const steps = samples.slice(1).map((value, index) => ({
                interval: value.at - samples[index].at,
                distance: Math.hypot(...value.position.map((coordinate, axis) => coordinate - samples[index].position[axis])),
                angle: 2 * Math.acos(Math.min(1, Math.abs(value.rotation.reduce((sum, coordinate, axis) => sum + coordinate * samples[index].rotation[axis], 0)))),
            }));
            const intervals = steps.map(value => value.interval).sort((a, b) => a - b);
            return { preset: fx.preset, savedCamera: JSON.parse(fx.cameraStateJson || '{}').cameraViewSaved === true, frames: samples.length, p95ms: intervals[Math.floor(intervals.length * .95)], maxCameraStep: Math.max(...steps.map(value => value.distance)), maxAngle: Math.max(...steps.map(value => value.angle)), cameraWrites, viewportChanges: new Set(samples.map(value => value.viewport)).size, navigation: parent.performance.getEntriesByType('navigation')[0]?.type };
        } finally { parent.removeEventListener('message', receive); }
    }})()`);
};
const expression = `(() => {
    if (electron.app.getPath('userData') !== ${JSON.stringify(profile)}) throw new Error('Not the isolated test profile');
    const window = electron.BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith('file:') || window.webContents.getURL().startsWith('http://localhost:3000'));
    return window.webContents.executeJavaScript(${JSON.stringify(`(${sample})()`)});
})()`;
const reply = await fetch('http://127.0.0.1:9230', { method: 'POST', body: JSON.stringify({ cmd: 'main-eval', args: [expression] }) }).then(response => response.json());
assert.equal(reply.ok, true, reply.error);
const result = JSON.parse(reply.output);
if (process.argv.includes('--cold')) {
    assert.equal(result.navigation, 'navigate', 'Cold-launch acceptance must use the initial renderer');
    assert.equal(result.savedCamera, true, 'Cold-launch acceptance must restore a previously saved camera');
}
assert.ok(result.frames > 100, 'The animation must remain active during sampling');
assert.equal(result.cameraWrites, 0, 'Idle/restored cameras must not keep writing settings');
assert.equal(result.viewportChanges, 1, 'Window geometry must remain stable during sampling');
assert.ok(result.maxCameraStep < .05 && result.maxAngle < .005, `Camera jumped: ${JSON.stringify(result)}`);
console.log(JSON.stringify({ result: 'PASS', ...result }, null, 2));
