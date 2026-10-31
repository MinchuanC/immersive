// Recording-bound visual direction and durable, user-authored listening editions.
export interface ImmersionRecipe {
    intensity: number;
    sonicGroundAmplitude: number;
    sonicGroundMotionSpeed: number;
    sonicGroundGlow: number;
}

export interface ScoreCue {
    atSec: number;
    motif: number;
    /** Measured energy samples are distinct from structural boundaries. */
    source?: 'energy' | 'section' | 'edge';
    recipe: ImmersionRecipe;
}

export interface SongScore {
    version: 1;
    trackKey: string;
    durationSec: number;
    seed: number;
    evidence: { kind: 'local-analysis'; profileVersion: number }
        | { kind: 'online-stream-analysis'; providerId: import('./onlineMusic').OnlineProviderId; profileVersion: number };
    cues: ScoreCue[];
}

export interface EditionCue {
    id: string;
    trackKey: string;
    atSec: number;
    kind: 'look' | 'bookmark';
    label: string;
    recipe?: ImmersionRecipe;
    seed?: number;
}

export interface PersonalEdition {
    version: 1;
    id: string;
    albumKey: string;
    albumName: string;
    scoreVersion: 1;
    updatedAt: number;
    cues: EditionCue[];
}

export interface AlbumJourney {
    version: 1;
    albumKey: string;
    albumName: string;
    trackKeys: string[];
    index: number;
    state: 'ready' | 'running' | 'interrupted' | 'completed';
}

export interface ImmersionAlbumTrack {
    songId: string;
    trackKey: string;
    title: string;
    durationSec: number;
}

export interface ImmersionAlbum {
    key: string;
    name: string;
    tracks: ImmersionAlbumTrack[];
}
