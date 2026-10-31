import { registerOnlineMusicProvider } from '@/services/onlineMusic/providerRegistry';
import type { UnifiedSong } from '@/types';

// Generic cache ownership remains testable without restoring the removed private audio adapter.
export const installKeptAudioFixture = (request: (operation: string, params: unknown) => Promise<{ ok: boolean; data: boolean }>) => {
    registerOnlineMusicProvider({
        id: 'kept-test', displayName: 'Kept audio fixture',
        capabilities: { search: false, playback: true, lyrics: false, auth: false, userLibrary: false, playlists: false, albums: false, artists: false, recommendations: false, mutations: false, wordByWordLyrics: false },
        normalizeSong: raw => raw as UnifiedSong,
        playback: {
            getSongDetail: async () => null, getAudioSource: async () => null,
            hasKeptAudio: async url => (await request('audio_kept', { url })).data,
            keepAudio: async url => (await request('audio_keep', { url, limitBytes: 4096 })).data,
        },
    });
};
