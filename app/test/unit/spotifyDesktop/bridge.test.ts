import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';

// Main-process tests inject networking and scripting; they never operate the user's Spotify app.
const require = createRequire(import.meta.url);
const { createSpotifyDesktopBridge } = require('../../../electron/spotifyDesktop/bridge.cjs');
const { createNativeSpotify, normalizeNativeSnapshot, NATIVE_SCRIPT } = require('../../../electron/spotifyDesktop/native.cjs');
const ID = '0123456789abcdefghijkl';
const CLIENT = '0123456789abcdef0123456789abcdef';
const json = (body: unknown, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });

function setup(extra: Record<string, unknown> = {}) {
    const values = new Map<string, unknown>();
    const urls: string[] = [];
    let exchanged = 0;
    const store = { get: (key: string) => values.get(key), set: (key: string, value: unknown) => values.set(key, value), delete: (key: string) => values.delete(key) };
    const safeStorage = {
        isEncryptionAvailable: () => true,
        encryptString: (value: string) => Buffer.from(`test-encrypted:${value}`),
        decryptString: (value: Buffer) => value.toString().slice('test-encrypted:'.length),
    };
    const bridge = createSpotifyDesktopBridge({
        store, safeStorage, platform: 'darwin',
        shell: { openExternal: async (url: string) => { urls.push(url); } },
        fetch: async (url: string) => {
            if (String(url).includes('/api/token')) { exchanged++; return json({ access_token: 'access-secret', refresh_token: 'refresh-secret', expires_in: 3600 }); }
            if (String(url).endsWith('/me')) return json({ id: 'person', display_name: 'Listener', images: [] });
            return json({ items: [], total: 0 });
        },
        execFile: async () => ({ stdout: JSON.stringify({ availability: 'ready', state: 'paused', positionSeconds: 1.25, volume: 50, track: { uri: `spotify:track:${ID}`, title: 'Song', artist: 'Artist', album: 'Album', durationMs: 230000 } }) }),
        ...extra,
    });
    return { bridge, values, urls, store, safeStorage, exchanged: () => exchanged };
}

async function authorize(ctx: ReturnType<typeof setup>) {
    expect((await ctx.bridge.request('configure', { clientId: CLIENT })).ok).toBe(true);
    const start = await ctx.bridge.request('login_start');
    expect(start.ok).toBe(true);
    await ctx.bridge.request('login_open', { key: start.data.key });
    const url = new URL(ctx.urls.at(-1)!);
    const callback = new URL(url.searchParams.get('redirect_uri')!);
    callback.searchParams.set('state', url.searchParams.get('state')!);
    callback.searchParams.set('code', 'test-code');
    return { start: start.data, url, callback };
}

describe('official Spotify main-process bridge', () => {
    it.each([
        ['user-library-read', 'auth-required'],
        ['user-read-currently-playing user-read-playback-state', 'not-public'],
        [undefined, 'not-public'],
    ])('distinguishes missing queue scopes on a 403 (%s)', async (scope, expected) => {
        const ctx = setup({ fetch: async (url: string) => String(url).includes('/api/token')
            ? json({ access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600, scope })
            : json({ error: { status: 403, message: 'Forbidden' } }, 403) });
        ctx.store.set('spotifyDesktop.clientId', CLIENT);
        ctx.store.set('spotifyDesktop.tokensEncrypted', ctx.safeStorage.encryptString(JSON.stringify({ refreshToken: 'test-refresh' })).toString('base64'));
        try {
            const result = await ctx.bridge.request('query', { name: 'playerQueue', variables: {} });
            expect(result).toMatchObject({ ok: false, error: { code: expected, httpStatus: 403 } });
        } finally { ctx.bridge.dispose(); }
    });
    it.each(['success', 'invalid_grant'])('keeps renewed authorization when an older refresh finishes with %s', async outcome => {
        let finishRefresh!: (answer: Response) => void;
        let refreshStarted!: () => void;
        const started = new Promise<void>(resolve => { refreshStarted = resolve; });
        const refresh = new Promise<Response>(resolve => { finishRefresh = resolve; });
        const queueAuthorization: string[] = [];
        const ctx = setup({ fetch: async (url: string, options: RequestInit) => {
            if (String(url).includes('/api/token')) {
                if (new URLSearchParams(String(options.body)).get('grant_type') === 'refresh_token') {
                    refreshStarted();
                    return refresh;
                }
                return json({ access_token: 'renewed-test-access', refresh_token: 'renewed-test-refresh', expires_in: 3600 });
            }
            if (String(url).endsWith('/me')) return json({ id: 'renewed-person', display_name: 'Renewed listener' });
            queueAuthorization.push(new Headers(options.headers).get('Authorization') || '');
            return json({ currently_playing: null, queue: [] });
        } });
        ctx.store.set('spotifyDesktop.clientId', CLIENT);
        ctx.store.set('spotifyDesktop.tokensEncrypted', ctx.safeStorage.encryptString(JSON.stringify({ refreshToken: 'previous-test-refresh' })).toString('base64'));
        const oldQuery = ctx.bridge.request('query', { name: 'playerQueue', variables: {} });
        try {
            await started;
            const { callback } = await authorize(ctx);
            expect((await fetch(callback)).status).toBe(200);
            const renewed = ctx.store.get('spotifyDesktop.tokensEncrypted');
            finishRefresh(outcome === 'success'
                ? json({ access_token: 'late-test-access', refresh_token: 'late-test-refresh', expires_in: 3600 })
                : json({ error: 'invalid_grant' }, 400));
            await oldQuery;
            expect(ctx.store.get('spotifyDesktop.tokensEncrypted')).toBe(renewed);
            expect((await ctx.bridge.request('connection_status')).data.connected).toBe(true);
            expect((await ctx.bridge.request('login_status')).data.id).toBe('renewed-person');
            expect((await ctx.bridge.request('query', { name: 'playerQueue', variables: {} })).ok).toBe(true);
            expect(queueAuthorization.at(-1)).toBe('Bearer renewed-test-access');
        } finally {
            finishRefresh(json({ error: 'invalid_grant' }, 400));
            ctx.bridge.dispose();
        }
    });
    it.each(['cancel', 'deny'])('preserves the existing connection and native controls when renewed sign-in is %s', async action => {
        const ctx = setup();
        ctx.store.set('spotifyDesktop.clientId', CLIENT);
        const saved = ctx.safeStorage.encryptString(JSON.stringify({ refreshToken: 'existing-test-refresh' })).toString('base64');
        ctx.store.set('spotifyDesktop.tokensEncrypted', saved);
        try {
            const { start, callback } = await authorize(ctx);
            if (action === 'cancel') await ctx.bridge.request('login_cancel', { key: start.key });
            else {
                callback.searchParams.set('error', 'access_denied');
                expect((await fetch(callback)).status).toBe(400);
            }
            expect(ctx.store.get('spotifyDesktop.tokensEncrypted')).toBe(saved);
            expect((await ctx.bridge.request('connection_status')).data.connected).toBe(true);
            expect((await ctx.bridge.request('playback_snapshot')).data.availability).toBe('ready');
        } finally { ctx.bridge.dispose(); }
    });
    it('resumes only the displayed recording, starting it when another recording is paused', () => {
        let current = `spotify:track:${'b'.repeat(22)}`;
        const wanted = `spotify:track:${ID}`;
        const calls: string[] = [];
        const app = {
            running: () => true, currentTrack: () => ({ id: () => current, name: () => 'Track', artist: () => '', album: () => '', artworkUrl: () => '', duration: () => 120000 }),
            playerState: () => 'playing', playerPosition: () => 0, soundVolume: () => 50, shuffling: () => false, repeating: () => false,
            playTrack: (uri: string) => { current = uri; calls.push(uri); }, play: () => { calls.push('resume'); },
        };
        const run = new Function('Application', `${NATIVE_SCRIPT}; return run;`)(() => app);
        expect(JSON.parse(run(['play', wanted])).track.uri).toBe(wanted);
        expect(calls).toEqual([wanted]);
        run(['play', wanted]);
        expect(calls.at(-1)).toBe('resume');
    });

    it('bounds confirmation by elapsed time and the remaining scripting timeout', async () => {
        let now = 0;
        const timeouts: number[] = [];
        const native = createNativeSpotify({ platform: 'darwin', now: () => now, execFile: async (_file: string, _args: string[], options: { timeout: number }) => {
            timeouts.push(options.timeout); now += 2500;
            return { stdout: JSON.stringify({ availability: 'ready', state: 'playing', track: { uri: `spotify:track:${'b'.repeat(22)}`, durationMs: 120000 } }) };
        } });
        expect((await native('play-track', `spotify:track:${ID}`)).availability).toBe('error');
        expect(timeouts).toEqual([4000, 1500]);
    });
    it('confirms the requested native track before publishing its clock', async () => {
        let calls = 0;
        const native = createNativeSpotify({ platform: 'darwin', execFile: async () => ({ stdout: JSON.stringify({
            availability: 'ready', state: 'playing', positionSeconds: 0, volume: 50,
            track: { uri: `spotify:track:${++calls === 1 ? 'a'.repeat(22) : ID}`, title: 'Track', durationMs: 120000 },
        }) }) });
        const result = await native('play-track', `spotify:track:${ID}`);
        expect(result.track.uri).toBe(`spotify:track:${ID}`);
        expect(calls).toBe(2);
    });

    it.each(['next', 'previous'])('waits for the native %s recording instead of returning the stale immediate snapshot', async action => {
        const calls: string[] = [];
        let moved = false;
        const native = createNativeSpotify({ platform: 'darwin', execFile: async (_file: string, args: string[]) => {
            const command = args.at(-1)!;
            calls.push(command);
            const uri = moved && command === 'snapshot' ? `spotify:track:${ID}` : `spotify:track:${'a'.repeat(22)}`;
            if (command === action) moved = true;
            return { stdout: JSON.stringify({ availability: 'ready', state: 'paused', positionSeconds: 0, track: { uri, durationMs: 120000 } }) };
        } });
        const result = await native(action);
        expect(result.track.uri).toBe(`spotify:track:${ID}`);
        expect(result.state).toBe('paused');
        expect(calls).toEqual(['snapshot', action, 'snapshot']);
    });

    it('returns the latest unchanged recording when Next reaches a single-track or ended context', async () => {
        let now = 0;
        const calls: string[] = [];
        const native = createNativeSpotify({ platform: 'darwin', now: () => now, execFile: async (_file: string, args: string[]) => {
            calls.push(args.at(-1)!);
            now += 2500;
            return { stdout: JSON.stringify({ availability: 'ready', state: 'paused', positionSeconds: calls.length,
                track: { uri: `spotify:track:${ID}`, durationMs: 120000 } }) };
        } });
        const result = await native('next');
        expect(calls).toEqual(['snapshot', 'next', 'snapshot']);
        expect(result).toMatchObject({ availability: 'ready', state: 'paused', positionMs: 3000, track: { uri: `spotify:track:${ID}` } });
    });

    it('serializes native actions and observations', async () => {
        let release!: (value: { stdout: string }) => void;
        const calls: string[] = [];
        const native = createNativeSpotify({ platform: 'darwin', execFile: async (_file: string, args: string[]) => {
            calls.push(args.at(-1)!);
            if (calls.length === 1) return new Promise(resolve => { release = resolve; });
            return { stdout: JSON.stringify({ availability: 'empty', state: 'paused' }) };
        } });
        const play = native('play');
        const pause = native('pause');
        await new Promise(resolve => setImmediate(resolve));
        expect(calls).toEqual(['play']);
        release({ stdout: JSON.stringify({ availability: 'empty', state: 'playing' }) });
        await Promise.all([play, pause]);
        expect(calls).toEqual(['play', 'pause']);
    });

    it('starts PKCE with a numeric loopback and never includes a client secret', async () => {
        const ctx = setup();
        try {
            expect((await ctx.bridge.request('connection_status')).data.redirectUri).toBe('http://127.0.0.1/callback');
            const { url, callback } = await authorize(ctx);
            expect(callback.hostname).toBe('127.0.0.1');
            expect(Number(callback.port)).toBeGreaterThan(0);
            expect(url.searchParams.get('code_challenge_method')).toBe('S256');
            expect(url.searchParams.get('scope')?.split(' ')).toEqual(expect.arrayContaining(['user-read-playback-state', 'user-read-currently-playing']));
            expect(url.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
            expect(url.searchParams.has('client_secret')).toBe(false);
            expect((await fetch(callback)).status).toBe(200);
            expect(ctx.exchanged()).toBe(1);
            expect(JSON.stringify([...ctx.values])).not.toContain('refresh-secret');
        } finally { await ctx.bridge.dispose(); }
    });

    it('rejects callback state mismatches without exchanging a code', async () => {
        const ctx = setup();
        try {
            const { callback } = await authorize(ctx);
            callback.searchParams.set('state', 'not-the-active-state');
            expect((await fetch(callback)).status).toBe(400);
            expect(ctx.exchanged()).toBe(0);
        } finally { await ctx.bridge.dispose(); }
    });

    it('cancels and closes the OAuth listener', async () => {
        const ctx = setup();
        try {
            const { start, callback } = await authorize(ctx);
            await ctx.bridge.request('login_cancel', { key: start.key });
            expect((await ctx.bridge.request('login_check', { key: start.key })).data.state).toBe('expired');
            await expect(fetch(callback)).rejects.toThrow();
        } finally { await ctx.bridge.dispose(); }
    });

    it('does not persist credentials when canceled during the account read', async () => {
        let releaseProfile!: (value: Response) => void;
        let entered!: () => void;
        const readingProfile = new Promise<void>(resolve => { entered = resolve; });
        const ctx = setup({ fetch: async (url: string) => {
            if (String(url).includes('/api/token')) return json({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 });
            entered();
            return new Promise<Response>(resolve => { releaseProfile = resolve; });
        } });
        try {
            const { start, callback } = await authorize(ctx);
            const browser = fetch(callback).catch(() => null);
            await readingProfile;
            await ctx.bridge.request('login_cancel', { key: start.key });
            releaseProfile(json({ id: 'person', display_name: 'Listener' }));
            await browser;
            await delay(5);
            expect([...ctx.values.keys()].some(key => key.includes('tokensEncrypted'))).toBe(false);
            expect((await ctx.bridge.request('login_check', { key: start.key })).data.state).toBe('expired');
        } finally { await ctx.bridge.dispose(); }
    });

    it('expires unanswered OAuth attempts and closes their listener', async () => {
        const ctx = setup({ oauthTimeoutMs: 40 });
        try {
            const { start, callback } = await authorize(ctx);
            await delay(70);
            expect((await ctx.bridge.request('login_check', { key: start.key })).data.state).toBe('expired');
            await expect(fetch(callback)).rejects.toThrow();
        } finally { await ctx.bridge.dispose(); }
    });

    it('refuses credential persistence when Keychain encryption is unavailable', async () => {
        const ctx = setup({ safeStorage: { isEncryptionAvailable: () => false } });
        try {
            const { callback } = await authorize(ctx);
            expect((await fetch(callback)).status).toBe(500);
            expect([...ctx.values.keys()].some(key => key.includes('token'))).toBe(false);
        } finally { await ctx.bridge.dispose(); }
    });

    it('uses documented search with its ten-result limit and existing normalized shape', async () => {
        const requests: string[] = [];
        const ctx = setup({ fetch: async (url: string) => {
            if (String(url).includes('/api/token')) return json({ access_token: 'a', refresh_token: 'r', expires_in: 3600 });
            requests.push(String(url));
            if (String(url).endsWith('/me')) return json({ id: 'person', display_name: 'Listener' });
            return json({ tracks: { items: [{ id: ID, uri: `spotify:track:${ID}`, type: 'track', name: 'Song', duration_ms: 250000, artists: [{ id: ID, name: 'Artist' }], album: { id: ID, name: 'Album', images: [] } }], total: 11 } });
        } });
        try {
            const { callback } = await authorize(ctx); await fetch(callback);
            const answer = await ctx.bridge.request('query', { name: 'searchTracks', variables: { searchTerm: 'Song', limit: 50, offset: 0 } });
            expect(answer.data.searchV2.tracksV2.items[0].item.data.duration.totalMilliseconds).toBe(250000);
            const requested = new URL(requests.at(-1)!);
            expect(requested.origin).toBe('https://api.spotify.com');
            expect(requested.searchParams.get('limit')).toBe('10');
        } finally { await ctx.bridge.dispose(); }
    });

    it('reports rate limits without spinning or silently returning an empty collection', async () => {
        let api = false;
        const ctx = setup({ fetch: async (url: string) => {
            if (String(url).includes('/api/token')) return json({ access_token: 'a', refresh_token: 'r', expires_in: 3600 });
            if (!api) return json({ id: 'person', display_name: 'Listener' });
            return json({ error: { message: 'Slow down' } }, 429, { 'Retry-After': '3' });
        } });
        try {
            const { callback } = await authorize(ctx); await fetch(callback); api = true;
            const result = await ctx.bridge.request('query', { name: 'fetchLibraryTracks', variables: {} });
            expect(result.ok).toBe(false);
            expect(result.error.retryAfterMs).toBe(3000);
        } finally { await ctx.bridge.dispose(); }
    });

    it('rejects private audio operations and malformed URIs before scripting', async () => {
        const scripts: unknown[] = [];
        const ctx = setup({ execFile: async (...args: unknown[]) => { scripts.push(args); return { stdout: '{}' }; } });
        try {
            expect((await ctx.bridge.request('audio', { id: ID })).error.code).toBe('unsupported');
            expect((await ctx.bridge.request('playback_action', { action: 'play-track', uri: 'spotify:track:bad"; do shell script' })).ok).toBe(false);
            expect(scripts).toHaveLength(0);
        } finally { await ctx.bridge.dispose(); }
    });

    it('passes validated native arguments separately from its fixed script', async () => {
        let invocation: unknown[] = [];
        const ctx = setup({ execFile: async (...args: unknown[]) => { invocation = args; return { stdout: JSON.stringify({ availability: 'ready', state: 'playing', positionSeconds: 0, track: { uri: `spotify:track:${ID}`, title: 'Song', durationMs: 120000 } }) }; } });
        try {
            await ctx.bridge.request('playback_action', { action: 'play-track', uri: `spotify:track:${ID}` });
            expect(invocation[0]).toBe('/usr/bin/osascript');
            const args = invocation[1] as string[];
            expect(args.at(-1)).toBe(`spotify:track:${ID}`);
            expect(args[args.indexOf('-e') + 1]).not.toContain(ID);
        } finally { await ctx.bridge.dispose(); }
    });

    it.each(['playlist', 'album'])('passes a validated %s context as a separate scripting argument', async type => {
        let args: string[] = [];
        const contextUri = `spotify:${type}:${ID}`;
        const ctx = setup({ execFile: async (_file: string, supplied: string[]) => {
            args = supplied;
            return { stdout: JSON.stringify({ availability: 'ready', state: 'playing', track: { uri: `spotify:track:${ID}`, durationMs: 120000 } }) };
        } });
        try {
            expect((await ctx.bridge.request('playback_action', { action: 'play-track', uri: `spotify:track:${ID}`, contextUri })).ok).toBe(true);
            expect(args.slice(-3)).toEqual(['play-track', `spotify:track:${ID}`, contextUri]);
            expect(args[args.indexOf('-e') + 1]).not.toContain(contextUri);
        } finally { await ctx.bridge.dispose(); }
    });

    it('calls Spotify with the explicit context while leaving isolated playback unchanged', () => {
        const playTrack = vi.fn();
        const app = { running: () => true, playTrack, currentTrack: () => { throw new Error('empty'); },
            playerState: () => 'playing', playerPosition: () => 0, soundVolume: () => 50,
            shuffling: () => false, repeating: () => false };
        const run = new Function('Application', `${NATIVE_SCRIPT}; return run;`)(() => app);
        const uri = `spotify:track:${ID}`;
        const context = `spotify:playlist:${ID}`;
        run(['play-track', uri, context]);
        expect(playTrack).toHaveBeenLastCalledWith(uri, { inContext: context });
        run(['play-track', uri]);
        expect(playTrack).toHaveBeenLastCalledWith(uri);
    });

    it('rejects invalid contexts and context on a non-play command before scripting', async () => {
        const scripts: unknown[] = [];
        const ctx = setup({ execFile: async (...args: unknown[]) => { scripts.push(args); return { stdout: '{}' }; } });
        try {
            for (const contextUri of ['', `spotify:track:${ID}`, 'spotify:playlist:bad"; code()', 'https://example.com/playlist']) {
                expect(await ctx.bridge.request('playback_action', { action: 'play-track', uri: `spotify:track:${ID}`, contextUri })).toMatchObject({ ok: false, error: { code: 'unsupported' } });
            }
            expect(await ctx.bridge.request('playback_action', { action: 'pause', contextUri: `spotify:playlist:${ID}` })).toMatchObject({ ok: false, error: { code: 'unsupported' } });
            expect(scripts).toHaveLength(0);
        } finally { await ctx.bridge.dispose(); }
    });

    it('reports denied Automation access explicitly', async () => {
        const ctx = setup({ execFile: async () => { throw new Error('Not authorized to send Apple events. (-1743)'); } });
        try {
            const result = await ctx.bridge.request('playback_snapshot');
            expect(result.ok).toBe(true);
            expect(result.data.availability).toBe('permission-denied');
        } finally { await ctx.bridge.dispose(); }
    });

    it('normalizes Spotify seconds to milliseconds and preserves duration milliseconds', () => {
        const snapshot = normalizeNativeSnapshot({ availability: 'ready', state: 'playing', positionSeconds: 1.25, volume: 45, track: { uri: `spotify:track:${ID}`, title: 'Song', durationMs: 180000 } }, 900);
        expect(snapshot.positionMs).toBe(1250);
        expect(snapshot.track.durationMs).toBe(180000);
        expect(snapshot.volume).toBe(.45);
        expect(snapshot.observedAt).toBe(900);
    });
});
