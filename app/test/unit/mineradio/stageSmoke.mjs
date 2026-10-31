import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Browser-only verification of the extracted graphics realm, without starting another player.
const publicRoot = fileURLToPath(new URL('../../../public/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
    const file = path.resolve(publicRoot, '.' + pathname);
    if (!file.startsWith(publicRoot) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const chrome = process.env.BROWSER_PATH || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', chromium.executablePath()].find(file => fs.existsSync(file));
let browser;
try {
    browser = await chromium.launch({ headless: true, executablePath: chrome });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack));
    page.on('console', message => { if (message.type() === 'error' && message.text().includes('THREE.WebGLProgram')) errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${port}/mineradio/stage.html?session=smoke`);
    assert.equal(await page.locator('#fx-lyrictranslationscale').count(), 1, 'The original translation-size control must be initialized');
    assert.equal(await page.locator('#fx-lyrictranslationopacity').count(), 1, 'The original translation-opacity control must be initialized');
    await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
        const context = canvas.getContext('2d'); context.fillStyle = '#75451e'; context.fillRect(0, 0, 64, 64);
        const cover = canvas.toDataURL();
        window.__immersiveStage.applyFrame({
            currentTime: 5, lyricTime: 5, duration: 180, paused: false,
            metadata: { title: 'Renderer test fixture', artist: 'Shared Folia state', coverUrl: cover },
            audio: { available: false, spectrum: [] },
            lyrics: [{ fullText: 'One shared clock', startTime: 0, endTime: 30, words: [] }],
            wordTiming: false, showLyrics: true, showControls: false,
            collections: [{ id: 'local', name: 'Local library', trackCount: 1, cover, tracks: [{ id: 'test-track', title: 'Renderer test fixture', artist: 'Shared Folia state', cover }] }],
            queue: [{ id: 'test-track', title: 'Renderer test fixture', cover }],
        });
    });
    const musicResponse = await page.evaluate(async () => {
        setPreset(12, { noSave: true, silent: true, skipTransition: true });
        stageApplyFrame({ ...stageSnapshot, metadata: { ...stageSnapshot.metadata, trackKey: 'local:fixture:revision-a' }, paused: false, reducedMotion: false, audio: { available: true, bass: .5, mid: .3, treble: .2, energy: .4, beat: .7, regions: [1, ...Array(15).fill(0)], spectrum: [80, 40, 10] } });
        await new Promise(resolve => setTimeout(resolve, 180));
        const first = uniforms.uMusicRegions ? Array.from(uniforms.uMusicRegions.value) : [];
        stageApplyFrame({ ...stageSnapshot, audio: { ...stageSnapshot.audio, regions: [...Array(8).fill(0), 1, ...Array(7).fill(0)] } });
        await new Promise(resolve => setTimeout(resolve, 180));
        const second = uniforms.uMusicRegions ? Array.from(uniforms.uMusicRegions.value) : [];
        const target = new THREE.WebGLRenderTarget(160, 100);
        const firstPixels = new Uint8Array(160 * 100 * 4), secondPixels = new Uint8Array(firstPixels.length);
        renderer.setRenderTarget(target);
        uniforms.uMusicRegions.value.fill(0); uniforms.uMusicRegions.value[0] = 1;
        renderer.render(scene, camera); renderer.readRenderTargetPixels(target, 0, 0, 160, 100, firstPixels);
        uniforms.uMusicRegions.value.fill(0); uniforms.uMusicRegions.value[8] = 1;
        renderer.render(scene, camera); renderer.readRenderTargetPixels(target, 0, 0, 160, 100, secondPixels);
        const changedPixels = firstPixels.reduce((count, value, index) => count + (Math.abs(value - secondPixels[index]) > 2 ? 1 : 0), 0);
        renderer.setRenderTarget(null); target.dispose();
        stageApplyFrame({ ...stageSnapshot, currentTime: stageClockAt + (performance.now() - stageReceivedAt) / 1000,
            metadata: { ...stageSnapshot.metadata, trackKey: 'local:fixture:revision-b' },
            audio: { ...stageSnapshot.audio, beat: 0, regions: Array(16).fill(0) } });
        const sourceBeat = stageAudioHeld.beat, sourceRegions = Array.from(uniforms.uMusicRegions.value);
        stageAudioHeld.beat = .7; uniforms.uMusicRegions.value[0] = .9;
        stageApplyFrame({ ...stageSnapshot, currentTime: 50, audio: { ...stageSnapshot.audio, beat: 0, regions: Array(16).fill(0) } });
        const seekBeat = stageAudioHeld.beat, seekRegions = Array.from(uniforms.uMusicRegions.value);
        stageApplyFrame({ ...stageSnapshot, currentTime: 80, audio: { available: false, bass: .9, energy: .9, beat: 1, regions: Array(16).fill(1), spectrum: [255] } });
        await new Promise(resolve => setTimeout(resolve, 750));
        const ambientBefore = { time: uniforms.uTime.value, activity: uniforms.uAmbientActivity?.value, bass, mid, treble, beat: beatPulse, energy: audioEnergy, spectrum: Array.from(frequencyData) };
        stageApplyFrame({ ...stageSnapshot, currentTime: 2 });
        await new Promise(resolve => setTimeout(resolve, 120));
        const afterSeek = uniforms.uTime.value;
        stageApplyFrame({ ...stageSnapshot, paused: true });
        await new Promise(resolve => setTimeout(resolve, 750));
        return { first, second, changedPixels, sourceBeat, sourceRegions, seekBeat, seekRegions, ambientBefore, afterSeek, pausedActivity: uniforms.uAmbientActivity?.value, regions: uniforms.uMusicRegions ? Array.from(uniforms.uMusicRegions.value) : [] };
    });
    assert.ok(musicResponse.first[0] > .8 && musicResponse.first[8] < .01, 'Host regions reach the rendered sculpture');
    assert.ok(musicResponse.second[8] > .8 && musicResponse.second[0] < .3, 'The accent moves to the newly supplied region');
    assert.ok(musicResponse.changedPixels > 20, 'Changing only the spatial region changes actual rendered pixels');
    assert.equal(musicResponse.sourceBeat, 0, 'A source-key-only handoff clears the previous visual attack');
    assert.ok(musicResponse.sourceRegions.every(value => value === 0), 'A source-key-only handoff clears the previous spatial peaks');
    assert.equal(musicResponse.seekBeat, 0, 'Seeking clears the previous visual attack');
    assert.ok(musicResponse.seekRegions.every(value => value === 0), 'Seeking clears the previous spatial peaks');
    assert.ok(musicResponse.ambientBefore.activity > .9, 'Unavailable audio gets a separate playback-aware ambient layer');
    for (const key of ['bass', 'mid', 'treble', 'beat', 'energy']) assert.equal(musicResponse.ambientBefore[key], 0, 'Ambient playback keeps audio fields zero');
    assert.deepEqual(musicResponse.ambientBefore.spectrum, []);
    assert.ok(musicResponse.afterSeek > musicResponse.ambientBefore.time, 'A media seek cannot rewind the visual clock');
    assert.ok(musicResponse.pausedActivity < .02, 'Pause settles ambience within about 700 ms');
    assert.ok(musicResponse.regions.every(value => value === 0), 'Unavailable analysis clears regional accents');
    for (let preset = 0; preset < 13; preset++) {
        await page.evaluate(value => setPreset(value, { noSave: true, silent: true }), preset);
        await page.waitForTimeout(preset === 6 || preset === 8 ? 600 : 100);
        assert.equal(await page.evaluate(() => fx.preset), preset);
    }
    const restoredCamera = await page.evaluate(async () => {
        const commands = [];
        const receive = event => {
            if (event.data?.type === 'command' && event.data.action === 'settings') commands.push(event.data.value);
        };
        window.addEventListener('message', receive);
        try {
            const saved = { ...captureCameraArchiveState(), cameraOrbitTheta: .35, cameraOrbitPhi: .22, cameraOrbitRadius: 8 };
            stageApplyFrame({ ...stageSnapshot, settings: { preset: 9, cameraStateJson: JSON.stringify(saved) } });
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            return { commands, theta: orbit.userTheta, phi: orbit.userPhi, radius: orbit.userRadius };
        } finally { window.removeEventListener('message', receive); }
    });
    assert.deepEqual(restoredCamera.commands, [], 'Restoring a saved camera must not write its previous pose back to the host');
    assert.equal(restoredCamera.theta, .35, 'Saved camera survives a simultaneous preset change');
    assert.equal(restoredCamera.phi, .22);
    assert.equal(restoredCamera.radius, 8);
    const cameraAfterSceneChange = await page.evaluate(() => {
        stageApplyFrame({ ...stageSnapshot, settings: { ...stageSnapshot.settings, preset: 10 } });
        return { theta: orbit.userTheta, phi: orbit.userPhi, radius: orbit.userRadius };
    });
    assert.deepEqual(cameraAfterSceneChange, { theta: .35, phi: .22, radius: 8 }, 'A host scene change must preserve the saved camera');
    const cameraEcho = await page.evaluate(() => {
        freeCamera.active = true;
        freeCamera.locked = false;
        saveFreeCameraState();
        stageApplyFrame({ ...stageSnapshot, settings: { ...stageSnapshot.settings, cameraStateJson: fx.cameraStateJson } });
        const active = freeCamera.active;
        freeCamera.active = false;
        freeCamera.locked = false;
        return active;
    });
    assert.equal(cameraEcho, true, 'Echoing a user camera save must not reset active free-camera controls');
    await page.evaluate(() => setPreset(12, { noSave: true, silent: true }));
    assert.equal(await page.locator('#fx-fab').isVisible(), false, 'Host-owned controls hide the redundant stage FAB');
    assert.equal(await page.locator('#fx-fab-hide-btn').isVisible(), false);
    for (const selector of ['#fx-console-tab-home', '#fx-lyrictranslationscale']) {
        await page.evaluate(() => toggleFxPanel(true));
        await page.locator(selector).evaluate(element => element.focus());
        const protectedKey = await page.locator(selector).evaluate(element => {
            const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
            element.dispatchEvent(event);
            return event.defaultPrevented;
        });
        assert.equal(protectedKey, false, 'Console controls retain ordinary keyboard input');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#fx-panel').evaluate(element => element.classList.contains('show') || element.classList.contains('peek')), false, 'Escape closes the console from a focused control');
    }
    await page.evaluate(() => toggleFxPanel());
    for (const tab of ['home', 'interface', 'lyrics', 'motion', 'shelf', 'system']) await page.locator(`[data-fx-tab="${tab}"]`).click();
    await page.evaluate(() => stageApplyFrame({ ...stageSnapshot, lyricRenderer: 'mineradio' }));
    await page.locator('[data-fx-tab="lyrics"]').click();
    await page.locator('[data-fx-page="lyrics"] [data-fx-console-group="colors"] .fx-fold-head').click();
    const glowToggle = page.locator('#t-lyricGlow');
    assert.equal(await glowToggle.getAttribute('role'), 'switch');
    await glowToggle.evaluate(element => { element.previousElementSibling?.focus(); element.focus(); });
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    assert.equal(await glowToggle.evaluate(element => document.activeElement === element), true, 'Enabled toggles participate in Tab order');
    for (const key of ['Space', 'Enter']) {
        const before = await page.evaluate(() => fx.lyricGlow);
        await page.keyboard.press(key);
        assert.equal(await page.evaluate(() => fx.lyricGlow), !before, key + ' toggles the actual setting');
        assert.equal(await glowToggle.getAttribute('aria-checked'), String(!before));
    }
    const disabledToggle = page.locator('#t-desktopLyrics');
    assert.equal(await disabledToggle.getAttribute('aria-disabled'), 'true');
    assert.equal(await disabledToggle.evaluate(element => element.tabIndex), -1);
    await page.evaluate(() => stageApplyFrame({ ...stageSnapshot, settings: { lyricGlow: false } }));
    assert.equal(await glowToggle.getAttribute('aria-checked'), 'false', 'Host updates synchronize accessible state');
    await page.locator('#lyric-display-mode-seg [data-mode="single"]').click();
    assert.equal(await page.locator('#lyric-display-mode-seg [data-mode="single"]').evaluate(element => element.classList.contains('active')), true);
    await page.locator('[data-fx-page="lyrics"] [data-fx-console-group="motion"] .fx-fold-head').click();
    await page.locator('#lyric-motion-style-seg [data-motion="glitch"]').click();
    assert.equal(await page.locator('#lyric-glitch-camera-bind').isEnabled(), true);
    await page.locator('#lyric-motion-style-seg [data-motion="float"]').click();
    const clockWork = await page.evaluate(() => {
        const stringify = JSON.stringify;
        let serializations = 0;
        JSON.stringify = function (...args) { serializations++; return stringify.apply(JSON, args); };
        try {
            const patch = { currentTime: 5.1, lyricTime: 5.1, audio: { available: false, spectrum: [] } };
            stageApplyFrame({ ...stageSnapshot, ...patch }, patch);
            return serializations;
        } finally { JSON.stringify = stringify; }
    });
    assert.equal(clockWork, 0, 'Clock packets must not serialize settings, lyrics or the library again');
    const controls = await page.evaluate(async () => {
        const cameras = [];
        const receive = event => {
            if (event.data?.type === 'command' && event.data.action === 'settings' && event.data.value.cameraStateJson) cameras.push(JSON.parse(event.data.value.cameraStateJson));
        };
        window.addEventListener('message', receive);
        try {
            createUserFxArchive(); saveUserFxArchive(0); setPreset(9, { noSave: true }); applyUserFxArchive(0);
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            return { preset: fx.preset, presets: presetMeta.length, shelfCards: shelfManager.getCards().length, lineProgress: getLyricLineProgress(lyricsLines[0], null, 5), audio: Array.from(frequencyData), cameras, camera: captureCameraArchiveState() };
        } finally { window.removeEventListener('message', receive); }
    });
    assert.equal(controls.preset, 12);
    assert.equal(controls.presets, 13);
    assert.equal(controls.shelfCards, 1);
    assert.equal(controls.lineProgress, 0);
    assert.deepEqual(controls.audio, []);
    assert.ok(controls.cameras.length > 0, 'Applying a user archive persists its camera');
    assert.ok(controls.cameras.every(camera => camera.cameraOrbitTheta === controls.camera.cameraOrbitTheta && camera.cameraOrbitPhi === controls.camera.cameraOrbitPhi && camera.cameraOrbitRadius === controls.camera.cameraOrbitRadius), 'Archive settings publish the restored pose, never the previous pose');
    const startOnly = await page.evaluate(() => {
        const line = stageTranslateLyrics([{ fullText: 'One two', startTime: 1, endTime: 4, words: [{ text: 'One', startTime: 1, endTime: 1 }, { text: 'two', startTime: 2, endTime: 2 }] }], true)[0];
        lyricsHasNativeKaraoke = true;
        return { durations: line.words.map(word => word.d), before: getLyricLineProgress(line, null, .5), atStart: getLyricLineProgress(line, null, 1), between: getLyricLineProgress(line, null, 1.5), after: getLyricLineProgress(line, null, 2) };
    });
    assert.deepEqual(startOnly.durations, [0, 0]);
    assert.equal(startOnly.before, 0);
    assert.equal(startOnly.atStart, startOnly.between);
    assert.ok(startOnly.atStart > 0 && startOnly.atStart < 1);
    assert.equal(startOnly.after, 1);
    const cameraRates = await page.evaluate(() => {
        function run(fps) {
            freeCamera.active = false; freeCamera.locked = false;
            orbit.centerLocked = false; orbit.recentering = false; orbit.focus.active = false; orbit.focus.type = null;
            orbit.userTheta = .7; orbit.userPhi = .1; orbit.userRadius = 7;
            orbit.theta = 0; orbit.phi = 0; orbit.radius = 6.6;
            orbit.cineTheta = orbit.cinePhi = orbit.cineRadius = 0; orbit.lookAt.set(0, 0, 0);
            beatCam.punch = beatCam.radiusKick = camPunch = 0; camera.fov = 38;
            for (let index = 0; index < fps / 2; index++) updateCamera(1 / fps);
            const pose = [orbit.theta, orbit.phi, orbit.radius, camera.fov];
            camPunch = .5;
            for (let index = 0; index < fps / 2; index++) updateCamera(1 / fps);
            return { pose, punch: camPunch };
        }
        return [run(60), run(120)];
    });
    cameraRates[0].pose.forEach((value, index) => assert.ok(Math.abs(value - cameraRates[1].pose[index]) < 1e-8, 'Camera response must follow elapsed time'));
    assert.ok(Math.abs(cameraRates[0].punch - cameraRates[1].punch) < 1e-8);
    await page.evaluate(() => stageApplyFrame({ ...stageSnapshot, currentTime: 12, paused: true, reducedMotion: true,
        showLyrics: false, settings: { preset: 7 }, directionRevision: 901,
        direction: { intensity: .8, sonicGroundAmplitude: 50, sonicGroundMotionSpeed: 50, sonicGroundGlow: 20 },
    }));
    const terrainTime = () => page.evaluate(() => {
        let time = null;
        scene.getObjectByName('sonic-topography-root')?.traverse(node => {
            if (node.material?.uniforms?.uAmplitude) time = node.material.uniforms.uTime.value;
        });
        return time;
    });
    await page.waitForTimeout(120);
    const directedTime = await terrainTime();
    assert.ok(Math.abs(directedTime - 15.6) < 1e-8, 'Score phase must follow the authoritative playback position');
    await page.evaluate(() => stageApplyFrame({ ...stageSnapshot, currentTime: 0 }, { currentTime: 0, direction: stageSnapshot.direction }));
    await page.waitForTimeout(120);
    assert.equal(await terrainTime(), 0, 'Seeking a score to zero must not fall back to wall-clock phase');
    await page.evaluate(() => stageApplyFrame({ ...stageSnapshot, currentTime: 12 }, { currentTime: 12, direction: stageSnapshot.direction }));
    await page.waitForTimeout(120);
    assert.equal(await terrainTime(), directedTime, 'Returning to a score position must restore its terrain phase');
    const staticScoreFrame = await page.evaluate(() => renderer.info.render.frame);
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(() => renderer.info.render.frame), staticScoreFrame, 'A reduced-motion score must remain still between composition changes');
    await page.evaluate(() => stageApplyFrame({ ...stageSnapshot, direction: null }));
    await page.evaluate(() => {
        particleSpin.vy = 3;
        stageApplyFrame({ ...stageSnapshot, reducedMotion: true, showLyrics: false, settings: { preset: 6 } });
    });
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => skullParticleGroup?.visible), true, 'Static presets must still compose loaded graphics');
    const frozen = await page.evaluate(() => ({ time: uniforms.uTime.value, camera: camera.position.toArray(), rotation: particles.rotation.toArray(), spin: particleSpin.vy, shelf: shelfManager.getCards()[0].mesh.position.toArray() }));
    await page.evaluate(() => stageApplyFrame({ ...stageSnapshot, currentTime: 10, audio: { available: true, bass: .9, mid: .5, treble: .3, energy: .6, spectrum: [] } }, { currentTime: 10, audio: {} }));
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => ({ time: uniforms.uTime.value, camera: camera.position.toArray(), rotation: particles.rotation.toArray(), spin: particleSpin.vy, shelf: shelfManager.getCards()[0].mesh.position.toArray() })), frozen);
    await page.evaluate(() => stageApplyFrame({ ...stageSnapshot, currentTime: 1, lyricTime: 1, paused: true,
        reducedMotion: true, showLyrics: true, lyricRenderer: 'mineradio', wordTiming: true,
        settings: { preset: 12, lyricDisplayMode: 'single' },
        lyrics: [
            { fullText: 'One two', startTime: 0, endTime: 3, timingGranularity: 'word', words: [{ text: 'One', startTime: 0, endTime: 0 }, { text: 'two', startTime: 2, endTime: 2 }] },
            { fullText: 'Next line', startTime: 3, endTime: 6, timingGranularity: 'line', words: [{ text: 'Next line', startTime: 3, endTime: 3 }] },
        ],
    }));
    await page.waitForFunction(() => stageLyrics.currentIdx === 0 && !!stageLyrics.current);
    const staticLyricPose = await page.evaluate(() => ({ time: uniforms.uTime.value, camera: camera.position.toArray(), rotation: particles.rotation.toArray() }));
    const firstWordProgress = await page.evaluate(() => stageLyrics.current.userData.lastLyricProgress);
    assert.ok(firstWordProgress > 0 && firstWordProgress < 1, 'Start-only words must retain their real discrete cue in reduced motion');
    await page.evaluate(() => stageApplyFrame({ ...stageSnapshot, currentTime: 2.1, lyricTime: 2.1 }, { currentTime: 2.1, lyricTime: 2.1 }));
    await page.waitForFunction(() => stageLyrics.current?.userData.lastLyricProgress === 1);
    await page.evaluate(() => stageApplyFrame({ ...stageSnapshot, currentTime: 3.1, lyricTime: 3.1 }, { currentTime: 3.1, lyricTime: 3.1 }));
    await page.waitForFunction(() => stageLyrics.currentIdx === 1 && !!stageLyrics.current);
    assert.equal(await page.evaluate(() => lyricsLines[1].words.length), 0, 'Mixed line-only timing must stay line-only');
    assert.deepEqual(await page.evaluate(() => ({ time: uniforms.uTime.value, camera: camera.position.toArray(), rotation: particles.rotation.toArray() })), staticLyricPose);
    await page.evaluate(() => { stageApplyFrame({ ...stageSnapshot, reducedMotion: false, paused: true, settings: { preset: 12 } }); clearStageLyrics(); });
    await page.waitForFunction(() => stageLyrics.currentIdx === 1 && !!stageLyrics.current);
    await page.evaluate(() => stageApplyFrame({ ...stageSnapshot, reducedMotion: false, settings: { preset: 12 } }));
    await page.evaluate(() => { toggleFxPanel(false); shelfManager.openContent(0); });
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => shelfManager.hasOpenContent()), true);
    assert.deepEqual(errors, []);
    const cleanup = await page.evaluate(() => {
        __immersiveStage.dispose();
        return { disposed: stageDisposed, frames: stageRafs.size, timers: stageTimers.size, listeners: stageListeners.length, contextLost: renderer.getContext().isContextLost() };
    });
    assert.deepEqual(cleanup, { disposed: true, frames: 0, timers: 0, listeners: 0, contextLost: true });
    console.log('MineRadio browser smoke passed: 13 presets, 6 console tabs, archive restore, 3D shelf/detail, honest line timing, silent analysis, GPU/RAF/timer/listener cleanup.');
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
