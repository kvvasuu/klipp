import { vec3, type Vec3 } from 'math';
import type { Vector3 } from 'three';
import { createVector3DamperState, dampVector3, resetVector3Damper, type Vector3DamperState } from './Vector3Damper';

/** Velocity tracking state for position extrapolation. */
export type PredictorState = {
  velocity: Vec3;
  previousPosition: Vec3;
  velocityDamper: Vector3DamperState;
  hasPosition: boolean;
};

export const createPredictorState = (): PredictorState => ({
  velocity: [0, 0, 0],
  previousPosition: [0, 0, 0],
  velocityDamper: createVector3DamperState(),
  hasPosition: false,
});

/** Clear the tracked velocity and position history. */
export function resetPredictor(state: PredictorState): void {
  vec3.set(state.velocity, 0, 0, 0);
  resetVector3Damper(state.velocityDamper);
  state.hasPosition = false;
}

const scratchRawVelocity: Vec3 = [0, 0, 0];

/** Add a position sample and update the tracked velocity. */
export function addPredictorPosition(state: PredictorState, position: Vec3, dt: number, smoothing: number): void {
  if (!state.hasPosition) {
    state.hasPosition = true;
    vec3.copy(state.previousPosition, position);
    return;
  }

  dt = Math.max(0, dt);
  if (dt > 0) {
    vec3.scale(scratchRawVelocity, vec3.subtract(scratchRawVelocity, position, state.previousPosition), 1 / dt);
    const slowing = vec3.squaredLength(scratchRawVelocity) < vec3.squaredLength(state.velocity);
    dampVector3(state.velocityDamper, state.velocity, scratchRawVelocity, smoothing / (slowing ? 30 : 10), dt);
  }
  vec3.copy(state.previousPosition, position);
}

/** Write the predicted offset `time` seconds ahead into `out`. */
export function predictPositionDelta(out: Vec3, state: PredictorState, time: number): Vec3 {
  return vec3.scale(out, state.velocity, time);
}

const scratchPosition: Vec3 = [0, 0, 0];
const scratchDelta: Vec3 = [0, 0, 0];

/** Stateful wrapper over the predictor functions for three.js vectors. */
export class Predictor {
  readonly state = createPredictorState();

  /** Add a position sample and update the tracked velocity. */
  addPosition(position: Vector3, dt: number, smoothing: number): void {
    addPredictorPosition(this.state, position.toArray(scratchPosition), dt, smoothing);
  }

  /** Write the predicted offset `time` seconds ahead into `out`. */
  predictPositionDelta(out: Vector3, time: number): Vector3 {
    return out.fromArray(predictPositionDelta(scratchDelta, this.state, time));
  }

  /** Clear the tracked velocity and position history. */
  reset(): void {
    resetPredictor(this.state);
  }
}
