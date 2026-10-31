import { appDatabase } from '../appDatabase';
import type { EditionCue, ImmersionRecipe, PersonalEdition } from '../../types/immersion';

// Stores authored visual cues separately from disposable analysis and media caches.
const isReference = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isPosition = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const recipeBounds: Record<keyof ImmersionRecipe, [number, number]> = {
    intensity: [0.1, 1.5],
    sonicGroundAmplitude: [0, 100],
    sonicGroundMotionSpeed: [0, 100],
    sonicGroundGlow: [0, 100],
};

export const isRecipe = (value: unknown): value is ImmersionRecipe => isRecord(value)
    && Object.keys(value).length === Object.keys(recipeBounds).length
    && Object.entries(recipeBounds).every(([key, [min, max]]) => (
        typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= min && value[key] <= max
    ));

const supportsEdition = (edition: PersonalEdition): boolean => edition.version === 1
    && edition.scoreVersion === 1 && edition.id === edition.albumKey && Array.isArray(edition.cues);

const requireReference = (reference: string): void => {
    if (!isReference(reference)) throw new Error('A recording or album reference is required.');
};

const requireSupportedEdition = (edition: PersonalEdition): void => {
    if (!supportsEdition(edition)) throw new Error('This edition version cannot be changed by this player.');
};

const authoredCue = (cue: EditionCue): EditionCue => {
    if (!isRecord(cue) || !isReference(cue.id) || !isReference(cue.trackKey)
        || !isPosition(cue.atSec) || typeof cue.label !== 'string'
        || (cue.kind !== 'look' && cue.kind !== 'bookmark')
        || (cue.kind === 'look' && !isRecipe(cue.recipe))
        || (cue.seed !== undefined && !isPosition(cue.seed))) {
        throw new Error('Invalid personal edition cue.');
    }
    return {
        id: cue.id,
        trackKey: cue.trackKey,
        atSec: cue.atSec,
        kind: cue.kind,
        label: cue.label,
        ...(cue.kind === 'look' ? { recipe: { ...cue.recipe! } } : {}),
        ...(cue.seed !== undefined ? { seed: cue.seed } : {}),
    };
};

const nextUpdatedAt = (edition: PersonalEdition | undefined): number => Math.max(Date.now(), (edition?.updatedAt ?? 0) + 1);

export const getPersonalEdition = async (albumKey: string): Promise<PersonalEdition | null> => {
    requireReference(albumKey);
    return (await appDatabase.personal_editions.get(albumKey)) ?? null;
};

// A read/write transaction serializes edits so two user actions cannot discard each other's cues.
export const saveEditionCue = async (albumKey: string, albumName: string, cue: EditionCue): Promise<PersonalEdition> => {
    requireReference(albumKey);
    if (typeof albumName !== 'string') throw new Error('An album name is required.');
    const savedCue = authoredCue(cue);
    return appDatabase.transaction('rw', appDatabase.personal_editions, async () => {
        const previous = await appDatabase.personal_editions.get(albumKey);
        if (previous) requireSupportedEdition(previous);
        const cues = previous?.cues ?? [];
        const existing = cues.find(item => item.id === savedCue.id);
        if (existing && (existing.kind !== savedCue.kind || existing.trackKey !== savedCue.trackKey)) {
            throw new Error('A cue ID already belongs to a different recording or cue kind.');
        }
        if (cues.some(item => item.kind === 'look' && !isRecipe(item.recipe)
            && (item.id === savedCue.id || (savedCue.kind === 'look'
                && item.trackKey === savedCue.trackKey && item.atSec === savedCue.atSec)))) {
            throw new Error('This saved recipe is incompatible; remove its cue before replacing it.');
        }
        const edition: PersonalEdition = {
            ...previous,
            version: 1,
            id: albumKey,
            albumKey,
            albumName,
            scoreVersion: 1,
            updatedAt: nextUpdatedAt(previous),
            cues: [...cues.filter(item => item.id !== savedCue.id && !(savedCue.kind === 'look'
                && item.kind === 'look' && item.trackKey === savedCue.trackKey && item.atSec === savedCue.atSec)), savedCue],
        };
        await appDatabase.personal_editions.put(edition);
        return edition;
    });
};

export const deleteEditionCue = async (editionId: string, cueId: string): Promise<PersonalEdition | null> => {
    requireReference(editionId);
    requireReference(cueId);
    return appDatabase.transaction('rw', appDatabase.personal_editions, async () => {
        const previous = await appDatabase.personal_editions.get(editionId);
        if (!previous) return null;
        requireSupportedEdition(previous);
        const cues = previous.cues.filter(cue => cue.id !== cueId);
        if (cues.length === previous.cues.length) return previous;
        const edition = { ...previous, cues, updatedAt: nextUpdatedAt(previous) };
        await appDatabase.personal_editions.put(edition);
        return edition;
    });
};

// Reconstructs direction after a seek; an incompatible latest look must not revive an older one.
export const evaluateEditionRecipe = (
    edition: PersonalEdition | null,
    trackKey: string,
    positionSec: number,
): ImmersionRecipe | null => {
    if (!edition || !supportsEdition(edition) || !isReference(trackKey) || !isPosition(positionSec)) return null;
    let latest: EditionCue | undefined;
    for (const cue of edition.cues) {
        if (isRecord(cue) && cue.kind === 'look' && cue.trackKey === trackKey && isPosition(cue.atSec)
            && cue.atSec <= positionSec && (!latest || cue.atSec >= latest.atSec)) latest = cue;
    }
    return isRecipe(latest?.recipe) ? { ...latest.recipe } : null;
};
