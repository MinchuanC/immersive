const { execFile: nodeExecFile } = require('node:child_process');
const { promisify } = require('node:util');

// Fixed Spotify scripting commands. Renderer values are arguments, never executable script text.
const TRACK_URI = /^spotify:track:[A-Za-z0-9]{22}$/;
const CONTEXT_URI = /^spotify:(playlist|album):[A-Za-z0-9]{22}$/;
const NATIVE_SCRIPT = `function run(argv) {
    var spotify;
    try { spotify = Application('com.spotify.client'); }
    catch (_) { return JSON.stringify({ availability: 'not-installed' }); }
    if (!spotify.running()) return JSON.stringify({ availability: 'not-running' });
    var action = argv[0];
    switch (action) {
        case 'play':
            var matches = false;
            try { matches = spotify.currentTrack().id() === argv[1]; } catch (_) {}
            if (argv[1] && !matches) spotify.playTrack(argv[1]); else spotify.play();
            break;
        case 'pause': spotify.pause(); break;
        case 'toggle': spotify.playpause(); break;
        case 'next': spotify.nextTrack(); break;
        case 'previous': spotify.previousTrack(); break;
        case 'play-track':
            if (argv[2]) spotify.playTrack(argv[1], { inContext: argv[2] });
            else spotify.playTrack(argv[1]);
            break;
        case 'seek': spotify.playerPosition = Number(argv[1]); break;
        case 'volume': spotify.soundVolume = Number(argv[1]); break;
        case 'shuffle': spotify.shuffling = argv[1] === 'true'; break;
        case 'repeat': spotify.repeating = argv[1] === 'true'; break;
    }
    var track = null;
    try {
        var item = spotify.currentTrack();
        track = { uri: item.id(), title: item.name(), artist: item.artist(), album: item.album(),
            artworkUrl: item.artworkUrl(), durationMs: item.duration() };
    } catch (_) {}
    return JSON.stringify({ availability: track ? 'ready' : 'empty', state: spotify.playerState(),
        positionSeconds: spotify.playerPosition(), volume: spotify.soundVolume(),
        shuffle: spotify.shuffling(), repeat: spotify.repeating(), track: track });
}`;

function failure(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function nativeArguments(action, value, contextUri) {
    if (contextUri !== undefined && (action !== 'play-track' || typeof contextUri !== 'string' || !CONTEXT_URI.test(contextUri))) {
        throw failure('unsupported', 'A valid Spotify playlist or album context is required for track playback');
    }
    if (action === 'play' && value !== undefined) {
        if (typeof value !== 'string' || !TRACK_URI.test(value)) throw failure('unsupported', 'A valid Spotify track URI is required');
        return [action, value];
    }
    if (['snapshot', 'play', 'pause', 'toggle', 'next', 'previous'].includes(action)) return [action];
    if (action === 'play-track') {
        if (typeof value !== 'string' || !TRACK_URI.test(value)) throw failure('unsupported', 'A valid Spotify track URI is required');
        return contextUri === undefined ? [action, value] : [action, value, contextUri];
    }
    if (action === 'seek' || action === 'volume') {
        const maximum = action === 'volume' ? 100 : 86400;
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum) throw failure('unsupported', `Invalid ${action} value`);
        return [action, String(value)];
    }
    if (action === 'shuffle' || action === 'repeat') {
        if (typeof value !== 'boolean') throw failure('unsupported', `Invalid ${action} value`);
        return [action, String(value)];
    }
    throw failure('unsupported', 'Unknown Spotify playback command');
}

function normalizeNativeSnapshot(raw, observedAt = Date.now()) {
    const availability = ['ready', 'empty', 'not-running', 'not-installed', 'permission-denied', 'unsupported-platform', 'error'].includes(raw?.availability) ? raw.availability : 'error';
    const item = raw?.track;
    const track = item && typeof item.uri === 'string' && TRACK_URI.test(item.uri) ? {
        uri: item.uri, title: String(item.title || ''), artist: String(item.artist || ''), album: String(item.album || ''),
        artworkUrl: typeof item.artworkUrl === 'string' && /^https:\/\//.test(item.artworkUrl) ? item.artworkUrl : '',
        // Spotify's scripting implementation returns track duration in milliseconds; position is seconds.
        durationMs: Math.max(0, Number(item.durationMs) || 0),
    } : null;
    return {
        availability, state: ['playing', 'paused', 'stopped'].includes(raw?.state) ? raw.state : 'stopped',
        positionMs: Math.max(0, (Number(raw?.positionSeconds) || 0) * 1000),
        volume: Math.min(1, Math.max(0, (Number(raw?.volume) || 0) / 100)),
        shuffle: Boolean(raw?.shuffle), repeat: Boolean(raw?.repeat), track, observedAt,
    };
}

function createNativeSpotify({ execFile = promisify(nodeExecFile), platform = process.platform, now = Date.now } = {}) {
    let pending = Promise.resolve();
    const read = async (args, timeout = 8000) => {
        if (platform !== 'darwin') return normalizeNativeSnapshot({ availability: 'unsupported-platform' }, now());
        try {
            const { stdout } = await execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', NATIVE_SCRIPT, '--', ...args], { timeout, maxBuffer: 128 * 1024 });
            return normalizeNativeSnapshot(JSON.parse(stdout), now());
        } catch (error) {
            const message = String(error?.message || '');
            const availability = /-1743|not authorized|not permitted/i.test(message) ? 'permission-denied'
                : /-10814|application can.t be found/i.test(message) ? 'not-installed' : 'error';
            return normalizeNativeSnapshot({ availability }, now());
        }
    };
    return async (action = 'snapshot', value, contextUri) => {
        const args = nativeArguments(action, value, contextUri);
        const result = pending.catch(() => {}).then(async () => {
            const step = action === 'next' || action === 'previous';
            const before = step ? await read(['snapshot'], 4000) : null;
            if (before && !['ready', 'empty'].includes(before.availability)) return before;
            const confirm = step || action === 'play-track' || (action === 'play' && value !== undefined);
            const deadline = now() + 4000;
            let snapshot = await read(args, confirm ? 4000 : 8000);
            if (!confirm) return snapshot;
            const confirmed = () => step ? snapshot.track?.uri !== before.track?.uri : snapshot.track?.uri === value && snapshot.state === 'playing';
            // Native transport may acknowledge an action before the requested recording becomes current.
            for (let attempt = 0; attempt < 20 && now() < deadline && ['ready', 'empty'].includes(snapshot.availability); attempt++) {
                if (confirmed()) return snapshot;
                await new Promise(resolve => setTimeout(resolve, 100));
                const remaining = deadline - now();
                if (remaining <= 0) break;
                snapshot = await read(['snapshot'], Math.max(1, remaining));
            }
            // A step may legitimately keep the same URI at a boundary or restart the current track.
            if (step || confirmed()) return snapshot;
            return ['ready', 'empty'].includes(snapshot.availability)
                ? normalizeNativeSnapshot({ availability: 'error' }, now()) : snapshot;
        });
        pending = result;
        return result;
    };
}

module.exports = { createNativeSpotify, normalizeNativeSnapshot, NATIVE_SCRIPT };
