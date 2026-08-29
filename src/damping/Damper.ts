import { clamp } from 'maath';

/** Asymmetric damping: `into` applies while the gap to target is widening (entering a reaction, e.g.
 *  dodging an obstacle), `from` while it's narrowing (returning to normal). */
export type DampingConstant = number | { into: number; from: number };

/**
 * Critically-damped spring (Game Programming Gems 4 §1.10) — tracks its own velocity across calls so
 * motion accelerates/decelerates naturally instead of jumping whenever the target moves.
 *
 * Snaps exactly to `target` (and zeroes velocity) once within `epsilon` — SmoothDamp only asymptotically
 * approaches its target, so without this a settled camera keeps accumulating floating-point residue
 * forever instead of truly stopping. Not part of the ported formula, added for numerical correctness.
 *
 * The very first `update()` call always snaps hard to `target` too, regardless of `damping` — a fresh
 * `CameraState` defaults `current` to `(0,0,0)`/identity, a meaningless coordinate the caller never chose;
 * damping it from there would visibly fly the camera in from world origin on activation instead of
 * smoothing real, subsequent changes. Damping only ever eases motion AFTER the camera is already in place.
 */
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

    // a negative dt (clock skew, a caller driving update() with an unvalidated timestamp delta) breaks
    // the rational e^-x approximation below, which is only valid for x >= 0 — omega*dt going negative can
    // flip its sign entirely, turning the spring into an amplifier instead of a damper for that step
    dt = Math.max(0, dt);

    const distance = Math.abs(target - current);

    if (distance < epsilon) {
      this.velocity = 0;
      this.previousDistance = 0;
      return target;
    }

    // widening gap = "into" the reaction, narrowing = "from" it — see DampingConstant's doc comment
    const smoothTime =
      typeof damping === 'number' ? damping : distance > this.previousDistance ? damping.into : damping.from;
    this.previousDistance = distance;

    const time = Math.max(0.0001, smoothTime);
    const omega = 2 / time;

    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

    const maxChange = maxSpeed * time;
    const change = clamp(current - target, -maxChange, maxChange);
    const adjustedTarget = current - change;

    const temp = (this.velocity + omega * change) * dt;
    this.velocity = (this.velocity - omega * temp) * exp;
    let output = adjustedTarget + (change + temp) * exp;

    // crossed past the target this step (overshoot) — snap instead of oscillating
    if (target - current > 0 === output > target) {
      output = target;
      this.velocity = (output - target) / dt;
    }

    return output;
  }

  /** Forgets `velocity`/history and re-arms the first-call snap — the NEXT `update()` call returns
   *  `target` exactly, as if this were a brand new `Damper`. For a caller resuming after a gap where
   *  `current` wasn't being tracked at all (so it's frozen at a stale, unrelated value): without this,
   *  that next call would ease FROM that stale value instead of snapping onto the real one. */
  reset(): void {
    this.velocity = 0;
    this.previousDistance = 0;
    this.hasUpdated = false;
  }
}
