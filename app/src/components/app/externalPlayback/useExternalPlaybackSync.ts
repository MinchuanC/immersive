import { useEffect, useRef } from 'react';
import type { SongResult } from '../../../types';
import type { ExternalPlaybackSnapshot, OnlineProviderId } from '../../../types/onlineMusic';
import { omni } from '../../../services/onlineMusic/omni';
import { getExternalIntentRevision } from './externalPlaybackRuntime';

// Polls the existing provider boundary without per-frame React state or a second player UI.
interface ExternalPlaybackSyncOptions {
    /** Keep the last external song here while local audio plays to detect outside source changes. */
    song: SongResult | null;
    providerId?: OnlineProviderId;
    enabled: boolean;
    onSnapshot(snapshot: ExternalPlaybackSnapshot, revision: number): void | Promise<void>;
    onError?(error: unknown): void;
}

export function useExternalPlaybackSync(options: ExternalPlaybackSyncOptions): void {
    const current = useRef(options);
    current.current = options;
    const providerId = options.song?.sourceRef?.kind === 'online' ? options.song.sourceRef.providerId : options.providerId;
    useEffect(() => {
        if (!options.enabled || !providerId) return;
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            const song = current.current.song;
            if (!current.current.enabled || stopped) return;
            const revision = getExternalIntentRevision();
            try {
                const snapshot = song ? await omni.getExternalPlaybackSnapshot(song) : await omni.getProviderExternalPlaybackSnapshot(providerId);
                if (!snapshot) return;
                if (!stopped && revision === getExternalIntentRevision()) await current.current.onSnapshot(snapshot, revision);
            } catch (error) { if (!stopped) current.current.onError?.(error); }
            if (!stopped) timer = setTimeout(poll, document.hidden ? 2500 : 700);
        };
        void poll();
        return () => { stopped = true; clearTimeout(timer); };
    }, [options.enabled, providerId]);
}
