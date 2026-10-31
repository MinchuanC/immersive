import type { SongResult } from '../../types';
import type { ExternalPlaybackContext } from '../../types/onlineMusic';
import type { GridViewCollectionDescriptor } from '../core/collection/collection.contract';
import type { CollectionResourceSnapshot } from '../core/shared/resource.contract';
import { omni } from '../../services/onlineMusic/omni';
import { getPlaybackSongKey } from '../../utils/appPlaybackGuards';

// Native collection playback is safe only for the complete, unfiltered collection action.
export function collectionPlaybackContext(collection: GridViewCollectionDescriptor | null, snapshot: CollectionResourceSnapshot | null, tracks: SongResult[], query = ''): ExternalPlaybackContext | undefined {
    if (collection?.source !== 'online' || collection.isLiked === true || (collection.type !== 'playlist' && collection.type !== 'album')
        || !snapshot || snapshot.status !== 'ready' || snapshot.sync.status !== 'none' || query.trim()
        || !tracks.length || tracks.length !== snapshot.tracks.length || !omni.hasExternalPlayback(tracks[0])) return;
    if (!tracks.every((track, index) => track.sourceRef?.kind === 'online' && track.sourceRef.providerId === collection.providerId
        && getPlaybackSongKey(track) === getPlaybackSongKey(snapshot.tracks[index]))) return;
    return { providerId: collection.providerId, type: collection.type, id: String(collection.id) };
}
