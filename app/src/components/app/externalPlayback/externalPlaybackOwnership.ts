import type { SongResult } from '../../../types';
import type { ExternalPlaybackAction, ExternalPlaybackContext, ExternalPlaybackSnapshot } from '../../../types/onlineMusic';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';

// Serializes source handoffs so local and external playback never start over one another.
interface OwnershipActions {
    pauseLocal(passive?: boolean): void | Promise<void>;
    playExternal(song: SongResult, context?: ExternalPlaybackContext): Promise<ExternalPlaybackSnapshot>;
    commandExternal(song: SongResult, action: ExternalPlaybackAction, value?: number | boolean): Promise<ExternalPlaybackSnapshot>;
}

export function createExternalPlaybackOwnership(actions: OwnershipActions) {
    let source: 'local' | 'external' = 'local';
    let externalSong: SongResult | null = null;
    let expectedSongKey = '';
    let pending: Promise<unknown> = Promise.resolve();
    let queuedAdjustment: { key: string; action: 'volume' | 'seek'; value?: number | boolean; result: Promise<ExternalPlaybackSnapshot> } | null = null;
    const serialize = <T>(action: () => Promise<T>): Promise<T> => {
        queuedAdjustment = null;
        const result = pending.catch(() => undefined).then(action);
        pending = result;
        return result;
    };
    return {
        owner: () => source,
        playExternal: (song: SongResult, isCurrent: () => boolean = () => true, context?: ExternalPlaybackContext) => serialize(async () => {
            await actions.pauseLocal();
            if (!isCurrent()) throw new Error('Playback request was superseded');
            const snapshot = await (context ? actions.playExternal(song, context) : actions.playExternal(song));
            source = 'external'; externalSong = song; expectedSongKey = getPlaybackSongKey(song);
            if (!isCurrent()) return actions.commandExternal(song, 'pause');
            return snapshot;
        }),
        playLocal: (start: () => void | Promise<void>) => serialize(async () => {
            if (externalSong) {
                const snapshot = await actions.commandExternal(externalSong, 'pause');
                if (snapshot.state === 'playing' || snapshot.availability === 'permission-denied' || snapshot.availability === 'error') {
                    throw new Error('The external player must pause before local playback can start');
                }
            }
            await start(); source = 'local'; externalSong = null; expectedSongKey = '';
        }),
        command: (song: SongResult, action: ExternalPlaybackAction, value?: number | boolean) => {
            if (action !== 'volume' && action !== 'seek') return serialize(() => actions.commandExternal(song, action, value));
            const key = getPlaybackSongKey(song);
            if (queuedAdjustment?.key === key && queuedAdjustment.action === action) {
                queuedAdjustment.value = value;
                return queuedAdjustment.result;
            }
            // Slider updates replace only an unstarted matching adjustment; transport and handoffs stay ordered.
            let request: NonNullable<typeof queuedAdjustment>;
            const result = serialize(() => {
                if (queuedAdjustment === request) queuedAdjustment = null;
                return actions.commandExternal(song, action, request.value);
            });
            request = { key, action, value, result };
            queuedAdjustment = request;
            return result;
        },
        // Returns true when an outside action takes ownership or changes the track: suspend app queue progression.
        observe: (snapshot: ExternalPlaybackSnapshot, isCurrent: () => boolean = () => true, acceptPaused: () => boolean = () => false) => serialize(async () => {
            if (!isCurrent()) return false;
            if (!snapshot.currentSong || (snapshot.state !== 'playing' && source !== 'external' && !acceptPaused())) return false;
            const key = getPlaybackSongKey(snapshot.currentSong);
            const changed = source !== 'external' || key !== expectedSongKey;
            if (source !== 'external') await actions.pauseLocal(snapshot.state === 'paused');
            if (!isCurrent()) return false;
            source = 'external'; externalSong = snapshot.currentSong; expectedSongKey = key;
            return changed;
        }),
    };
}
