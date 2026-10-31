import { describe, expect, it } from 'vitest';
import { omni } from '@/services/onlineMusic/omni';
import type { SongResult } from '@/types';
import type { OnlineMusicProvider } from '@/types/onlineMusic';
import { registerOnlineMusicProvider, unregisterOnlineMusicProvider } from '@/services/onlineMusic/providerRegistry';
import { loadSongScore } from '@/services/immersion/songScore';
import { makeProfile } from '../automix/trackProfileFixture';

describe('online immersion capability', () => {
    it('resolves a stable Spotify adapter and rejects unsupported recordings', () => {
        const spotify = { id: 'one', name: 'One', artists: [], durationMs: 1,
            album: { id: 'album', name: 'Album', catalogRef: { providerId: 'spotify', kind: 'album', id: 'album' } },
            sourceRef: { kind: 'online', providerId: 'spotify', mediaId: 'one' } } as SongResult;
        const adapter = omni.getImmersionForSong(spotify);
        expect(adapter).toBeTruthy();
        expect(omni.getImmersionForSong(spotify)).toBe(adapter);
        expect(adapter?.albumKey(spotify)).toBe('spotify:album:album');
        expect(adapter?.albumKey({ ...spotify, album: { id: 'album', name: 'Album' } })).toBeNull();
        expect(omni.getImmersionForSong({ ...spotify, sourceRef: { kind: 'local', mediaId: 'one' } })).toBeNull();
    });

    it('routes measured score analysis through the registered provider', async () => {
        const song = { id: 'one', name: 'One', artists: [], durationMs: 120000,
            album: { id: 'album', name: 'Album' },
            sourceRef: { kind: 'online', providerId: 'qq', mediaId: 'one' } } as SongResult;
        const profile = makeProfile({ duration: 120, leadIn: 4, sections: [20, 60], bodyOut: 12, leadOut: 2 });
        const input = { audioSrc: 'provider-audio', signal: new AbortController().signal };
        let received: typeof input | undefined;
        const provider = { id: 'qq', immersion: { analyseScore: async (_song: SongResult, value: typeof input) => {
            received = value;
            return { profile, energy: Array(120).fill(0.5), evidence: { kind: 'online-stream-analysis', providerId: 'qq', profileVersion: profile.version }, motifSeedSalt: 'energy' };
        } } } as unknown as OnlineMusicProvider;
        registerOnlineMusicProvider(provider);
        try {
            const score = await loadSongScore(song, undefined, input);
            expect(received).toBe(input);
            expect(score?.evidence).toEqual({ kind: 'online-stream-analysis', providerId: 'qq', profileVersion: profile.version });
        } finally { unregisterOnlineMusicProvider('qq'); }
    });
});
