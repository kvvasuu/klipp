import { clamp } from 'math';

/** Damping time, optionally asymmetric for widening and narrowing gaps. */
export type DampingConstant = number | { into: number; from: number };

/** Critically damped spring with target snapping and reset support. */
export class Damper {
  velocity = 0;
  private previousDistance = 0;
  private hasUpdated = false;

  update(
    current: number,
    target: number,
    damping: DampingConstant,
    dt: number,
    maxSpeed = Infinity,
    epsilon = 1e-4,
  ): number {
    if (!this.hasUpdated) {
      this.hasUpdated = true;
      return target;
    }

    // Prevent a negative time step from amplifying the response.
    dt = Math.max(0, dt);

    const distance = Math.abs(target - current);

    if (distance < epsilon) {
      this.velocity = 0;
      this.previousDistance = 0;
      return target;
    }

    // Select the damping time for the direction of travel.
    const smoothTime =
      typeof damping === 'number' ? damping : distance > this.previousDistance ? damping.into : damping.from;
    this.previousDistance = distance;

    const time = Math.max(0.0001, smoothTime);
    const omega = 2 / time;

    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

    const maxChange = maxSpeed * Math.max(time, dt);
    const change = clamp(current - target, -maxChange, maxChange);
    const adjustedTarget = current - change;

    const temp = (this.velocity + omega * change) * dt;
    this.velocity = (this.velocity - omega * temp) * exp;
    let output = adjustedTarget + (change + temp) * exp;

    // Snap instead of oscillating after an overshoot.
    if (target - current > 0 === output > target) {
      output = target;
      this.velocity = (output - target) / dt;
    }

    return output;
  }

  /** Reset the spring state so the next call snaps to the target again. */
  reset(): void {
    this.velocity = 0;
    this.previousDistance = 0;
    this.hasUpdated = false;
  }
}
