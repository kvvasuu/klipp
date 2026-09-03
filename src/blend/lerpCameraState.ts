import { clamp, lerp } from 'maath';
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { CameraState } from '../CameraState';

/** Scratch for the negated-`b` case below — module-level is safe, this is a synchronous leaf call. */
const negatedB = new Quaternion();

const scratchLookMatrix = new Matrix4();
const worldUp = new Vector3(0, 1, 0);

/**
 * Same trig as `Quaternion.slerp`, reimplemented because that one always re-derives its own "shortest
 * path" from `dot(from, to)` and flips `to`'s sign internally — so pre-flipping `to` before calling it
 * (tried first) changes nothing. This version trusts whatever sign it's given instead.
 */
function slerpWithContinuity(out: Quaternion, from: Quaternion, to: Quaternion, t: number): void {
  const toX = to.x,
    toY = to.y,
    toZ = to.z,
    toW = to.w;

  const dot = Math.min(1, Math.max(-1, from.x * toX + from.y * toY + from.z * toZ + from.w * toW));
  const fromX = from.x,
    fromY = from.y,
    fromZ = from.z,
    fromW = from.w;

  if (Math.abs(dot) < 0.9995) {
    const theta = Math.acos(dot);
    const sin = Math.sin(theta);
    const s = Math.sin((1 - t) * theta) / sin;
    const u = Math.sin(t * theta) / sin;
    out.set(fromX * s + toX * u, fromY * s + toY * u, fromZ * s + toZ * u, fromW * s + toW * u);
  } else {
    // dot ≈ ±1 — lerp + normalize avoids dividing by sin(theta) ≈ 0.
    const s = 1 - t;
    out.set(fromX * s + toX * t, fromY * s + toY * t, fromZ * s + toZ * t, fromW * s + toW * t);
    out.normalize();
  }
}

/**
 * Interpolates a WHOLE `CameraState` (position + rotation + lens) at one shared progress `t`, not three
 * independent lerps. `t` is clamped to [0, 1]. Writes into `out` and returns it.
 *
 * Rotation: a shared `lookAtTarget` on both `a` and `b` (Aim's Look At point) always drives rotation via
 * a fresh `lookAt(out.position, out.lookAtTarget)` instead of slerping `a`/`b`'s rotations - so the
 * camera keeps looking at it exactly throughout the blend, not just at the two ends. Otherwise falls back
 * to a plain slerp, with continuity: a plain slerp takes the shortest path between `a` and `b`, but `b` is
 * often a LIVE rotation (e.g. Aim tracking an orbiting target) while `a` stays frozen for the whole blend
 * — once `b` sweeps past ~180° from `a`, "shortest from `a`" flips sides, jerking the camera. Comparing
 * `b` against `out`'s pre-write value instead (that's last frame's result, since `out` is reused every
 * tick) keeps the path continuous.
 */
export function lerpCameraState(out: CameraState, a: CameraState, b: CameraState, t: number): CameraState {
  const clamped = clamp(t, 0, 1);
  out.position.lerpVectors(a.position, b.position, clamped);

  const hasLookAtTarget = a.hasLookAtTarget && b.hasLookAtTarget;
  if (hasLookAtTarget) out.lookAtTarget.lerpVectors(a.lookAtTarget, b.lookAtTarget, clamped);
  out.hasLookAtTarget = hasLookAtTarget;

  if (hasLookAtTarget) {
    scratchLookMatrix.lookAt(out.position, out.lookAtTarget, worldUp);
    out.quaternion.setFromRotationMatrix(scratchLookMatrix);
  } else {
    const bQuaternion =
      out.quaternion.dot(b.quaternion) < 0
        ? negatedB.set(-b.quaternion.x, -b.quaternion.y, -b.quaternion.z, -b.quaternion.w)
        : b.quaternion;
    slerpWithContinuity(out.quaternion, a.quaternion, bQuaternion, clamped);
  }

  out.fov = lerp(a.fov, b.fov, clamped);
  out.near = lerp(a.near, b.near, clamped);
  out.far = lerp(a.far, b.far, clamped);
  out.viewOffsetX = lerp(a.viewOffsetX, b.viewOffsetX, clamped);
  out.viewOffsetY = lerp(a.viewOffsetY, b.viewOffsetY, clamped);
  return out;
}
