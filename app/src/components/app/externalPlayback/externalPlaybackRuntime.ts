import type { SongResult, StatusMessage } from '../../../types';
import type { ExternalPlaybackAction, ExternalPlaybackContext, ExternalPlaybackSnapshot } from '../../../types/onlineMusic';
import { omni } from '../../../services/onlineMusic/omni';
import { usePlaybackStore } from '../../../stores/usePlaybackStore';
import { currentTime } from '../../../stores/motionSignals';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';
import { createExternalPlaybackOwnership } from './externalPlaybackOwnership';
import { useExternalPlaybackStore } from './useExternalPlaybackStore';
import { setStatusMessage } from '../../../stores/useStatusMessageStore';
import i18n from '../../../i18n/config';

// A single source handoff and clock shared by Folia's existing controls, queue, and visualizer.
let watchedSong: SongResult | null = null;
let snapshot: ExternalPlaybackSnapshot | null = null;
let acknowledgedSnapshot: ExternalPlaybackSnapshot | null = null;
let queueOwned = false;
let queueRevision = 0;
let handoffs = 0;
let intentRevision = 0;
let allowPausedAdoption = true;
let pauseLocal: (passive?: boolean) => void | Promise<void> = () => {};
let onSnapshot: (snapshot: ExternalPlaybackSnapshot, outsideChange: boolean) => void | Promise<void> = () => {};
const ownership = createExternalPlaybackOwnership({ pauseLocal: passive => pauseLocal(passive),
    playExternal: (song, context) => context ? omni.playExternalSong(song, context) : omni.playExternalSong(song), commandExternal: (song, action, value) => omni.commandExternalPlayback(song, action, value) });
let pendingFeedback: StatusMessage | null = null;

const clearPendingFeedback = () => {
    const pending = pendingFeedback;
    pendingFeedback = null;
    if (pending) setStatusMessage(previous => previous === pending ? null : previous);
};

const syncNativeModes = (next: ExternalPlaybackSnapshot) => {
    const held = useExternalPlaybackStore.getState();
    const queue = usePlaybackStore.getState().playQueue;
    const nextKey = next.currentSong ? getPlaybackSongKey(next.currentSong) : null;
    if (held.context && nextKey && queue && !queue.some(song => getPlaybackSongKey(song) === nextKey)) {
        useExternalPlaybackStore.setState({ context: null });
    }
    if (held.shuffle !== next.shuffle || held.repeat !== next.repeat) {
        useExternalPlaybackStore.setState({ shuffle: next.shuffle, repeat: next.repeat });
    }
};

export function attachExternalPlaybackRuntime(ports: { pauseLocal(passive?: boolean): void | Promise<void>; onSnapshot(snapshot: ExternalPlaybackSnapshot, outsideChange: boolean): void | Promise<void> }) {
    pauseLocal = ports.pauseLocal; onSnapshot = ports.onSnapshot;
    return () => { pauseLocal = () => {}; onSnapshot = () => {}; };
}
export const getExternalWatchSong = () => watchedSong;
export const ownsExternalQueue = () => queueOwned;
export const usesExternalQueue = (song: SongResult | null | undefined) => Boolean(song && omni.hasExternalPlayback(song) && !queueOwned);
export const getExternalIntentRevision = () => intentRevision;
export async function stopOwnedLocalPlayback(): Promise<void> { intentRevision++; await pauseLocal(); }
export const claimAppQueue = () => { queueRevision++; queueOwned = true; useExternalPlaybackStore.setState({ context: null }); };

export async function startExternalSong(song: SongResult, isCurrent: () => boolean, context?: ExternalPlaybackContext): Promise<ExternalPlaybackSnapshot> {
    clearPendingFeedback();
    allowPausedAdoption = true;
    const queueAtStart = queueRevision;
    intentRevision++;
    handoffs++;
    try {
        watchedSong = song;
        const next = await ownership.playExternal(song, isCurrent, context);
        if (isCurrent()) {
            const appliedContext = queueAtStart === queueRevision ? context : undefined;
            snapshot = acknowledgedSnapshot = next; queueOwned = !appliedContext;
            useExternalPlaybackStore.setState({ context: appliedContext ?? null, shuffle: next.shuffle, repeat: next.repeat });
        }
        return next;
    } finally { handoffs--; }
}

export async function prepareLocalPlayback(): Promise<boolean> {
    clearPendingFeedback();
    intentRevision++;
    handoffs++;
    try {
        const wasExternal = ownership.owner() === 'external';
        await ownership.playLocal(() => {}); queueOwned = false; allowPausedAdoption = false;
        useExternalPlaybackStore.setState({ context: null, shuffle: false, repeat: false });
        return wasExternal;
    }
    finally { handoffs--; }
}

// Reattach to a saved source without starting music or replacing the desktop's current recording.
export async function restoreExternalSong(song: SongResult, isCurrent: () => boolean): Promise<ExternalPlaybackSnapshot> {
    clearPendingFeedback();
    allowPausedAdoption = true;
    const revision = ++intentRevision;
    handoffs++;
    try {
        watchedSong = song;
        const next = await omni.getExternalPlaybackSnapshot(song);
        if (revision !== intentRevision || !isCurrent()) return next;
        queueOwned = false;
        useExternalPlaybackStore.setState({ context: null });
        if (next.currentSong && getPlaybackSongKey(next.currentSong) === getPlaybackSongKey(song)) {
            snapshot = acknowledgedSnapshot = next;
            syncNativeModes(next);
            await ownership.observe(next, () => revision === intentRevision && isCurrent());
        }
        return next;
    } finally { handoffs--; }
}

export async function observeExternalPlayback(next: ExternalPlaybackSnapshot, revision = intentRevision): Promise<void> {
    if (handoffs || revision !== intentRevision) return;
    const queueAtStart = queueRevision;
    const outsideChange = await ownership.observe(next, () => revision === intentRevision, () => {
        const selected = usePlaybackStore.getState().currentSong;
        return Boolean(allowPausedAdoption && next.state === 'paused' && (!selected || (omni.hasExternalPlayback(selected)
            && selected.sourceRef?.kind === 'online' && next.currentSong?.sourceRef?.kind === 'online'
            && selected.sourceRef.providerId === next.currentSong.sourceRef.providerId)));
    });
    if (revision !== intentRevision) return;
    if (outsideChange && queueAtStart === queueRevision) queueOwned = false;
    snapshot = acknowledgedSnapshot = next;
    syncNativeModes(next);
    if (ownership.owner() === 'external') {
        if (next.currentSong) watchedSong = next.currentSong;
        await onSnapshot(next, outsideChange);
    }
}

export async function commandCurrentExternal(action: ExternalPlaybackAction, value?: number | boolean): Promise<ExternalPlaybackSnapshot | null> {
    const song = usePlaybackStore.getState().currentSong;
    if (!song || !omni.hasExternalPlayback(song)) return null;
    // Updating the shared volume from a native observation must not send that volume back.
    if (action === 'volume' && !handoffs && snapshot?.currentSong && value === snapshot.volume && getPlaybackSongKey(snapshot.currentSong) === getPlaybackSongKey(song)) return snapshot;
    const revision = ++intentRevision;
    const queueAtStart = queueRevision;
    const key = getPlaybackSongKey(song);
    const pending: StatusMessage | null = action === 'volume' ? null : {
        type: 'info', text: i18n.t('status.externalPlaybackPending'), persistent: true,
    };
    if (pending) {
        pendingFeedback = pending;
        setStatusMessage(pending);
    }
    const previousSnapshot = snapshot;
    const optimisticSeek = action === 'seek' && typeof value === 'number' && Number.isFinite(value)
        && previousSnapshot?.currentSong && getPlaybackSongKey(previousSnapshot.currentSong) === key;
    if (optimisticSeek) {
        value = Math.max(0, Math.min(previousSnapshot.durationMs || song.durationMs || Infinity, value as number));
        snapshot = { ...previousSnapshot, positionMs: value, observedAt: Date.now() };
        currentTime.set(value / 1000);
    }
    handoffs++;
    let next: ExternalPlaybackSnapshot;
    try {
        next = await ownership.command(song, action, value);
        acknowledgedSnapshot = next;
    }
    catch (error) {
        const shown = usePlaybackStore.getState().currentSong;
        if (pending && pendingFeedback === pending && revision === intentRevision && shown && key === getPlaybackSongKey(shown)) {
            setStatusMessage(previous => previous === pending ? { type: 'error', text: i18n.t('status.externalPlaybackNotConfirmed') } : previous);
        }
        if (optimisticSeek && revision === intentRevision && shown && key === getPlaybackSongKey(shown)
            && acknowledgedSnapshot?.currentSong && getPlaybackSongKey(acknowledgedSnapshot.currentSong) === key) {
            snapshot = acknowledgedSnapshot;
            currentTime.set(readExternalPlaybackTime() ?? acknowledgedSnapshot.positionMs / 1000);
        }
        throw error;
    }
    finally {
        handoffs--;
        if (pending && pendingFeedback === pending) clearPendingFeedback();
    }
    const shown = usePlaybackStore.getState().currentSong;
    if (revision !== intentRevision || !shown || key !== getPlaybackSongKey(shown)) return null;
    const changedSong = Boolean(next.currentSong && getPlaybackSongKey(next.currentSong) !== key);
    await ownership.observe(next, () => revision === intentRevision);
    if (revision !== intentRevision) return null;
    if (changedSong && queueAtStart === queueRevision) queueOwned = false;
    snapshot = next;
    syncNativeModes(next);
    await onSnapshot(next, changedSong);
    return next;
}

export function readExternalPlaybackTime(): number | null {
    const song = usePlaybackStore.getState().currentSong;
    if (!song || !omni.hasExternalPlayback(song) || !snapshot?.currentSong || getPlaybackSongKey(snapshot.currentSong) !== getPlaybackSongKey(song)) return null;
    const elapsed = snapshot.state === 'playing' ? Math.max(0, Date.now() - snapshot.observedAt) : 0;
    return Math.min(snapshot.durationMs || Infinity, snapshot.positionMs + elapsed) / 1000;
}
