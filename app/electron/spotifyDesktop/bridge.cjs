const http = require('node:http');
const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');
const { createNativeSpotify } = require('./native.cjs');
const { createOfficialApi } = require('./officialApi.cjs');

// Main-process PKCE, secure credentials, documented Web API, and a narrow native playback boundary.
const CONFIG_KEY = 'spotifyDesktop.clientId';
const TOKEN_KEY = 'spotifyDesktop.tokensEncrypted';
const SCOPES = ['user-read-private', 'user-library-read', 'user-library-modify', 'playlist-read-private', 'playlist-read-collaborative', 'playlist-modify-public', 'playlist-modify-private', 'user-follow-read', 'user-follow-modify', 'user-read-playback-state', 'user-read-currently-playing'];
const failure = (code, message, details = {}) => Object.assign(new Error(message), { code, ...details });
const equal = (left, right) => typeof left === 'string' && typeof right === 'string' && Buffer.byteLength(left) === Buffer.byteLength(right) && timingSafeEqual(Buffer.from(left), Buffer.from(right));

function createSpotifyDesktopBridge({ store, safeStorage, shell, fetch: fetcher = globalThis.fetch, execFile, platform = process.platform, oauthTimeoutMs = 10 * 60 * 1000, now = Date.now } = {}) {
    let accessToken = '';
    let accessScopes = null;
    let accessExpiresAt = 0;
    let profile = null;
    let refreshUnderway = null;
    let activeAttempt = null;
    let disposed = false;
    let authGeneration = 0;
    const attempts = new Map();
    const native = createNativeSpotify({ execFile, platform, now });
    const clientId = () => String(store?.get(CONFIG_KEY) || '');
    const encryptionAvailable = () => platform === 'darwin' && safeStorage?.isEncryptionAvailable?.() === true;
    const clearTokens = () => {
        authGeneration++;
        accessToken = ''; accessScopes = null; accessExpiresAt = 0; profile = null;
        store?.delete(TOKEN_KEY);
    };
    const saveTokens = (data, previousRefresh = '') => {
        if (!encryptionAvailable()) throw failure('unavailable', 'macOS Keychain encryption is unavailable. Spotify credentials were not saved.', { reason: 'keychain-unavailable' });
        if (typeof data.access_token !== 'string' || !data.access_token) throw failure('invalid-response', 'Spotify did not return an access token');
        const refreshToken = typeof data.refresh_token === 'string' ? data.refresh_token : previousRefresh;
        if (!refreshToken) throw failure('invalid-response', 'Spotify did not return a refresh token');
        store.set(TOKEN_KEY, safeStorage.encryptString(JSON.stringify({ refreshToken })).toString('base64'));
        accessToken = data.access_token;
        accessScopes = typeof data.scope === 'string' ? new Set(data.scope.split(/\s+/).filter(Boolean)) : null;
        accessExpiresAt = now() + Math.max(0, Number(data.expires_in) || 0) * 1000;
    };
    const readRefresh = () => {
        const encrypted = store?.get(TOKEN_KEY);
        if (!encrypted) return '';
        if (!encryptionAvailable()) throw failure('unavailable', 'macOS Keychain encryption is unavailable', { reason: 'keychain-unavailable' });
        try { return JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, 'base64'))).refreshToken || ''; }
        catch { clearTokens(); throw failure('auth-required', 'Spotify sign-in must be renewed'); }
    };
    const tokenRequest = async body => {
        let answer;
        try { answer = await fetcher('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString(), signal: AbortSignal.timeout(20000) }); }
        catch { throw failure('network', 'Could not reach Spotify authorization'); }
        let data;
        try { data = await answer.json(); } catch { throw failure('invalid-response', 'Spotify authorization returned an unreadable response'); }
        if (!answer.ok) {
            throw failure('auth-required', 'Spotify authorization was rejected. Sign in again.', { reason: 'not-authorized', grantError: data.error, httpStatus: answer.status });
        }
        return data;
    };
    const token = async (force = false) => {
        if (!force && accessToken && accessExpiresAt > now() + 30000) return accessToken;
        if (!refreshUnderway) {
            const generation = authGeneration;
            refreshUnderway = (async () => {
                const refreshToken = readRefresh();
                if (!refreshToken || !clientId()) throw failure('auth-required', 'Connect your Spotify account');
                let data;
                try { data = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId() }); }
                catch (error) { if (generation === authGeneration && error.grantError === 'invalid_grant') clearTokens(); throw error; }
                if (disposed || generation !== authGeneration) throw failure('auth-required', 'Spotify authorization changed');
                saveTokens(data, refreshToken);
                return accessToken;
            })().finally(() => { refreshUnderway = null; });
        }
        return refreshUnderway;
    };
    const api = async (path, options = {}, retry = true, stagedToken = '') => {
        const bearer = stagedToken || await token();
        let answer;
        try {
            answer = await fetcher(`https://api.spotify.com/v1${path}`, {
                method: options.method || 'GET', headers: { Authorization: `Bearer ${bearer}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
                ...(options.body ? { body: JSON.stringify(options.body) } : {}), signal: AbortSignal.timeout(20000),
            });
        } catch { throw failure('network', 'Could not reach Spotify'); }
        if (answer.status === 401 && retry && !stagedToken) { await token(true); return api(path, options, false); }
        if (!answer.ok) {
            const missingQueueScope = path === '/me/player/queue' && accessScopes && ['user-read-playback-state', 'user-read-currently-playing'].some(scope => !accessScopes.has(scope));
            const code = answer.status === 401 || (answer.status === 403 && missingQueueScope) ? 'auth-required' : answer.status === 403 ? 'not-public' : answer.status === 404 ? 'unavailable' : 'network';
            const retryAfterMs = answer.status === 429 ? Math.max(1000, (Number(answer.headers.get('retry-after')) || 1) * 1000) : undefined;
            throw failure(code, answer.status === 429 ? 'Spotify is limiting requests. Try again shortly.' : answer.status === 403 && missingQueueScope ? 'Reconnect Spotify to grant queue access' : answer.status === 403 ? 'Spotify has not granted access to this content or operation' : `Spotify request failed (${answer.status})`, { httpStatus: answer.status, ...(retryAfterMs ? { retryAfterMs } : {}) });
        }
        if (answer.status === 204) return null;
        try { const text = await answer.text(); return text ? JSON.parse(text) : null; }
        catch { throw failure('invalid-response', 'Spotify returned an unreadable response'); }
    };
    const getUser = async () => {
        if (!profile) {
            const generation = authGeneration;
            const raw = await api('/me');
            if (!raw?.id) throw failure('invalid-response', 'Spotify did not identify the signed-in account');
            if (disposed || generation !== authGeneration) throw failure('auth-required', 'Spotify authorization changed');
            profile = { id: raw.id, nickname: raw.display_name || raw.id, avatarUrl: raw.images?.[0]?.url || '' };
        }
        return profile;
    };
    const official = createOfficialApi({ api, getUser });
    const closeAttempt = attempt => {
        clearTimeout(attempt.timer);
        if (attempt.server) { attempt.server.close(); attempt.server.closeAllConnections?.(); attempt.server = null; }
        if (activeAttempt === attempt) activeAttempt = null;
    };
    const cancelAttempt = attempt => {
        if (!attempt) return;
        attempt.state = { state: 'expired' };
        closeAttempt(attempt);
    };
    const startLogin = async () => {
        if (!/^[A-Za-z0-9]{32}$/.test(clientId())) throw failure('unavailable', 'Set your public Spotify Client ID in the connection settings first', { reason: 'not-configured' });
        cancelAttempt(activeAttempt);
        const attempt = { key: randomBytes(24).toString('base64url'), verifier: randomBytes(64).toString('base64url'), state: { state: 'waiting' }, generation: authGeneration, pending: false };
        attempt.oauthState = randomBytes(32).toString('base64url');
        const server = http.createServer(async (request, response) => {
            response.setHeader('Content-Type', 'text/plain; charset=utf-8');
            response.setHeader('Cache-Control', 'no-store');
            const callback = new URL(request.url || '/', 'http://127.0.0.1');
            if (request.method !== 'GET' || callback.pathname !== '/callback') { response.writeHead(404); response.end('Not found'); return; }
            if (!equal(callback.searchParams.get('state'), attempt.oauthState)) { response.writeHead(400); response.end('Invalid authorization state'); return; }
            if (attempt.pending || attempt !== activeAttempt) { response.writeHead(409); response.end('Authorization attempt already finished'); return; }
            if (callback.searchParams.get('error')) {
                attempt.state = { state: 'error', message: 'Spotify authorization was not approved' };
                response.writeHead(400); response.end('Spotify connection was not approved. Return to the app.'); closeAttempt(attempt); return;
            }
            const code = callback.searchParams.get('code');
            if (!code || code.length > 2048) { response.writeHead(400); response.end('Missing authorization code'); return; }
            attempt.pending = true;
            try {
                const data = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: attempt.redirectUri, client_id: clientId(), code_verifier: attempt.verifier });
                if (disposed || attempt !== activeAttempt || attempt.generation !== authGeneration) throw failure('auth-required', 'Spotify sign-in was canceled');
                if (typeof data.access_token !== 'string' || !data.access_token) throw failure('invalid-response', 'Spotify did not return an access token');
                const raw = await api('/me', {}, false, data.access_token);
                if (!raw?.id) throw failure('invalid-response', 'Spotify did not identify the signed-in account');
                if (disposed || attempt !== activeAttempt || attempt.generation !== authGeneration) throw failure('auth-required', 'Spotify sign-in was canceled');
                saveTokens(data);
                authGeneration++;
                profile = { id: raw.id, nickname: raw.display_name || raw.id, avatarUrl: raw.images?.[0]?.url || '' };
                attempt.state = { state: 'confirmed' };
                response.writeHead(200); response.end('Spotify connected. You can close this browser tab and return to the player.');
            } catch (error) {
                if (attempt === activeAttempt) attempt.state = { state: 'error', message: error.message || 'Spotify connection failed' };
                response.writeHead(500); response.end('Spotify connection could not be completed. Return to the app for details.');
            } finally { closeAttempt(attempt); }
        });
        try {
            await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
        } catch { server.close(); throw failure('unavailable', 'Could not open the local Spotify callback', { reason: 'cannot-listen' }); }
        server.unref();
        attempt.server = server;
        attempt.redirectUri = `http://127.0.0.1:${server.address().port}/callback`;
        const authorizeUrl = new URL('https://accounts.spotify.com/authorize');
        authorizeUrl.search = new URLSearchParams({ client_id: clientId(), response_type: 'code', redirect_uri: attempt.redirectUri,
            state: attempt.oauthState, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(attempt.verifier).digest('base64url'), scope: SCOPES.join(' ') }).toString();
        attempt.url = authorizeUrl.href;
        attempt.timer = setTimeout(() => cancelAttempt(attempt), oauthTimeoutMs); attempt.timer.unref();
        attempts.set(attempt.key, attempt);
        while (attempts.size > 8) attempts.delete(attempts.keys().next().value);
        activeAttempt = attempt;
        return { key: attempt.key, expiresInMs: oauthTimeoutMs };
    };
    const perform = async (operation, params) => {
        if (disposed) throw failure('unavailable', 'Spotify connection is closed');
        if (!params || typeof params !== 'object' || Array.isArray(params)) throw failure('unsupported', 'Invalid Spotify operation parameters');
        switch (operation) {
            case 'configure': {
                if (typeof params.clientId !== 'string' || !/^[A-Za-z0-9]{32}$/.test(params.clientId.trim())) throw failure('unsupported', 'Spotify Client ID must contain 32 letters or numbers');
                if (params.clientId.trim() !== clientId()) { cancelAttempt(activeAttempt); clearTokens(); store.set(CONFIG_KEY, params.clientId.trim()); }
                return { configured: true, clientId: clientId(), encryptionAvailable: encryptionAvailable() };
            }
            case 'connection_status': return { configured: Boolean(clientId()), clientId: clientId(), encryptionAvailable: encryptionAvailable(), connected: Boolean(store?.get(TOKEN_KEY)),
                setupUrl: 'https://developer.spotify.com/dashboard', redirectUri: 'http://127.0.0.1/callback' };
            case 'login_start': return startLogin();
            case 'login_open': {
                const attempt = attempts.get(params.key);
                if (!attempt || attempt !== activeAttempt) throw failure('auth-required', 'Spotify sign-in attempt expired');
                await shell.openExternal(attempt.url); return true;
            }
            case 'login_check': return attempts.get(params.key)?.state || { state: 'expired' };
            case 'login_cancel': cancelAttempt(attempts.get(params.key)); return true;
            case 'login_status': return store?.get(TOKEN_KEY) ? getUser() : null;
            case 'logout': cancelAttempt(activeAttempt); clearTokens(); return true;
            case 'query': return official.query(params.name, params.variables);
            case 'library': case 'playlist_edit': case 'playlist_create': return official.mutate(operation, params);
            case 'playback_snapshot': return native('snapshot');
            case 'playback_action': return native(params.action, params.action === 'play-track' || (params.action === 'play' && params.uri !== undefined) ? params.uri : params.value, params.contextUri);
            default: throw failure('unsupported', 'This operation is not available in the official Spotify integration');
        }
    };
    return {
        async request(operation, params = {}) {
            try { return { ok: true, data: await perform(operation, params) }; }
            catch (error) { return { ok: false, error: { code: error.code || 'network', message: error.message || 'Spotify request failed',
                ...(error.reason ? { reason: error.reason } : {}), ...(error.httpStatus ? { httpStatus: error.httpStatus } : {}), ...(error.retryAfterMs ? { retryAfterMs: error.retryAfterMs } : {}) } }; }
        },
        dispose() { disposed = true; cancelAttempt(activeAttempt); accessToken = ''; accessScopes = null; profile = null; },
    };
}

module.exports = { createSpotifyDesktopBridge };
