import type { CameraState } from '../CameraState';
import { createDamperState, damp, resetDamper, type DamperState, type DampingConstant } from '../damping/Damper';

export type LensParams = {
  fov?: number;
  near?: number;
  far?: number;
  fovDamping: DampingConstant;
  nearDamping: DampingConstant;
  farDamping: DampingConstant;
  fovMaxSpeed: number;
  nearMaxSpeed: number;
  farMaxSpeed: number;
};

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
