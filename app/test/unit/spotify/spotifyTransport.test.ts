import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestSpotify } from '@/services/onlineMusic/spotify/spotifyTransport';
import { onlineFailureOf } from '@/services/onlineMusic/failure/onlineFailureCase';

// Desktop failure facts must survive IPC so the shared UI can show the right recovery.
afterEach(() => vi.unstubAllGlobals());

describe('Spotify desktop transport failure facts', () => {
    it('preserves a rate limit and its cooldown for shared failure presentation', async () => {
        vi.stubGlobal('window', { electron: { spotifyRequest: async () => ({
            ok: false,
            error: { code: 'network', message: 'Spotify is limiting requests. Try again shortly.', httpStatus: 429, retryAfterMs: 3000 },
        }) } });
        let error: unknown;
        try { await requestSpotify('query', { name: 'fetchLibraryTracks' }); }
        catch (failure) { error = failure; }
        expect(onlineFailureOf({ operation: 'collection', providerId: 'spotify' }, { error })).toMatchObject({
            case: 'retry-later', facts: { httpStatus: 429, retryAfterMs: 3000 },
        });
    });
});
