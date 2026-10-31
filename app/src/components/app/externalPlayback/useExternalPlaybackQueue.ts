import { useEffect } from 'react';
import type { SongResult } from '../../../types';
import { OnlineProviderError } from '../../../types/onlineMusic';
import { omni } from '../../../services/onlineMusic/omni';
import { usePlaybackStore } from '../../../stores/usePlaybackStore';
import { useOnlineProviderAccountStore } from '../../../stores/useOnlineProviderAccountStore';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';
import { getExternalIntentRevision, usesExternalQueue } from './externalPlaybackRuntime';
import { useExternalPlaybackStore } from './useExternalPlaybackStore';

// Queue networking never blocks the native clock or transport acknowledgements.
export function useExternalPlaybackQueue(song: SongResult | null, enabled: boolean) {
    const key = song ? getPlaybackSongKey(song) : null;
    const providerId = song?.sourceRef?.kind === 'online' ? song.sourceRef.providerId : undefined;
    const user = useOnlineProviderAccountStore(state => providerId ? state.accounts[providerId]?.user : null);
    useEffect(() => {
        useExternalPlaybackStore.setState({ queue: null, queueStatus: enabled ? 'loading' : 'unavailable' });
        if (!enabled || !song) return;
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        let checkedConnection = false;
        const isCurrent = () => {
            const shown = usePlaybackStore.getState().currentSong;
            return !stopped && shown && usesExternalQueue(shown) && getPlaybackSongKey(shown) === key;
        };
        const poll = async () => {
            const revision = getExternalIntentRevision();
            let delay = 5000;
            try {
                if (!checkedConnection && providerId) {
                    const connection = await omni.getExternalPlaybackConnectionStatus(providerId);
                    if (!isCurrent()) return;
                    checkedConnection = true;
                    if (connection && (!connection.configured || !connection.connected)) {
                        useExternalPlaybackStore.setState({ queue: null, queueStatus: connection.configured ? 'connect' : 'setup' });
                        return;
                    }
                }
                const answer = await omni.getExternalPlaybackQueue(song);
                if (!isCurrent()) return;
                if (revision !== getExternalIntentRevision()) {
                    useExternalPlaybackStore.setState({ queue: null, queueStatus: 'loading' });
                    timer = setTimeout(poll, 500);
                    return;
                }
                const matches = answer.currentSong && getPlaybackSongKey(answer.currentSong) === key;
                useExternalPlaybackStore.setState({ queue: matches ? [answer.currentSong!, ...answer.songs] : null, queueStatus: matches ? 'ready' : answer.currentSong ? 'mismatch' : 'no-current' });
            } catch (error) {
                if (!isCurrent()) return;
                const code = error instanceof OnlineProviderError ? error.code : null;
                const queueStatus = error instanceof OnlineProviderError && error.httpStatus === 429 ? 'rate-limited' : code === 'auth-required' ? 'reconnect' : code === 'not-public' ? 'denied' : code === 'unsupported' ? 'unsupported' : 'unavailable';
                useExternalPlaybackStore.setState({ queue: null, queueStatus });
                if (queueStatus !== 'unavailable' && queueStatus !== 'rate-limited') return;
                if (error instanceof OnlineProviderError) delay = Math.max(delay, error.retryAfterMs ?? 0);
            }
            if (!stopped) timer = setTimeout(poll, delay);
        };
        void poll();
        return () => { stopped = true; clearTimeout(timer); useExternalPlaybackStore.setState({ queue: null, queueStatus: 'unavailable' }); };
    }, [key, enabled, user]);
}
