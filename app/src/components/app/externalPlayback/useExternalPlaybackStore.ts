import { create } from 'zustand';
import type { ExternalPlaybackContext } from '../../../types/onlineMusic';
import type { SongResult } from '../../../types';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';
import type { ExternalQueueStatus } from './externalQueueStatus';

// Native collection ownership and the modes actually reported by the external player.
export const useExternalPlaybackStore = create<{
    context: ExternalPlaybackContext | null;
    shuffle: boolean;
    repeat: boolean;
    queue: SongResult[] | null;
    queueStatus: ExternalQueueStatus;
}>(() => ({ context: null, shuffle: false, repeat: false, queue: null, queueStatus: 'unavailable' }));

export const selectVerifiedExternalQueue = (song: SongResult | null, queue: SongResult[] | null): SongResult[] => (
    song && queue?.[0] && getPlaybackSongKey(queue[0]) === getPlaybackSongKey(song) ? queue : []
);
