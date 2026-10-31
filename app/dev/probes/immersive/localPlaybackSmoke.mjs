import assert from 'node:assert/strict';

// Uses the isolated desktop driver and generated audio only; never opens the person's music or accounts.
const command = async (cmd, ...args) => {
    const reply = await fetch('http://127.0.0.1:9230', { method: 'POST', body: JSON.stringify({ cmd, args }), signal: AbortSignal.timeout(60000) }).then(response => response.json());
    assert.equal(reply.ok, true, reply.error);
    return reply.output;
};
const evaluate = async (fn, ...args) => JSON.parse(await command('eval', `(${fn})(...${JSON.stringify(args)})`));
const until = async (fn, ...args) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        if (await evaluate(fn, ...args)) return;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out: ${fn}`);
};
const status = JSON.parse(await command('status'));
assert.ok(status.profile.endsWith('/test-results/run-desktop/userdata'));
await command('main-eval', 'electron.BrowserWindow.getAllWindows().filter(w => !w.webContents.getURL().startsWith("devtools:")).map(w => {w.webContents.closeDevTools(); w.setSize(1440,900)})');
const fixture = await evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle('Immersive fixture', { create: true });
    for (const [name, frequency] of [['Afterglow', 220], ['Blue Hour', 330]]) {
        const samples = 22050 * 45;
        const buffer = new ArrayBuffer(44 + samples * 2); const view = new DataView(buffer);
        for (const [offset, value] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']]) for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
        view.setUint32(4, buffer.byteLength - 8, true); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
        view.setUint32(24, 22050, true); view.setUint32(28, 44100, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); view.setUint32(40, samples * 2, true);
        const attacks = [.8, 1.37, 2.19, 2.91, 4.08, 4.73, 5.51, 6.82, 7.49, 8.33, 9.61, 10.29, 11.17, 12.41, 13.03, 14.11];
        for (let i = 0; i < samples; i++) {
            const time = i / 22050;
            let sample = Math.sin(2 * Math.PI * frequency * time) * .012;
            for (const [index, attack] of attacks.entries()) {
                const age = time % 16 - attack;
                if (age >= 0 && age < .4) sample += Math.sin(2 * Math.PI * 65 * age) * Math.exp(-age * 14) * [.12, .35, .65][index % 3];
            }
            view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
        }
        const audio = await (await directory.getFileHandle(`${name}.wav`, { create: true })).createWritable(); await audio.write(buffer); await audio.close();
        const lyrics = await (await directory.getFileHandle(`${name}.lrc`, { create: true })).createWritable();
        await lyrics.write('[00:00.00]Stay in the moment\n[00:10.00]Let the colours move around you\n[00:20.00]Every sound becomes a place\n[00:30.00]We are here beneath the light\n[00:44.00]'); await lyrics.close();
    }
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d'); const gradient = ctx.createLinearGradient(0, 0, 512, 512);
    gradient.addColorStop(0, '#f1af5b'); gradient.addColorStop(.45, '#8a3d6d'); gradient.addColorStop(1, '#13264f'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#ffffff66'; ctx.lineWidth = 2; for(let r = 30; r < 390; r += 14) { ctx.beginPath(); ctx.arc(256, 256, r, 0, Math.PI * 2); ctx.stroke(); }
    const cover = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const coverFile = await (await directory.getFileHandle('cover.png', { create: true })).createWritable(); await coverFile.write(cover); await coverFile.close();
    window.showDirectoryPicker = async () => directory;
    return { ready: true, profileOrigin: location.origin };
});
assert.equal(fixture.ready, true);
await command('click', '.mineradio-dock button[aria-label="Music home"]');
await command('click', '.mineradio-home [data-home-tone="playlist"]');
await until(() => !document.querySelector('.mineradio-home'));
await command('click', '.mineradio-dock button[aria-label="Music home"]');
await until(() => !!document.querySelector('.home-discovery-song[title="All Songs"]'));
await command('click', '.home-discovery-song[title="All Songs"]');
await command('click-text', 'Play all');
await until(() => Array.from(document.querySelectorAll('audio')).some(audio => !audio.paused && audio.duration === 45));
await command('click', '.mineradio-dock #control-title');
await until(() => /moment|colours|becomes|beneath/.test(document.querySelector('[data-testid=player-visual-surface]')?.innerText || '') || (() => {
    const stage = document.querySelector('iframe[title="MineRadio visual stage"]')?.contentWindow;
    return stage?.stageSnapshot?.showLyrics && !!stage.stageLyrics?.current && stage.lyricsLines?.length === 4;
})());
await command('click', '.mineradio-dock #play-btn[aria-label="Pause"]');
await until(() => Array.from(document.querySelectorAll('audio')).every(audio => audio.paused));
await command('click', '.mineradio-dock #progress-bar');
await command('press', 'Home'); await command('press', 'ArrowRight');
await until(() => Array.from(document.querySelectorAll('audio')).some(audio => audio.paused && Math.abs(audio.currentTime - 5) < .15));
await command('click', '.mineradio-dock #play-btn[aria-label="Play"]');
await until(() => Array.from(document.querySelectorAll('audio')).some(audio => !audio.paused && audio.currentTime > 5.2));
const beforeNext = await evaluate(() => ({ title: document.querySelector('#control-title')?.textContent }));
assert.ok(['Afterglow', 'Blue Hour'].includes(beforeNext.title));
await command('click', '.mineradio-dock #next-btn');
await until(previous => document.querySelector('#control-title')?.textContent !== previous, beforeNext.title);
await until(() => Array.from(document.querySelectorAll('audio')).some(audio => !audio.paused && audio.duration === 45));
const next = await evaluate(() => ({ title: document.querySelector('#control-title')?.textContent }));
assert.ok(['Afterglow', 'Blue Hour'].includes(next.title));
assert.notEqual(next.title, beforeNext.title);
await command('click', '.mineradio-dock #play-btn[aria-label="Pause"]');
await until(() => Array.from(document.querySelectorAll('audio')).every(audio => audio.paused));
await command('ss', 'verified-local-player');
await command('reload');
await until(title => document.querySelector('#control-title')?.textContent === title && document.querySelector('#time-display')?.textContent.includes('00:45'), next.title);
assert.equal(await evaluate(() => Array.from(document.querySelectorAll('audio')).every(audio => audio.paused)), true);
console.log('PASS: generated local folder import, actual audio, lyric display, pause, keyboard seek, resume, next track, and paused session restoration.');
console.log(await command('status'));
await command('ss', 'verified-restored-player');
