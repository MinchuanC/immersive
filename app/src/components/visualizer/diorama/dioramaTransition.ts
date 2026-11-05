// src/components/visualizer/diorama/dioramaTransition.ts
// Pure helpers for the diorama's cinematic "one-take" scene transition (切歌 / 单曲循环).
//
// The transition is performed entirely in-world: when a song changes, the next song's corridor is
// spawned at a deliberate world OFFSET from the current one (pickTransitionOffset) - far enough that it
// starts fully swallowed by the distance fog, i.e. invisible. CameraRig SmoothDamps toward the live pose
// and flavours that follow with transitionEase, flightPerp and flightSide. As it approaches, the new
// scene's elements emerge from the fog while the old scene it is leaving recedes back into the fog -
// no cut, no fade overlay, the picture never hidden. These functions are pure (plain vectors) so the
// geometry is unit-testable; VisualizerDiorama consumes pickTransitionOffset once per transition to
// place the incoming corridor.

import { hashSeed, seededUnit, type DioramaVec } from './cameraPath';

/** Seconds the camera flight lasts. Long and gently eased so the move reads as a languid cinematic
 * push rather than a rushed dash across the gap. */
export const TRANSITION_DURATION = 3.2;
/** World distance the incoming corridor is spawned from the outgoing one. Beyond the fog far plane (30),
 * so the new scene begins fully fogged/invisible and only reveals as the camera closes the gap. */
export const TRANSITION_DISTANCE = 46;
/** Peak roll (radians) the camera banks into its arc mid-flight, like a craft leaning through a turn -
 * zero at both ends. Small: enough to feel alive, never a dutch-tilt. */
export const TRANSITION_BANK = 0.14;
/** Fraction of the flight length the AIM point sweeps sideways at mid-flight (a graceful reframe/pan on
 * top of the bodily move), returning to the composed frame by the end. */
export const TRANSITION_AIM_SWEEP = 0.14;

/** Unit perpendicular to the flight direction in the horizontal plane - the axis the arc bows along and
 * the aim sweeps toward. Shared by CameraRig's position bow, aim sweep and bank so they move together. */
export const flightPerp = (from: DioramaVec, to: DioramaVec): DioramaVec => {
    const perp = { x: to.z - from.z, y: 0, z: -(to.x - from.x) };
    const l = Math.hypot(perp.x, perp.y, perp.z);
    return l < 1e-3 ? { x: 1, y: 0, z: 0 } : { x: perp.x / l, y: perp.y / l, z: perp.z / l };
};

/** Which side the arc bows / aim sweeps / camera banks - seeded per transition so consecutive moves vary. */
export const flightSide = (seed: string | number | undefined, epoch: number): 1 | -1 =>
    seededUnit(hashSeed(seed) + epoch * 17) < 0.5 ? -1 : 1;

const len = (a: DioramaVec): number => Math.hypot(a.x, a.y, a.z);
const scaleTo = (a: DioramaVec, target: number): DioramaVec => {
    const l = len(a) || 1;
    return { x: (a.x / l) * target, y: (a.y / l) * target, z: (a.z / l) * target };
};

/**
 * A seeded world offset placing the next song's corridor away from the current one. Direction varies per
 * transition (azimuth swept full circle, elevation biased upward) so consecutive switches sweep the
 * camera in different directions - up, down, diagonal, lateral - while `z` stays negative so the new
 * scene sits generally ahead (the camera pushes IN to it rather than reversing).
 */
export const pickTransitionOffset = (seed: string | number | undefined, epoch: number): DioramaVec => {
    const base = hashSeed(seed) + epoch * 131;
    const azimuth = seededUnit(base + 1) * Math.PI * 2;
    const elevation = (seededUnit(base + 2) - 0.35) * 1.3; // upward-biased vertical spread
    const ce = Math.cos(elevation);
    const dir: DioramaVec = {
        x: Math.sin(azimuth) * ce,
        y: Math.sin(elevation),
        z: -Math.abs(Math.cos(azimuth) * ce) - 0.35,
    };
    return scaleTo(dir, TRANSITION_DISTANCE);
};

/** Smootherstep (6t^5-15t^4+10t^3): eases the flight in AND out, zero velocity at both ends, so the
 * camera accelerates off the old pose and settles onto the new one without a kink. */
export const transitionEase = (t: number): number => {
    const c = Math.min(1, Math.max(0, t));
    return c * c * c * (c * (c * 6 - 15) + 10);
};
