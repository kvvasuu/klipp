import { Matrix4, Quaternion, Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import type { DampingConstant } from '../damping/Damper';
import { QuaternionDamper } from '../damping/QuaternionDamper';
import { resolveTargetPosition, resolveTargetRotation, type Target } from '../resolve/Target';

const worldUp = new Vector3(0, 1, 0);
const forwardAxis = new Vector3(0, 0, -1);
const scratchTargetPosition = new Vector3();
const scratchTargetRotation = new Quaternion();
const scratchOffset = new Vector3();
const scratchLookMatrix = new Matrix4();
const scratchDesiredLocalDir = new Vector3();
const scratchDelta = new Quaternion();
const scratchTargetQuaternion = new Quaternion();
const scratchHardLimitQuaternion = new Quaternion();
const scratchOutInverse = new Quaternion();
const scratchLocalDir = new Vector3();

/** `[x, y, depth]` of a world point in a camera's local screen space — reused scratch, no allocation.
 *  `depth <= 0` means the point is behind the camera (degenerate). */
const scratchScreenPoint: [number, number, number] = [0, 0, 0];

function computeScreenPoint(
  cameraPosition: Vector3,
  cameraQuaternionInverse: Quaternion,
  worldPoint: Vector3,
  tanHalfFovH: number,
  tanHalfFovV: number,
): readonly [number, number, number] {
  scratchLocalDir.copy(worldPoint).sub(cameraPosition).applyQuaternion(cameraQuaternionInverse);
  const depth = -scratchLocalDir.z;
  scratchScreenPoint[0] = scratchLocalDir.x / depth / tanHalfFovH;
  scratchScreenPoint[1] = scratchLocalDir.y / depth / tanHalfFovV;
  scratchScreenPoint[2] = depth;
  return scratchScreenPoint;
}

/** Base "look straight at target" orientation, composed toward a desired screen point — the one exact
 *  `setFromUnitVectors` operation both the dead zone and hard limit passes need, just for different
 *  desired points (see `RotationComposerAim`'s doc comment for why it can't be split into yaw+pitch). */
function composeQuaternionForScreenPoint(
  out: Quaternion,
  cameraPosition: Vector3,
  targetPosition: Vector3,
  desiredX: number,
  desiredY: number,
  tanHalfFovH: number,
  tanHalfFovV: number,
): void {
  scratchLookMatrix.lookAt(cameraPosition, targetPosition, worldUp);
  out.setFromRotationMatrix(scratchLookMatrix);

  if (desiredX !== 0 || desiredY !== 0) {
    scratchDesiredLocalDir.set(desiredX * tanHalfFovH, desiredY * tanHalfFovV, -1).normalize();
    scratchDelta.setFromUnitVectors(scratchDesiredLocalDir, forwardAxis);
    out.multiply(scratchDelta);
  }
}

/**
 * Rotation-only Aim. The core: find the rotation that puts the target at a given screen point (`[x,y]`,
 * 0 = center, ±1 = edge). Starts from a dead-center look-at (same as `HardLookAtAim`), then finds the ONE
 * exact rotation (`Quaternion.setFromUnitVectors`, not separate yaw+pitch — those don't commute) that
 * moves it to the desired point instead.
 *
 * `targetOffset` — translation in the target's own LOCAL space, applied before all composition math (e.g.
 * aim at a character's head instead of its feet/origin). Degrades to world-space for a target with no
 * rotation, same as `Follow`'s `offset`.
 *
 * `deadZone` (`[width, height]`, screen fractions, default `[0,0]` = none) — the target can sit anywhere
 * within this box around `screenPosition` with NO reaction. Once it steps outside, the target orientation
 * is recomputed for the NEAREST point on the dead zone's edge and `damping` eases `out.quaternion` toward
 * it.
 *
 * `hardLimit` (same units as `deadZone`, default `[0,0]` = none) — a SECOND, normally wider box the
 * target may never visually leave, enforced instantly (bypassing `damping`) after the dead zone pass.
 * No-op if `<= deadZone`.
 *
 * No Lookahead/Center On Activate yet.
 *
 * Runs AFTER Body, so `out.position` here is already this frame's — unlike `PositionComposerBody`, which
 * reads last frame's `out.quaternion`.
 *
 * **Paired with `PositionComposer` on the same `screenPosition`, BOTH need a non-zero `deadZone`.** With
 * either side still hard, that side perfectly compensates every frame, so the other's dead zone check
 * always finds zero error and never reacts — the camera freezes at whatever orientation it started with.
 */
export class RotationComposerAim {
  target: Target;
  screenPosition: [number, number];
  aspect: number;
  deadZone: [number, number];
  damping: DampingConstant;
  hardLimit: [number, number];
  targetOffset: Vector3;

  private readonly damper = new QuaternionDamper();

  constructor(
    target: Target,
    screenPosition: [number, number] = [0, 0],
    aspect = 1,
    deadZone: [number, number] = [0, 0],
    damping: DampingConstant = 0,
    hardLimit: [number, number] = [0, 0],
    targetOffset: Vector3 = new Vector3(),
  ) {
    this.target = target;
    this.screenPosition = screenPosition;
    this.aspect = aspect;
    this.deadZone = deadZone;
    this.damping = damping;
    this.hardLimit = hardLimit;
    this.targetOffset = targetOffset;
  }

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    if (!resolveTargetPosition(scratchTargetPosition, this.target)) return;

    if (!resolveTargetRotation(scratchTargetRotation, this.target)) scratchTargetRotation.identity();
    scratchTargetPosition.add(scratchOffset.copy(this.targetOffset).applyQuaternion(scratchTargetRotation));

    const halfFovV = (out.fov * Math.PI) / 360;
    const tanHalfFovV = Math.tan(halfFovV);
    const tanHalfFovH = tanHalfFovV * this.aspect;

    let desiredX = this.screenPosition[0];
    let desiredY = this.screenPosition[1];
    let insideDeadZone = false;

    // justActivated skips the dead zone check entirely — it exists to judge whether `out.quaternion`'s
    // CURRENT orientation has drifted from screenPosition, but on a fresh activation that orientation is
    // whatever an earlier, unrelated activation left behind, not a meaningful "current" to stay near
    if (!justActivated && (this.deadZone[0] > 0 || this.deadZone[1] > 0)) {
      // where does the target CURRENTLY appear, given out's existing (pre-this-frame) orientation?
      scratchOutInverse.copy(out.quaternion).invert();
      const [screenX, screenY, depth] = computeScreenPoint(
        out.position,
        scratchOutInverse,
        scratchTargetPosition,
        tanHalfFovH,
        tanHalfFovV,
      );

      if (depth > 1e-6) {
        const errorX = screenX - this.screenPosition[0];
        const errorY = screenY - this.screenPosition[1];
        insideDeadZone = Math.abs(errorX) <= this.deadZone[0] / 2 && Math.abs(errorY) <= this.deadZone[1] / 2;

        if (!insideDeadZone) {
          const halfWidth = this.deadZone[0] / 2;
          const halfHeight = this.deadZone[1] / 2;
          desiredX = this.screenPosition[0] + Math.max(-halfWidth, Math.min(halfWidth, errorX));
          desiredY = this.screenPosition[1] + Math.max(-halfHeight, Math.min(halfHeight, errorY));
        }
      }
      // depth <= 0 (target behind camera): degenerate, fall through and correct all the way to screenPosition
    }

    // still falls through to the hardLimit pass below even when inside the dead zone (no reaction here)
    // — hardLimit is a SEPARATE, wider box that must hold regardless of the dead zone, not just when the
    // dead zone itself happened to react this frame (e.g. a misconfigured hardLimit smaller than
    // deadZone would otherwise never actually enforce anything)
    if (!insideDeadZone) {
      composeQuaternionForScreenPoint(
        scratchTargetQuaternion,
        out.position,
        scratchTargetPosition,
        desiredX,
        desiredY,
        tanHalfFovH,
        tanHalfFovV,
      );
      if (justActivated) this.damper.reset();
      this.damper.update(out.quaternion, scratchTargetQuaternion, this.damping, dt);
    }

    if (this.hardLimit[0] <= 0 && this.hardLimit[1] <= 0) return;

    scratchOutInverse.copy(out.quaternion).invert();
    const [screenX, screenY, depth] = computeScreenPoint(
      out.position,
      scratchOutInverse,
      scratchTargetPosition,
      tanHalfFovH,
      tanHalfFovV,
    );
    if (depth <= 1e-6) return;

    const halfLimitWidth = this.hardLimit[0] / 2;
    const halfLimitHeight = this.hardLimit[1] / 2;
    const errorX = screenX - this.screenPosition[0];
    const errorY = screenY - this.screenPosition[1];
    if (Math.abs(errorX) <= halfLimitWidth && Math.abs(errorY) <= halfLimitHeight) return; // still inside: undamped pass is a no-op

    const clampedX = this.screenPosition[0] + Math.max(-halfLimitWidth, Math.min(halfLimitWidth, errorX));
    const clampedY = this.screenPosition[1] + Math.max(-halfLimitHeight, Math.min(halfLimitHeight, errorY));
    composeQuaternionForScreenPoint(
      scratchHardLimitQuaternion,
      out.position,
      scratchTargetPosition,
      clampedX,
      clampedY,
      tanHalfFovH,
      tanHalfFovV,
    );
    out.quaternion.copy(scratchHardLimitQuaternion);
  };
}
