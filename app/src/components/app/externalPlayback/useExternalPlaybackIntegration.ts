import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { PlayerState } from '../../../types';
import type { LyricData, SongResult } from '../../../types';
import { loadOnlineSongLyrics } from '../../../services/onlinePlayback';
import type { ExternalPlaybackSnapshot } from '../../../types/onlineMusic';
import { omni } from '../../../services/onlineMusic/omni';
import { setAudioSrc, setCachedCoverUrl, setDuration, setPlayerState, usePlaybackStore } from '../../../stores/usePlaybackStore';
import { setStatusMessage } from '../../../stores/useStatusMessageStore';
import { currentTime } from '../../../stores/motionSignals';
import { useAudioSettingsStore } from '../../../stores/useAudioSettingsStore';
import { useOnlineProviderAccountStore } from '../../../stores/useOnlineProviderAccountStore';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';
import { makeSongCurrent, dropPlaysInFlight, startOfAskedSong } from '../playback/currentSong';
import { attachExternalPlaybackRuntime, getExternalWatchSong, observeExternalPlayback, usesExternalQueue } from './externalPlaybackRuntime';
import { useExternalPlaybackSync } from './useExternalPlaybackSync';
import { useExternalPlaybackQueue } from './useExternalPlaybackQueue';

// Attaches desktop observations to the existing song, queue, controls, and lyric timeline.
export function useExternalPlaybackIntegration(options: {
    audioRef: RefObject<HTMLAudioElement | null>;
    abortTransition(): void;
    setLyrics(lyrics: LyricData | null): void;
    setIsLyricsLoading(loading: boolean): void;
    persistSession(song: SongResult, queue: SongResult[]): Promise<void>;
}) {
    const currentSong = usePlaybackStore(state => state.currentSong);
    const connectedProviderId = useOnlineProviderAccountStore(state => state.accounts[state.activeProviderId]?.status === 'authenticated'
        && state.accounts[state.activeProviderId]?.user ? state.activeProviderId : undefined);
    const live = useRef(options); live.current = options;
    const lyricRevision = useRef(0);
    useExternalPlaybackQueue(currentSong, Boolean(window.electron && usesExternalQueue(currentSong)));
    useEffect(() => {
        const onSnapshot = async (next: ExternalPlaybackSnapshot, outsideChange: boolean) => {
            if (outsideChange && next.currentSong) {
                if (next.state === 'playing') {
                    dropPlaysInFlight();
                    live.current.abortTransition();
                }
                live.current.audioRef.current?.pause();
                setAudioSrc(null);
                const previous = usePlaybackStore.getState().currentSong;
                if (!previous || getPlaybackSongKey(previous) !== getPlaybackSongKey(next.currentSong)) {
                    makeSongCurrent(next.currentSong);
                    setCachedCoverUrl(null);
                    live.current.setLyrics(null);
                    live.current.setIsLyricsLoading(true);
                    const key = getPlaybackSongKey(next.currentSong);
                    const revision = ++lyricRevision.current;
                    const askedStart = startOfAskedSong();
                    const isCurrent = () => {
                        const shown = usePlaybackStore.getState().currentSong;
                        return revision === lyricRevision.current && askedStart === startOfAskedSong() && Boolean(shown && getPlaybackSongKey(shown) === key);
                    };
                    void loadOnlineSongLyrics(next.currentSong, null, undefined, {
                        isCurrent,
                        onLyrics: lyrics => { if (isCurrent()) live.current.setLyrics(lyrics); },
                        onDone: () => { if (isCurrent()) live.current.setIsLyricsLoading(false); },
                    }).catch(() => { if (isCurrent()) live.current.setIsLyricsLoading(false); });
                    void live.current.persistSession(next.currentSong, usePlaybackStore.getState().playQueue);
                }
            }
            const song = usePlaybackStore.getState().currentSong;
            if (!song || !omni.hasExternalPlayback(song)) return;
            if (!['ready', 'empty'].includes(next.availability)) {
                setPlayerState(PlayerState.PAUSED);
                return;
            }
            const audio = useAudioSettingsStore.getState();
            // An app mute keeps its previous level so unmuting can restore it.
            if ((next.volume > 0 || !audio.isMuted) && next.volume !== audio.volume) audio.handleSetVolume(next.volume);
            if (next.volume > 0 && audio.isMuted) audio.handleSetMuted(false);
            setDuration(next.durationMs / 1000);
            currentTime.set(next.positionMs / 1000);
            setPlayerState(next.state === 'playing' ? PlayerState.PLAYING : PlayerState.PAUSED);
            // shortcut: The desktop transport exposes no reliable end event; use manual Next for mixed queues until it does.
        };
        const detach = attachExternalPlaybackRuntime({
            pauseLocal: passive => { if (!passive) live.current.abortTransition(); live.current.audioRef.current?.pause(); }, onSnapshot,
        });
        return () => { lyricRevision.current++; detach(); };
    }, []);
    const candidate = currentSong && omni.hasExternalPlayback(currentSong) ? currentSong : getExternalWatchSong();
    const watched = candidate && omni.hasExternalPlayback(candidate) ? candidate : null;
    const discoveryProviderId = !watched && connectedProviderId && omni.providerHasExternalPlayback(connectedProviderId) ? connectedProviderId : undefined;
    useExternalPlaybackSync({ song: watched, providerId: discoveryProviderId, enabled: Boolean((watched || discoveryProviderId) && window.electron),
        onSnapshot: (next, revision) => {
            const playback = usePlaybackStore.getState();
            if (!watched && ((next.state !== 'playing' && (next.state !== 'paused' || playback.currentSong)) || playback.playerState === PlayerState.PLAYING
                || playback.isLoadingToPlay || playback.activePlaybackContext !== 'main')) return;
            return observeExternalPlayback(next, revision);
        },
        onError: error => { setStatusMessage({ type: 'error', text: error instanceof Error ? error.message : 'Desktop playback is unavailable' }); } });
}
