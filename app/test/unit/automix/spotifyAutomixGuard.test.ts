import { describe, expect, it, vi } from 'vitest';
import type { SongResult } from '@/types';
import { mayAutomixSong } from '@/services/automix/useAutomixDecks';

vi.mock('@/services/onlineMusic/omni', () => ({ omni: { hasExternalPlayback: () => false } }));

const song = (providerId: 'spotify' | 'netease'): SongResult => ({
    id: 'a', name: 'Song', artists: [], album: { id: '', name: '' }, durationMs: 1000,
    sourceRef: { kind: 'online', providerId, mediaId: 'a' },
});

describe('automix source boundary', () => {
    it('rejects Spotify as either the outgoing or incoming source even for embedded playback', () => {
        expect(mayAutomixSong(song('spotify'))).toBe(false);
        expect(mayAutomixSong(song('netease'))).toBe(true);
    });
});
