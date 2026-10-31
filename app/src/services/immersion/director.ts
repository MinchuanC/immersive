import type { ImmersionRecipe } from '../../types/immersion';

let active: { trackKey: string; evaluate: (time: number) => ImmersionRecipe | null } | null = null;
let revision = 0;

// Graphics sample the authoritative clock without writing settings or React state each frame.
export function installImmersionDirector(trackKey: string, evaluate: (time: number) => ImmersionRecipe | null) {
    const owner = { trackKey, evaluate };
    active = owner;
    revision += 1;
    return () => { if (active === owner) { active = null; revision += 1; } };
}

export const getImmersionDirectionRevision = () => revision;

export function sampleImmersionDirection(trackKey: string, time: number): ImmersionRecipe | null {
    return active?.trackKey === trackKey && Number.isFinite(time) ? active.evaluate(Math.max(0, time)) : null;
}
