import { OnlineProviderError } from '../../../types/onlineMusic';
import type { ExternalPlaybackProvider, ExternalPlaybackSnapshot, ExternalPlaybackAvailability } from '../../../types/onlineMusic';
import { requireSpotifySong, spotifyId, spotifyUri, spotifySongOf, type SpotifyTrack } from './spotifyNormalize';
import { requestSpotify, querySpotify } from './spotifyTransport';

// Converts the desktop application's playback state into the shared, source-aware playback contract.
interface DesktopSnapshot {
    availability: ExternalPlaybackAvailability;
    state: 'playing' | 'paused' | 'stopped';
    positionMs: number;
    volume: number;
    shuffle?: boolean;
    repeat?: boolean;
    observedAt: number;
    track?: { uri: string; title: string; artist?: string; album?: string; artworkUrl?: string; durationMs: number } | null;
}

export function normalizeDesktopSnapshot(raw: DesktopSnapshot): ExternalPlaybackSnapshot {
    const item = raw.track;
    const id = spotifyId(item?.uri, 'track');
    const currentSong = item && id ? {
        id, name: item.title, artists: item.artist ? [{ id: '', name: item.artist }] : [],
        album: { id: '', name: item.album || '', coverUrl: item.artworkUrl || '' },
        durationMs: item.durationMs,
        sourceRef: { kind: 'online' as const, providerId: 'spotify' as const, mediaId: id },
    } : null;
    return { ...raw, shuffle: Boolean(raw.shuffle), repeat: Boolean(raw.repeat), currentSong, durationMs: currentSong?.durationMs || 0 };
}

function requireAvailable(snapshot: ExternalPlaybackSnapshot): ExternalPlaybackSnapshot {
    if (snapshot.availability === 'ready' || snapshot.availability === 'empty') return snapshot;
    const messages = {
        'not-running': 'Open Spotify on this Mac to play this track',
        'not-installed': 'Install Spotify on this Mac to play this track',
        'permission-denied': 'Allow this player to control Spotify in System Settings → Privacy & Security → Automation',
        'unsupported-platform': 'Spotify desktop control requires macOS',
        error: 'Spotify desktop control did not respond',
    };
    throw new OnlineProviderError('unavailable', messages[snapshot.availability], 'spotify', { availability: snapshot.availability });
}

export const spotifyDesktopPlayback: ExternalPlaybackProvider = {
    async play(song, context) {
        const uri = spotifyUri('track', requireSpotifySong(song));
        const contextUri = context ? spotifyUri(context.type, String(context.id)) : undefined;
        if (context && (context.providerId !== 'spotify' || !['playlist', 'album'].includes(context.type) || !spotifyId(contextUri, context.type))) {
            throw new OnlineProviderError('unsupported', 'A valid Spotify playlist or album context is required', 'spotify');
        }
        return requireAvailable(normalizeDesktopSnapshot(await requestSpotify<DesktopSnapshot>('playback_action', { action: 'play-track', uri, ...(contextUri ? { contextUri } : {}) })));
    },
    async command(action, value, song) {
        const nativeValue = typeof value === 'number' ? action === 'seek' ? value / 1000 : action === 'volume' ? value * 100 : value : value;
        const uri = action === 'play' && song ? spotifyUri('track', requireSpotifySong(song)) : undefined;
        const result = normalizeDesktopSnapshot(await requestSpotify<DesktopSnapshot>('playback_action', { action, value: nativeValue, ...(uri ? { uri } : {}) }));
        // Pausing an app that has quit establishes the same exclusive ownership as a paused app.
        if (action === 'pause' && (result.availability === 'not-running' || result.availability === 'not-installed')) return result;
        return requireAvailable(result);
    },
    async snapshot() { return normalizeDesktopSnapshot(await requestSpotify<DesktopSnapshot>('playback_snapshot')); },
    async queue() {
        const answer = await querySpotify<{ currentSong: SpotifyTrack | null; songs: SpotifyTrack[] }>('playerQueue');
        const songs = answer.songs.flatMap(track => { const song = spotifySongOf(track); return song ? [song] : []; });
        if (songs.length !== answer.songs.length) throw new OnlineProviderError('unsupported', 'This Spotify queue contains unsupported content', 'spotify');
        return { currentSong: spotifySongOf(answer.currentSong), songs };
    },
    async configure(configuration) { await requestSpotify('configure', configuration); },
    getConnectionStatus: () => requestSpotify('connection_status'),
};
