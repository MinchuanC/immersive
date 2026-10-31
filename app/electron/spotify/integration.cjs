'use strict';

const { createSpotifyDesktopBridge } = require('../spotifyDesktop/bridge.cjs');
const { createSpotifyApiBridge } = require('./spotifyApiBridge.cjs');
const { SPOTIFY_AUDIO_PRIVILEGED_SCHEME, SPOTIFY_AUDIO_SCHEME } = require('./audio.cjs');

function createSpotifyIntegration({ store, safeStorage, session, shell, openExternal, language,
  createDesktop = createSpotifyDesktopBridge, createEmbedded = createSpotifyApiBridge }) {
  let network = null;
  const fetch = async (input, init) => {
    if (!network) {
      const partition = session.fromPartition('folia-spotify');
      network = partition.setProxy({ mode: 'system' }).catch(() => {}).then(() => partition);
    }
    return (await network).fetch(input instanceof URL ? input.href : input, { ...init, credentials: 'omit' });
  };
  const desktop = createDesktop({ store, safeStorage, shell, fetch });
  const embedded = createEmbedded({ store, safeStorage, fetch, openExternal, language, signInScope: 'streaming user-read-private' });
  const registerIpc = (ipcMain, isTrusted) => {
    const register = (channel, request) => ipcMain.handle(channel, (event, operation, params) => {
      if (!isTrusted(event.sender)) return { ok: false, error: { code: 'unavailable', message: 'Untrusted Spotify request' } };
      return request(operation, params);
    });
    register('spotify-api-request', (operation, params) => desktop.request(operation, params));
    ipcMain.handle('embedded-playback-request', (event, providerId, operation, params) => {
      if (!isTrusted(event.sender)) return { ok: false, error: { code: 'unavailable', message: 'Untrusted Spotify request' } };
      if (providerId !== 'spotify') return { ok: false, error: { code: 'unsupported', message: 'Unsupported embedded playback provider' } };
      return embedded.requestEmbedded(operation, params);
    });
  };
  return {
    registerIpc,
    registerProtocol: protocol => protocol.handle(SPOTIFY_AUDIO_SCHEME, request => embedded.handleAudioRequest(request)),
    shutdownBridge: embedded,
    dispose: () => desktop.dispose(),
  };
}

module.exports = { createSpotifyIntegration, SPOTIFY_AUDIO_PRIVILEGED_SCHEME };
