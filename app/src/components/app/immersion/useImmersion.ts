import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { PlayerState, type LocalSong, type SongResult } from '../../../types';
import type { LocalLibraryAssignment, LocalLibraryEntity } from '../../../types/localLibrary';
import type { AlbumJourney, EditionCue, ImmersionAlbum, ImmersionRecipe, PersonalEdition, SongScore } from '../../../types/immersion';
import { buildImmersionAlbums, completeAlbumJourney, createAlbumJourney, observeJourneyTrack, startAlbumJourney } from '../../../services/immersion/albumJourneys';
import { evaluateEditionRecipe, getPersonalEdition, saveEditionCue, deleteEditionCue } from '../../../services/immersion/personalEditions';
import { evaluateSongScore, loadSongScore } from '../../../services/immersion/songScore';
import { installImmersionDirector } from '../../../services/immersion/director';
import { buildUnifiedLocalSong } from '../../../services/playbackAdapters';
import { getPlaybackAnalysisKey } from '../../../services/playbackRecovery/representationRegistry';
import { getPlaybackSongKey, isLocalPlaybackSong } from '../../../utils/appPlaybackGuards';
import { currentTime } from '../../../stores/motionSignals';
import { usePlaybackStore } from '../../../stores/usePlaybackStore';
import { useVisualizerSettingsStore } from '../../../stores/useVisualizerSettingsStore';
import { useAudioSettingsStore } from '../../../stores/useAudioSettingsStore';
import { useAutomixSettingsStore } from '../../../stores/useAutomixSettingsStore';
import { omni } from '../../../services/onlineMusic/omni';
import type { StageSettings } from '../../../integrations/mineradio/stageBridge';
import type { PlaybackNavigationOptions } from '../../../types/appPlayback';

type Params = {
    song: SongResult | null;
    localSongs: LocalSong[];
    catalog: { entities: LocalLibraryEntity[]; assignments: LocalLibraryAssignment[] };
    playSong: (song: SongResult, queue?: SongResult[], isFmCall?: boolean, options?: PlaybackNavigationOptions) => Promise<void>;
    seek: (time: number) => void;
    isMediaReady: () => boolean;
    onOpenPlayer: () => void;
};

const asSong = (song: LocalSong) => buildUnifiedLocalSong({ localSong: song, matchedSong: null, coverUrl: null, preferOnlineMetadata: false });
const recipeFromSettings = (settings: StageSettings): ImmersionRecipe => ({
    intensity: Math.max(.1, Math.min(1.5, Number(settings.intensity) || .85)),
    sonicGroundAmplitude: Math.max(0, Math.min(100, Number(settings.sonicGroundAmplitude) || 0)),
    sonicGroundMotionSpeed: Math.max(0, Math.min(100, Number(settings.sonicGroundMotionSpeed) || 0)),
    sonicGroundGlow: Math.max(0, Math.min(100, Number(settings.sonicGroundGlow) || 0)),
});

const useAdapterReady = (adapter: ReturnType<typeof omni.getImmersionForSong> | null): boolean => {
    const subscribe = useCallback((listener: () => void) => adapter?.subscribe(listener) ?? (() => {}), [adapter]);
    const getSnapshot = useCallback(() => adapter?.isReady() ?? false, [adapter]);
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export function useImmersion({ song, localSongs, catalog, playSong, seek, isMediaReady, onOpenPlayer }: Params) {
    const [isOpen, setOpen] = useState(false);
    const [scoreEnabled, setScoreEnabled] = useState(false);
    const [score, setScore] = useState<SongScore | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [scoreWaiting, setScoreWaiting] = useState(false);
    const [edition, setEdition] = useState<PersonalEdition | null>(null);
    const [editionEnabled, setEditionEnabled] = useState(false);
    const [journey, setJourneyState] = useState<AlbumJourney | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [saved, setSaved] = useState(false);
    const [label, setLabel] = useState('');
    const [selectedAlbumKey, setSelectedAlbumKey] = useState('');
    const [onlineAlbum, setOnlineAlbum] = useState<{ album: ImmersionAlbum; songs: SongResult[] } | null>(null);
    const [onlineAlbumLoading, setOnlineAlbumLoading] = useState(false);
    const [onlineAlbumError, setOnlineAlbumError] = useState(false);
    const [mediaRevision, setMediaRevision] = useState(0);
    const ownSettings = useRef(false);
    const manualRevision = useRef(0);
    const visualBefore = useRef<{ mode: ReturnType<typeof useVisualizerSettingsStore.getState>['visualizerBackgroundMode']; tuning: StageSettings } | null>(null);
    const journeyBefore = useRef<{ loop: 'off' | 'one' | 'all'; automix: boolean } | null>(null);
    const journeyRef = useRef<AlbumJourney | null>(null);
    const journeyAdapter = useRef<ReturnType<typeof omni.getImmersionForSong> | null>(null);
    const pendingSeek = useRef<{ recording: string; time: number } | null>(null);
    const pendingJourneyTrack = useRef<string | null>(null);
    const journeyRequest = useRef(0);
    const journeyAckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const journeyPlay = useRef<AbortController | null>(null);
    const mediaSeen = useRef<{ key: string; source: string } | null>(null);
    const scoreSource = useRef<string | null>(null);
    const trackKey = song ? getPlaybackSongKey(song) : '';
    const recordingKey = song ? getPlaybackAnalysisKey(song) : '';
    const currentRecordingKey = useRef(recordingKey);
    currentRecordingKey.current = recordingKey;
    const local = isLocalPlaybackSong(song);
    const onlineAdapter = song ? omni.getImmersionForSong(song) ?? null : null;
    const onlineReady = useAdapterReady(onlineAdapter);
    const journeyReady = useAdapterReady(journey?.state === 'running' ? journeyAdapter.current : null);
    const scoreSupported = local || (onlineAdapter !== null && onlineReady);
    const audioSrc = usePlaybackStore(state => state.audioSrc);
    const storeSongKey = usePlaybackStore(state => state.currentSong ? getPlaybackSongKey(state.currentSong) : '');
    const onlineAlbumKey = song && onlineAdapter ? onlineAdapter.albumKey(song) : null;
    const sonicLook = useVisualizerSettingsStore(state => state.visualizerBackgroundMode === 'mineradio' && state.mineradioBackgroundTuning.preset === 7);
    const localAlbums = useMemo(() => buildImmersionAlbums(localSongs, catalog), [localSongs, catalog.entities, catalog.assignments]);
    const currentOnlineAlbum = onlineReady && onlineAlbum?.album.key === onlineAlbumKey ? onlineAlbum : null;
    const albums = useMemo(() => currentOnlineAlbum ? [currentOnlineAlbum.album, ...localAlbums] : localAlbums, [currentOnlineAlbum, localAlbums]);
    const currentAlbum = albums.find(album => album.tracks.some(track => track.trackKey === trackKey));
    const currentAlbumKey = useRef(currentAlbum?.key);
    currentAlbumKey.current = currentAlbum?.key;
    const selectedAlbum = albums.find(album => album.key === selectedAlbumKey) ?? currentAlbum ?? (onlineAdapter && onlineReady ? undefined : albums[0]);
    const setJourney = useCallback((next: AlbumJourney | null) => { journeyRef.current = next; setJourneyState(next); }, []);
    const clearJourneyAck = useCallback(() => {
        if (journeyAckTimer.current !== null) clearTimeout(journeyAckTimer.current);
        journeyAckTimer.current = null;
    }, []);
    const cancelJourneyPlay = useCallback(() => {
        journeyPlay.current?.abort();
        journeyPlay.current = null;
    }, []);

    useEffect(() => {
        if (!isOpen || !onlineAdapter || !onlineReady || !song || !onlineAlbumKey) { setOnlineAlbumLoading(false); return; }
        let cancelled = false;
        setOnlineAlbumLoading(true); setOnlineAlbumError(false);
        void onlineAdapter.loadAlbum(song).then(result => {
            if (!cancelled) setOnlineAlbum(result);
        }).catch(() => { if (!cancelled) { setOnlineAlbum(null); setOnlineAlbumError(true); } })
            .finally(() => { if (!cancelled) setOnlineAlbumLoading(false); });
        return () => { cancelled = true; };
    }, [isOpen, onlineAdapter, onlineReady, onlineAlbumKey]);

    const restoreJourneySettings = useCallback(() => {
        const before = journeyBefore.current;
        journeyBefore.current = null;
        if (!before) return;
        if (useAudioSettingsStore.getState().loopMode === 'off') useAudioSettingsStore.getState().handleSetLoopMode(before.loop);
        if (!useAutomixSettingsStore.getState().automixEnabled) useAutomixSettingsStore.getState().handleToggleAutomix(before.automix);
    }, []);

    const activateVisuals = useCallback(() => {
        const state = useVisualizerSettingsStore.getState();
        if (!visualBefore.current) visualBefore.current = { mode: state.visualizerBackgroundMode, tuning: state.mineradioBackgroundTuning };
        ownSettings.current = true;
        try {
            state.handleSetVisualizerBackgroundMode('mineradio');
            state.handleSetMineradioBackgroundTuning({ preset: 7 });
        } finally { ownSettings.current = false; }
        onOpenPlayer();
    }, [onOpenPlayer]);

    const stopVisuals = useCallback(() => {
        setScoreEnabled(false);
        setEditionEnabled(false);
        const before = visualBefore.current;
        visualBefore.current = null;
        if (!before) return;
        ownSettings.current = true;
        try {
            const state = useVisualizerSettingsStore.getState();
            state.handleSetMineradioBackgroundTuning(before.tuning);
            if (before.mode) state.handleSetVisualizerBackgroundMode(before.mode);
            else state.handleResetVisualizerBackgroundMode();
        } finally { ownSettings.current = false; }
    }, []);

    useEffect(() => useVisualizerSettingsStore.subscribe((next, previous) => {
        if (ownSettings.current || (next.mineradioBackgroundTuning === previous.mineradioBackgroundTuning && next.visualizerBackgroundMode === previous.visualizerBackgroundMode)) return;
        // A manual choice wins immediately; saved recipes stay available for explicit replay.
        visualBefore.current = null;
        manualRevision.current += 1;
        setScoreEnabled(false);
        setEditionEnabled(false);
    }), []);

    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();
        scoreSource.current = null;
        setScore(null);
        const waitingForJourney = !local && journey?.state === 'running' && journeyAdapter.current !== null
            && (pendingJourneyTrack.current !== null || journey.index < 0 || journey.trackKeys[journey.index] !== trackKey);
        const waitingForMedia = !local && (!audioSrc || storeSongKey !== trackKey || waitingForJourney || !isMediaReady());
        if (!scoreEnabled || !scoreSupported || !song || waitingForMedia) {
            setScoreWaiting(Boolean(scoreEnabled && scoreSupported && song && waitingForMedia));
            setAnalyzing(false);
            return;
        }
        setScoreWaiting(false);
        setAnalyzing(true);
        void loadSongScore(song, journey?.state === 'running' ? journey.albumKey : undefined, local ? undefined : { audioSrc: audioSrc!, signal: controller.signal }).then(result => { if (!cancelled) { scoreSource.current = local ? null : audioSrc; setScore(result); } }).catch(() => { if (!cancelled) setError(true); }).finally(() => { if (!cancelled) setAnalyzing(false); });
        return () => { cancelled = true; controller.abort(); };
    }, [scoreEnabled, scoreSupported, local, recordingKey, trackKey, storeSongKey, audioSrc, mediaRevision, journey?.albumKey, journey?.state, journey?.index]);

    useEffect(() => {
        let cancelled = false;
        setEdition(null);
        setSaved(false);
        if (local && currentAlbum) void getPersonalEdition(currentAlbum.key).then(result => { if (!cancelled) setEdition(result); }).catch(() => { if (!cancelled) setError(true); });
        return () => { cancelled = true; };
    }, [local, currentAlbum?.key]);

    useEffect(() => {
        if (pendingSeek.current && pendingSeek.current.recording !== recordingKey) pendingSeek.current = null;
    }, [recordingKey]);

    const evaluate = useCallback((time: number): ImmersionRecipe | null => {
        if (!scoreSupported) return null;
        return (local && editionEnabled ? evaluateEditionRecipe(edition, recordingKey, time) : null)
            ?? (scoreEnabled && score?.trackKey === trackKey && (local || scoreSource.current === audioSrc) ? evaluateSongScore(score, time) : null);
    }, [scoreSupported, local, editionEnabled, edition, recordingKey, scoreEnabled, score, trackKey, audioSrc]);
    useEffect(() => installImmersionDirector(trackKey, evaluate), [trackKey, evaluate]);

    useEffect(() => {
        const active = journeyRef.current;
        if (!active || active.state !== 'running') return;
        if (pendingJourneyTrack.current) return;
        if (trackKey !== active.trackKeys[active.index] && trackKey !== active.trackKeys[active.index + 1]) {
            setJourney({ ...active, state: 'interrupted' }); restoreJourneySettings();
        }
    }, [trackKey, setJourney, restoreJourneySettings]);
    useEffect(() => usePlaybackStore.subscribe((next, previous) => {
        if (next.playQueue === previous.playQueue) return;
        const active = journeyRef.current;
        if (!active || active.state !== 'running' || pendingJourneyTrack.current) return;
        const observed = observeJourneyTrack(active, next.currentSong ? getPlaybackSongKey(next.currentSong) : '', next.playQueue.map(getPlaybackSongKey));
        if (observed.state === 'interrupted') { setJourney(observed); restoreJourneySettings(); }
    }), [setJourney, restoreJourneySettings]);
    useEffect(() => () => { cancelJourneyPlay(); clearJourneyAck(); restoreJourneySettings(); }, [cancelJourneyPlay, clearJourneyAck, restoreJourneySettings]);
    useEffect(() => {
        const active = journeyRef.current;
        if (active?.state === 'running' && journeyAdapter.current !== null && !journeyReady) {
            clearJourneyAck();
            cancelJourneyPlay();
            pendingJourneyTrack.current = null;
            setJourney({ ...active, state: 'interrupted' }); restoreJourneySettings();
        }
    }, [journeyReady, setJourney, cancelJourneyPlay, clearJourneyAck, restoreJourneySettings]);
    useEffect(() => {
        const checkSettings = () => {
            const active = journeyRef.current;
            if (active?.state !== 'running' || (useAudioSettingsStore.getState().loopMode === 'off' && !useAutomixSettingsStore.getState().automixEnabled)) return;
            cancelJourneyPlay(); clearJourneyAck();
            pendingJourneyTrack.current = null;
            setJourney({ ...active, state: 'interrupted' }); restoreJourneySettings();
        };
        const stopAudio = useAudioSettingsStore.subscribe(checkSettings);
        const stopAutomix = useAutomixSettingsStore.subscribe(checkSettings);
        return () => { stopAudio(); stopAutomix(); };
    }, [setJourney, cancelJourneyPlay, clearJourneyAck, restoreJourneySettings]);

    const save = async (kind: 'look' | 'bookmark', change = 0) => {
        if (!song || !local || !currentAlbum || busy) return;
        if (kind === 'look' && !sonicLook) return;
        setBusy(true); setError(false); setSaved(false);
        const keyAtSave = recordingKey;
        const revisionAtSave = manualRevision.current;
        try {
            const atSec = Math.max(0, currentTime.get());
            const recipe = evaluate(atSec) ?? recipeFromSettings(useVisualizerSettingsStore.getState().mineradioBackgroundTuning);
            const nextRecipe = { ...recipe, intensity: Math.max(.1, Math.min(1.5, recipe.intensity + change)), sonicGroundAmplitude: Math.max(0, Math.min(100, recipe.sonicGroundAmplitude + change * 30)) };
            const result = await saveEditionCue(currentAlbum.key, currentAlbum.name, {
                id: crypto.randomUUID(), trackKey: keyAtSave, atSec, kind, label: label.trim() || song.name,
                ...(kind === 'look' ? { recipe: nextRecipe, seed: score?.seed ?? 0 } : {}),
            });
            if (currentRecordingKey.current === keyAtSave) {
                setEdition(result); setSaved(true); setLabel('');
                if (kind === 'look' && manualRevision.current === revisionAtSave) { activateVisuals(); setEditionEnabled(true); }
            }
        } catch { setError(true); }
        finally { setBusy(false); }
    };

    const startJourney = async (album: ImmersionAlbum, fromIndex = 0) => {
        if (busy) return;
        const isOnlineAlbum = currentOnlineAlbum?.album.key === album.key;
        const current = usePlaybackStore.getState().currentSong;
        const currentAdapter = current ? omni.getImmersionForSong(current) ?? null : null;
        if (isOnlineAlbum && (currentAdapter !== onlineAdapter || !current || currentAdapter?.albumKey(current) !== album.key)) { setError(true); return; }
        const queue = isOnlineAlbum
            ? (currentAdapter?.isReady() && !onlineAlbumLoading ? currentOnlineAlbum.songs : [])
            : album.tracks.map(track => localSongs.find(item => item.id === track.songId)).filter((item): item is LocalSong => !!item).map(asSong);
        if (queue.length !== album.tracks.length || !queue[fromIndex]) { setError(true); return; }
        const request = ++journeyRequest.current;
        cancelJourneyPlay();
        restoreJourneySettings();
        journeyBefore.current = { loop: useAudioSettingsStore.getState().loopMode, automix: useAutomixSettingsStore.getState().automixEnabled };
        useAudioSettingsStore.getState().handleSetLoopMode('off');
        useAutomixSettingsStore.getState().handleToggleAutomix(false);
        journeyAdapter.current = isOnlineAlbum ? currentAdapter : null;
        const next = startAlbumJourney(createAlbumJourney(album));
        // Recovery restarts the interrupted chapter; it does not claim a precise unheard position.
        setJourney(fromIndex ? { ...next, index: fromIndex - 1 } : next);
        pendingJourneyTrack.current = album.tracks[fromIndex].trackKey;
        clearJourneyAck();
        if (isOnlineAlbum) {
            journeyAckTimer.current = setTimeout(() => {
                const active = journeyRef.current;
                if (journeyRequest.current !== request || !pendingJourneyTrack.current || active?.state !== 'running') return;
                journeyRequest.current += 1;
                cancelJourneyPlay();
                pendingJourneyTrack.current = null;
                journeyAckTimer.current = null;
                setJourney({ ...active, state: 'interrupted' });
                restoreJourneySettings(); stopVisuals(); setBusy(false); setError(true);
            }, 30_000);
        }
        setBusy(true); setError(false);
        activateVisuals(); setScoreEnabled(true);
        try {
            if (isOnlineAlbum) {
                const controller = new AbortController();
                journeyPlay.current = controller;
                await playSong(queue[fromIndex], queue, false, { signal: controller.signal });
            } else {
                await playSong(queue[fromIndex], queue);
            }
            if (journeyRequest.current !== request) return;
            const live = usePlaybackStore.getState();
            if (!live.currentSong || getPlaybackSongKey(live.currentSong) !== album.tracks[fromIndex].trackKey) {
                clearJourneyAck();
                cancelJourneyPlay();
                pendingJourneyTrack.current = null;
                setJourney({ ...next, state: 'interrupted' }); restoreJourneySettings();
            }
        } catch {
            if (journeyRequest.current === request) { cancelJourneyPlay(); clearJourneyAck(); pendingJourneyTrack.current = null; setJourney({ ...next, state: 'interrupted' }); restoreJourneySettings(); setError(true); }
        }
        finally { if (journeyRequest.current === request) setBusy(false); }
    };

    const onEnded = (endedSong: SongResult | null): boolean => {
        const active = journeyRef.current;
        if (!active || !endedSong) return false;
        if (active.state === 'running' && journeyAdapter.current && !journeyAdapter.current.isReady()) {
            cancelJourneyPlay(); clearJourneyAck(); pendingJourneyTrack.current = null;
            setJourney({ ...active, state: 'interrupted' }); restoreJourneySettings();
            return false;
        }
        const completed = completeAlbumJourney(active, getPlaybackSongKey(endedSong));
        if (completed.state !== 'completed' || active.state !== 'running') return false;
        setJourney(completed); restoreJourneySettings();
        usePlaybackStore.getState().setPlayerState(PlayerState.PAUSED);
        return true;
    };

    const onPlaying = (acknowledged: SongResult | null) => {
        const live = usePlaybackStore.getState();
        const key = acknowledged ? getPlaybackSongKey(acknowledged) : '';
        if (key && live.currentSong && getPlaybackSongKey(live.currentSong) === key && live.audioSrc && isMediaReady()
            && (mediaSeen.current?.key !== key || mediaSeen.current.source !== live.audioSrc)) {
            mediaSeen.current = { key, source: live.audioSrc };
            setMediaRevision(value => value + 1);
        }
        const active = journeyRef.current;
        if (!active || active.state !== 'running') return;
        if (journeyAdapter.current && !journeyAdapter.current.isReady()) {
            clearJourneyAck();
            cancelJourneyPlay();
            pendingJourneyTrack.current = null;
            setJourney({ ...active, state: 'interrupted' }); restoreJourneySettings();
            return;
        }
        if (pendingJourneyTrack.current && key !== pendingJourneyTrack.current) {
            cancelJourneyPlay(); clearJourneyAck(); pendingJourneyTrack.current = null;
            setJourney({ ...active, state: 'interrupted' }); restoreJourneySettings();
            return;
        }
        clearJourneyAck(); journeyPlay.current = null; pendingJourneyTrack.current = null;
        const next = observeJourneyTrack(active, acknowledged ? getPlaybackSongKey(acknowledged) : '', usePlaybackStore.getState().playQueue.map(getPlaybackSongKey));
        setJourney(next);
        if (next.state === 'interrupted') restoreJourneySettings();
    };

    const takePendingSeek = (acknowledged: SongResult | null): number | null => {
        const pending = pendingSeek.current;
        if (!pending || !acknowledged || getPlaybackAnalysisKey(acknowledged) !== pending.recording) return null;
        pendingSeek.current = null;
        return pending.time;
    };

    const replay = async (cue: EditionCue) => {
        const target = song && recordingKey === cue.trackKey ? song : localSongs.map(asSong).find(candidate => getPlaybackAnalysisKey(candidate) === cue.trackKey);
        if (!target) { setError(true); return; }
        setError(false);
        activateVisuals(); setEditionEnabled(true);
        if (recordingKey === cue.trackKey && isMediaReady()) { seek(cue.atSec); return; }
        pendingSeek.current = { recording: cue.trackKey, time: cue.atSec };
        setBusy(true);
        try {
            await playSong(target);
            const acknowledged = usePlaybackStore.getState().currentSong;
            if (!acknowledged || getPlaybackAnalysisKey(acknowledged) !== cue.trackKey) { pendingSeek.current = null; setError(true); }
        }
        catch { pendingSeek.current = null; setError(true); }
        finally { setBusy(false); }
    };

    return {
        isOpen, setOpen, song, local, scoreSupported, currentAlbum, albums, selectedAlbum, setSelectedAlbumKey,
        onlineAlbumLoading, onlineAlbumKey, onlineAlbumError: onlineAlbumError || Boolean(onlineAdapter && onlineReady && !onlineAlbumKey),
        canKeepLook: sonicLook,
        scoreEnabled, score, analyzing, scoreWaiting, edition, editionEnabled, journey, busy, error, saved, label, setLabel,
        startScore: () => { setError(false); activateVisuals(); setScoreEnabled(true); }, stopVisuals,
        openImmersiveLyrics: () => { useVisualizerSettingsStore.getState().handleSetVisualizerMode('immersive-lyrics'); setOpen(false); onOpenPlayer(); },
        useEdition: () => { activateVisuals(); setEditionEnabled(true); },
        save, replay, removeCue: async (id: string) => {
            if (!edition || busy) return;
            setBusy(true); setError(false);
            try {
                const result = await deleteEditionCue(edition.id, id);
                if (currentAlbumKey.current === edition.albumKey) setEdition(result);
            } catch { setError(true); } finally { setBusy(false); }
        },
        startJourney: () => selectedAlbum && startJourney(selectedAlbum),
        resumeJourney: () => { const album = albums.find(item => item.key === journey?.albumKey); if (album) void startJourney(album, Math.max(0, journey?.index ?? 0)); },
        leaveJourney: () => { journeyRequest.current += 1; cancelJourneyPlay(); clearJourneyAck(); pendingJourneyTrack.current = null; journeyAdapter.current = null; setJourney(null); setBusy(false); restoreJourneySettings(); stopVisuals(); },
        onPlaying, onEnded, takePendingSeek,
    };
}

export type ImmersionModel = ReturnType<typeof useImmersion>;
