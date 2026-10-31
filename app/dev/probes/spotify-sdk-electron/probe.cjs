// Run with: node_modules/.bin/electron dev/probes/spotify-sdk-electron/probe.cjs
// This probe uses a separate temporary profile and never requests Spotify credentials.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'immersive-spotify-sdk-'));
app.setPath('userData', profile);

app.whenReady().then(async () => {
    const file = path.join(profile, 'probe.html');
    fs.writeFileSync(file, '<!doctype html><meta charset="utf-8"><title>Spotify SDK capability probe</title>');
    const win = new BrowserWindow({ show: false, webPreferences: {
        nodeIntegration: false, contextIsolation: true, webSecurity: true,
    } });
    try {
        await win.loadFile(file);
        const result = await win.webContents.executeJavaScript(`(async () => {
            const result = { secureContext: isSecureContext, keySystems: {}, sdk: null, methods: null };
            const attempts = [
                ['widevine-cenc', 'com.widevine.alpha', { initDataTypes: ['cenc'] }],
                ['widevine-mp4-aac', 'com.widevine.alpha', { initDataTypes: ['cenc'], audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }] }],
                ['widevine-webm-opus', 'com.widevine.alpha', { initDataTypes: ['webm'], audioCapabilities: [{ contentType: 'audio/webm; codecs="opus"' }] }],
                ['clearkey-mp4-aac', 'org.w3.clearkey', { initDataTypes: ['cenc'], audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }] }],
                ['clearkey-webm-opus', 'org.w3.clearkey', { initDataTypes: ['webm'], audioCapabilities: [{ contentType: 'audio/webm; codecs="opus"' }] }],
            ];
            for (const [label, system, configuration] of attempts) {
                try {
                    await navigator.requestMediaKeySystemAccess(system, [configuration]);
                    result.keySystems[label] = 'available';
                } catch (error) { result.keySystems[label] = error.name + ': ' + error.message; }
            }
            result.sdk = await new Promise(resolve => {
                const script = document.createElement('script');
                const timeout = setTimeout(() => resolve('timeout'), 15000);
                window.onSpotifyWebPlaybackSDKReady = () => { clearTimeout(timeout); resolve('ready'); };
                script.onerror = () => { clearTimeout(timeout); resolve('load failed'); };
                script.src = 'https://sdk.scdn.co/spotify-player.js';
                document.head.appendChild(script);
            });
            if (result.sdk === 'ready') {
                try {
                    const player = new window.Spotify.Player({ name: 'Immersive SDK probe', getOAuthToken: () => {} });
                    result.methods = Object.fromEntries(['connect', 'disconnect', 'getCurrentState', 'pause', 'resume', 'seek'].map(name => [name, typeof player[name]]));
                } catch (error) { result.methods = error.name + ': ' + error.message; }
            }
            return result;
        })()`);
        console.log(JSON.stringify({ electron: process.versions.electron, chrome: process.versions.chrome, ...result }));
    } catch (error) {
        console.error('Probe failed:', error.message);
        process.exitCode = 1;
    } finally {
        win.destroy();
        app.quit();
    }
}).catch(error => { console.error('Probe failed:', error.message); app.exit(1); });

app.on('will-quit', () => { fs.rmSync(profile, { recursive: true, force: true }); });
