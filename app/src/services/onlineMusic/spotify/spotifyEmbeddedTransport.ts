import { OnlineProviderError } from '../../../types/onlineMusic';
import type { SpotifyBridgeResult, SpotifyParams } from './spotifyTransport';
export type { SpotifyWireLoginStart } from './spotifyTransport';

export type SpotifyEmbeddedOperation = 'login_start' | 'login_open' | 'login_check' | 'login_cancel' | 'login_status' | 'logout' | 'audio';

export async function requestSpotifyEmbedded<T = unknown>(operation: SpotifyEmbeddedOperation, params: SpotifyParams = {}): Promise<T> {
    const request = typeof window !== 'undefined' ? window.electron?.embeddedPlaybackRequest : undefined;
    if (!request) throw new OnlineProviderError('unavailable', 'Spotify immersive playback is unavailable in this app', 'spotify');
    let result: SpotifyBridgeResult;
    try { result = await request('spotify', operation, params); }
    catch { throw new OnlineProviderError('network', 'Spotify immersive playback request failed', 'spotify'); }
    if (!result.ok) throw new OnlineProviderError(result.error.code, result.error.message, 'spotify', result.error, result.error.httpStatus, result.error.retryAfterMs);
    return result.data as T;
}
