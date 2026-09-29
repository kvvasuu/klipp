import { clamp } from 'math';
import type { Spring } from 'math/time';

/** Damping time, optionally asymmetric for widening and narrowing gaps. */
export type DampingConstant = number | { into: number; from: number };

/** Damper memory: a math `Spring<number>` plus asymmetric damping and snap state. */
export type DamperState = Spring<number> & { previousDistance: number; hasUpdated: boolean };

export const createDamperState = (value = 0): DamperState => ({
  value,
  velocity: 0,
  previousDistance: 0,
  hasUpdated: false,
});

/** Reset the state so the next call snaps to the target. */
export function resetDamper(state: DamperState): void {
  state.velocity = 0;
  state.previousDistance = 0;
  state.hasUpdated = false;
}

/** Critically damped spring step with target snapping. Mutates and returns `state`. */
export function damp(
  state: DamperState,
  target: number,
  damping: DampingConstant,
  dt: number,
  maxSpeed = Infinity,
  epsilon = 1e-4,
): DamperState {
  if (!state.hasUpdated) {
    state.hasUpdated = true;
    state.value = target;
    return state;
  }

  // Prevent a negative time step from amplifying the response.
  dt = Math.max(0, dt);

  const current = state.value;
  const distance = Math.abs(target - current);

  if (distance < epsilon) {
    state.velocity = 0;
    state.previousDistance = 0;
    state.value = target;
    return state;
  }

  // Select the damping time for the direction of travel.
  const smoothTime =
    typeof damping === 'number' ? damping : distance > state.previousDistance ? damping.into : damping.from;
  state.previousDistance = distance;

  const time = Math.max(0.0001, smoothTime);

  const maxChange = maxSpeed * Math.max(time, dt);
  const change = clamp(current - target, -maxChange, maxChange);
  const adjustedTarget = current - change;

  const omega = 2 / time;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const temp = (state.velocity + omega * change) * dt;
  state.velocity = (state.velocity - omega * temp) * exp;
  let output = adjustedTarget + (change + temp) * exp;

  // Snap instead of oscillating after an overshoot.
  if (target - current > 0 === output > target) {
    output = target;
    state.velocity = (output - target) / dt;
  }

  state.value = output;
  return state;
}

/** Stateful wrapper over `damp`. */
export class Damper {
  readonly state = createDamperState();

  get velocity(): number {
    return this.state.velocity;
  }

  set velocity(value: number) {
    this.state.velocity = value;
  }

  update(
    current: number,
    target: number,
    damping: DampingConstant,
    dt: number,
    maxSpeed = Infinity,
    epsilon = 1e-4,
  ): number {
    this.state.value = current;
    return damp(this.state, target, damping, dt, maxSpeed, epsilon).value;
  }

  /** Reset the spring state so the next call snaps to the target again. */
  reset(): void {
    resetDamper(this.state);
  }
}
