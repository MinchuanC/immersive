import assert from 'node:assert/strict';

// Run after localPlaybackSmoke: generated music and an isolated driver profile only.
const command = async (cmd, ...args) => {
    const result = await fetch('http://127.0.0.1:9230', { method: 'POST', body: JSON.stringify({ cmd, args }), signal: AbortSignal.timeout(60000) }).then(response => response.json());
    assert.equal(result.ok, true, result.error);
    return result.output;
};
const evaluate = async (fn, ...args) => JSON.parse(await command('eval', `(${fn})(...${JSON.stringify(args)})`));
const until = async (fn, ...args) => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        const result = await evaluate(fn, ...args);
        if (result) return result;
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error(`Timed out: ${fn}`);
};
const panel = () => !!document.querySelector('[role=dialog]')?.textContent.includes('Listening experience');
const text = () => document.querySelector('[role=dialog]')?.textContent ?? '';
const open = async () => { if (!await evaluate(panel)) await command('click', '[data-immersion-open]'); };
const close = async () => { if (await evaluate(panel)) await command('click-text', 'Done'); };
const status = JSON.parse(await command('status'));
assert.ok(status.profile.endsWith('/test-results/run-desktop/userdata'));
await close();
await evaluate(async () => {
    const { appDatabase } = await import('/src/services/appDatabase.ts');
    const { applyManualMetadata } = await import('/src/services/localLibraryCatalogService.ts');
    const songs = await appDatabase.local_music.toArray();
    if (songs.length !== 2 || !songs.every(song => ['Afterglow', 'Blue Hour'].includes(song.title))) throw new Error('Run localPlaybackSmoke first');
    for (const [index, song] of songs.entries()) {
        await applyManualMetadata(song.id, ['Immersive fixture'], 'Evening Chapters');
        await appDatabase.local_music.update(song.id, { trackNumber: index + 1, discNumber: 1 });
    }
    await appDatabase.personal_editions.clear();
    window.dispatchEvent(new CustomEvent('folia-local-music-updated'));
    return true;
});
await open();
await until(() => document.querySelector('[role=dialog]')?.textContent.includes('Evening Chapters'));
if (!await evaluate(() => Array.from(document.querySelectorAll('[role=dialog] button')).find(button => button.textContent.includes('Start Song Score'))?.disabled)) await command('click-text', 'Start Song Score');
await until(() => document.querySelector('[role=dialog]')?.textContent.includes('visual cues ready'));
const score = await until(() => {
    const stage = Array.from(document.querySelectorAll('iframe')).map(frame => frame.contentWindow).find(window => window.stageSnapshot?.direction);
    return stage?.stageSnapshot.direction ? { preset: stage.fx.preset, direction: stage.stageSnapshot.direction } : null;
});
assert.equal(score.preset, 7);
assert.ok(score.direction && Number.isFinite(score.direction.intensity));
await command('click-text', 'Keep this look');
await until(() => document.querySelector('[role=dialog]')?.textContent.includes('Moment saved.'));
await close();
await command('click', '.mineradio-dock #progress-bar');
await command('press', 'Home'); await command('press', 'ArrowRight'); await command('press', 'ArrowRight');
await until(() => Array.from(document.querySelectorAll('audio')).some(audio => Math.abs(audio.currentTime - 10) < .2));
await command('click', '.mineradio-dock #play-btn[aria-label="Play"]');
await until(() => Array.from(document.querySelectorAll('audio')).some(audio => !audio.paused));
await open();
await command('click-text', 'Remember this passage');
await until(() => document.querySelectorAll('[role=dialog] li').length === 2);
assert.equal(await evaluate(() => Array.from(document.querySelectorAll('audio')).some(audio => !audio.paused)), true, 'Saving a passage must not interrupt audio');
const saved = await evaluate(async () => (await import('/src/services/appDatabase.ts')).appDatabase.personal_editions.toArray());
assert.equal(saved.length, 1); assert.equal(saved[0].cues.length, 2);
assert.ok(saved[0].cues.find(cue => cue.kind === 'bookmark').atSec >= 10);
await command('ss', 'flagship-saved-edition');
await close();
await command('reload');
await until(() => !!document.querySelector('[data-immersion-open]'));
await open();
await until(() => document.querySelectorAll('[role=dialog] li').length === 2);
const cues = await evaluate(() => Array.from(document.querySelectorAll('[role=dialog] li')).map(row => row.textContent));
assert.ok(cues.some(cue => cue.includes('Passage')));
await command('click', '[role=dialog] li:last-child button:first-child');
await until(() => Array.from(document.querySelectorAll('audio')).some(audio => audio.currentTime >= 10 && audio.currentTime < 12));
await command('click-text', 'Start journey');
await close();
await until(() => document.querySelector('#control-title')?.textContent === 'Afterglow' && Array.from(document.querySelectorAll('audio')).some(audio => !audio.paused));
await command('click', '.mineradio-dock #progress-bar'); await command('press', 'End');
await until(() => document.querySelector('#control-title')?.textContent === 'Blue Hour' && Array.from(document.querySelectorAll('audio')).some(audio => !audio.paused && audio.currentTime < 5));
await command('click', '.mineradio-dock #progress-bar'); await command('press', 'End');
await until(() => Array.from(document.querySelectorAll('audio')).every(audio => audio.paused));
await open();
await until(() => /Evening Chapters.*complete|Evening Chapters.*ended|journey is complete/i.test(document.querySelector('[role=dialog]')?.textContent ?? ''));
const completion = await evaluate(() => ({ text: document.querySelector('[role=dialog]')?.textContent ?? '' }));
assert.ok(completion.text.includes('Evening Chapters'));
await command('ss', 'flagship-completed-journey');
await command('main-eval', 'electron.BrowserWindow.getAllWindows().filter(w => !w.webContents.getURL().startsWith("devtools:")).forEach(w => w.setSize(960,640))');
await command('ss', 'flagship-panel-960');
await command('main-eval', 'electron.BrowserWindow.getAllWindows().filter(w => !w.webContents.getURL().startsWith("devtools:")).forEach(w => w.setSize(1440,900))');
console.log('PASS: real local analysis reaches Sonic Topography; look and passage save without interruption; edition survives reload; actual ended events advance two album chapters and complete without looping.');
