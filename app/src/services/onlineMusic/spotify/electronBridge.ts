import type { SpotifyBridgeResult, SpotifyOperation, SpotifyParams } from './spotifyTransport';

export interface SpotifyElectronBridge {
    spotifyRequest(operation: SpotifyOperation, params?: SpotifyParams): Promise<SpotifyBridgeResult>;
}
