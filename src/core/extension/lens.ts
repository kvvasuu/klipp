import type { CameraState } from '../CameraState.js';
import { createDamperState, damp, resetDamper, type DamperState, type DampingConstant } from '../damping/Damper.js';
import { withDefaults } from '../params.js';

export type LensParams = {
  /** Overrides the camera's field of view, in degrees. `undefined` leaves the current value untouched. */
  fov?: number;
  /** Overrides the near clip plane. `undefined` leaves the current value untouched. */
  near?: number;
  /** Overrides the far clip plane. `undefined` leaves the current value untouched. */
  far?: number;
  /** Spring response time to `fov` as it changes. `0` is instant. */
  fovDamping: DampingConstant;
  /** Spring response time to `near` as it changes. `0` is instant. */
  nearDamping: DampingConstant;
  /** Spring response time to `far` as it changes. `0` is instant. */
  farDamping: DampingConstant;
  /** Caps how fast `fovDamping` can close the gap, in degrees/sec. `Infinity` means no cap. */
  fovMaxSpeed: number;
  /** Caps how fast `nearDamping` can close the gap, in world units/sec. `Infinity` means no cap. */
  nearMaxSpeed: number;
  /** Caps how fast `farDamping` can close the gap, in world units/sec. `Infinity` means no cap. */
  farMaxSpeed: number;
};

/** Every setting from `settings`, or its default. */
export const createLensParams = (settings?: Partial<LensParams>): LensParams =>
  withDefaults(
    {
      fov: undefined,
      near: undefined,
      far: undefined,
      fovDamping: 0,
      nearDamping: 0,
      farDamping: 0,
      fovMaxSpeed: Infinity,
      nearMaxSpeed: Infinity,
      farMaxSpeed: Infinity,
    },
    settings,
  );

export type LensState = {
  fovDamper: DamperState;
  nearDamper: DamperState;
  farDamper: DamperState;
  currentFov: number;
  currentNear: number;
  currentFar: number;
};

export const createLensState = (): LensState => ({
  fovDamper: createDamperState(),
  nearDamper: createDamperState(),
  farDamper: createDamperState(),
  currentFov: 0,
  currentNear: 0,
  currentFar: 0,
});

function dampLensField(
  damper: DamperState,
  current: number,
  target: number,
  damping: DampingConstant,
  dt: number,
  maxSpeed: number,
): number {
  if (typeof damping === 'number' && damping <= 0) return target;
  damper.value = current;
  return damp(damper, target, damping, dt, maxSpeed).value;
}

/** Overrides the lens fields that are set in `params`, each with its own damping. Returns true while still moving. */
export function updateLens(
  out: CameraState,
  state: LensState,
  params: LensParams,
  dt: number,
  justActivated: boolean,
): boolean {
  if (justActivated) {
    resetDamper(state.fovDamper);
    resetDamper(state.nearDamper);
    resetDamper(state.farDamper);
  }

  if (params.fov !== undefined) {
    state.currentFov = dampLensField(
      state.fovDamper,
      state.currentFov,
      params.fov,
      params.fovDamping,
      dt,
      params.fovMaxSpeed,
    );
    out.fov = state.currentFov;
  }
  if (params.near !== undefined) {
    state.currentNear = dampLensField(
      state.nearDamper,
      state.currentNear,
      params.near,
      params.nearDamping,
      dt,
      params.nearMaxSpeed,
    );
    out.near = state.currentNear;
  }
  if (params.far !== undefined) {
    state.currentFar = dampLensField(
      state.farDamper,
      state.currentFar,
      params.far,
      params.farDamping,
      dt,
      params.farMaxSpeed,
    );
    out.far = state.currentFar;
  }

  return (
    (params.fov !== undefined && state.currentFov !== params.fov) ||
    (params.near !== undefined && state.currentNear !== params.near) ||
    (params.far !== undefined && state.currentFar !== params.far)
  );
}
