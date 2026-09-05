import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { clamp } from 'math';
import { Quaternion, Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import type { DampingConstant } from '../damping/Damper';
import { Vector3Damper } from '../damping/Vector3Damper';
import { resolveTargetPosition, resolveTargetRotation, resolveTargetSize, type Target } from '../resolve/Target';

const scratchForward = new Vector3();
const scratchRight = new Vector3();
const scratchUp = new Vector3();
const scratchTargetPosition = new Vector3();
const scratchTargetRotation = new Quaternion();
const scratchRelative = new Vector3();
const scratchDesiredPosition = new Vector3();
const scratchSize = new Vector3();
const scratchHalfSize = new Vector3();
const scratchAxisX = new Vector3();
const scratchAxisY = new Vector3();
const scratchAxisZ = new Vector3();
/** `[halfExtentRight, halfExtentUp]` - reused scratch, no allocation (see `computeHalfExtents`). */
const scratchExtents: [number, number] = [0, 0];

/**
 * Two-stage, position-only Body: dollies to `cameraDistance`, then shifts laterally to put the target at
 * `screenPosition` (or the `deadZone`/`hardLimit` edge).
 *
 * Reads `out.quaternion`/`out.fov` as whatever Aim wrote LAST frame (Body runs before Aim) — one frame
 * stale. On a fresh activation, the dolly axis instead comes from `VirtualCamera`'s `initialState` (or the
 * camera's pristine default) - set it explicitly for a specific starting axis (e.g. straight down).
 *
 * `radius`/`size` give the target a screen-space EXTENT instead of a point: `deadZone`/`hardLimit` react to
 * its nearest edge, capped to the zone's own half-size so an oversized target settles on dead center
 * instead of oscillating.
 *
 * A non-center `screenPosition` needs an Aim that respects it too (e.g. `RotationComposer`, with a
 * matching non-zero `deadZone` on both sides) — `HardLookAt` re-centers every frame, which fights a
 * non-zero `screenPosition` into a persistent orbit instead of a stable shot.
 */
export class PositionComposerBody {
  target: Target;
  cameraDistance: number;
  screenPosition: [number, number];
  aspect: number;
  deadZone: [number, number];
  damping: DampingConstant;
  hardLimit: [number, number];
  radius?: number;
  size?: Vector3Like;

  private readonly damper = new Vector3Damper();

  constructor(
    target: Target,
    cameraDistance = 10,
    screenPosition: [number, number] = [0, 0],
    aspect = 1,
    deadZone: [number, number] = [0, 0],
    damping: DampingConstant = 0,
    hardLimit: [number, number] = [0, 0],
    radius?: number,
    size?: Vector3Like,
  ) {
    this.target = target;
    this.cameraDistance = cameraDistance;
    this.screenPosition = screenPosition;
    this.aspect = aspect;
    this.deadZone = deadZone;
    this.damping = damping;
    this.hardLimit = hardLimit;
    this.radius = radius;
    this.size = size;
  }

  /** Half the target's screen-space reach along `scratchRight`/`scratchUp` - `[0, 0]` for a point target.
   *  A box's half-extent along an axis is the sum of its rotated half-size axes' projections onto it. */
  private computeHalfExtents = (): readonly [number, number] => {
    if (this.radius !== undefined && !this.size) {
      scratchExtents[0] = this.radius;
      scratchExtents[1] = this.radius;
      return scratchExtents;
    }
    if (!resolveTargetSize(scratchSize, this.target, this.size, this.radius)) {
      scratchExtents[0] = 0;
      scratchExtents[1] = 0;
      return scratchExtents;
    }

    if (!resolveTargetRotation(scratchTargetRotation, this.target)) scratchTargetRotation.identity();
    scratchHalfSize.copy(scratchSize).multiplyScalar(0.5);
    scratchAxisX.set(scratchHalfSize.x, 0, 0).applyQuaternion(scratchTargetRotation);
    scratchAxisY.set(0, scratchHalfSize.y, 0).applyQuaternion(scratchTargetRotation);
    scratchAxisZ.set(0, 0, scratchHalfSize.z).applyQuaternion(scratchTargetRotation);
    scratchExtents[0] =
      Math.abs(scratchAxisX.dot(scratchRight)) + Math.abs(scratchAxisY.dot(scratchRight)) + Math.abs(scratchAxisZ.dot(scratchRight));
    scratchExtents[1] =
      Math.abs(scratchAxisX.dot(scratchUp)) + Math.abs(scratchAxisY.dot(scratchUp)) + Math.abs(scratchAxisZ.dot(scratchUp));
    return scratchExtents;
  };

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    if (!resolveTargetPosition(scratchTargetPosition, this.target)) return;
    out.target.copy(scratchTargetPosition);
    out.hasTarget = true;

    scratchForward.set(0, 0, -1).applyQuaternion(out.quaternion);
    scratchRight.set(1, 0, 0).applyQuaternion(out.quaternion);
    scratchUp.set(0, 1, 0).applyQuaternion(out.quaternion);

    // stage 1: dolly to cameraDistance
    scratchRelative.copy(scratchTargetPosition).sub(out.position);
    const currentDepth = scratchRelative.dot(scratchForward);
    out.position.addScaledVector(scratchForward, currentDepth - this.cameraDistance);

    // stage 2: shift laterally to screenPosition (or the dead zone edge)
    scratchRelative.copy(scratchTargetPosition).sub(out.position);
    const halfHeight = this.cameraDistance * Math.tan((out.fov * Math.PI) / 360);
    const halfWidth = halfHeight * this.aspect;

    const [halfExtentRight, halfExtentUp] = this.computeHalfExtents();
    const extentX = halfExtentRight / halfWidth;
    const extentY = halfExtentUp / halfHeight;

    const currentRight = scratchRelative.dot(scratchRight);
    const currentUp = scratchRelative.dot(scratchUp);

    let desiredScreenX = this.screenPosition[0];
    let desiredScreenY = this.screenPosition[1];
    let insideDeadZone = false;

    // justActivated skips the dead zone check entirely — same reasoning as RotationComposerAim's: it
    // judges drift in out.position, which on a fresh activation is whatever an earlier, unrelated
    // activation left behind, not a meaningful "current" to stay near
    if (!justActivated && (this.deadZone[0] > 0 || this.deadZone[1] > 0)) {
      const halfDeadWidth = this.deadZone[0] / 2;
      const halfDeadHeight = this.deadZone[1] / 2;
      // capped to the zone's own half-size, or an oversized target would overshoot center and oscillate
      const deadExtentX = Math.min(extentX, halfDeadWidth);
      const deadExtentY = Math.min(extentY, halfDeadHeight);

      const errorX = currentRight / halfWidth - this.screenPosition[0];
      const errorY = currentUp / halfHeight - this.screenPosition[1];
      // the leading edge (center error + extent) must stay inside the zone, not just the center
      const edgeErrorX = errorX + Math.sign(errorX) * deadExtentX;
      const edgeErrorY = errorY + Math.sign(errorY) * deadExtentY;
      insideDeadZone = Math.abs(edgeErrorX) <= halfDeadWidth && Math.abs(edgeErrorY) <= halfDeadHeight;

      if (!insideDeadZone) {
        desiredScreenX =
          this.screenPosition[0] + clamp(edgeErrorX, -halfDeadWidth, halfDeadWidth) - Math.sign(errorX) * deadExtentX;
        desiredScreenY =
          this.screenPosition[1] + clamp(edgeErrorY, -halfDeadHeight, halfDeadHeight) - Math.sign(errorY) * deadExtentY;
      }
    }

    // still falls through to the hardLimit pass below even when inside the dead zone (no lateral
    // reaction here) — hardLimit is a SEPARATE, wider box that must hold regardless of the dead zone, not
    // just when the dead zone itself happened to react this frame (e.g. a misconfigured hardLimit smaller
    // than deadZone would otherwise never actually enforce anything)
    if (!insideDeadZone) {
      scratchDesiredPosition
        .copy(out.position)
        .addScaledVector(scratchRight, currentRight - desiredScreenX * halfWidth)
        .addScaledVector(scratchUp, currentUp - desiredScreenY * halfHeight);

      if (justActivated) this.damper.reset();
      this.damper.update(out.position, scratchDesiredPosition, this.damping, dt);
    }

    if (this.hardLimit[0] <= 0 && this.hardLimit[1] <= 0) return;

    // undamped pass: same stage-2 math again, clamped to hardLimit instead of the dead zone edge
    scratchRelative.copy(scratchTargetPosition).sub(out.position);
    const afterRight = scratchRelative.dot(scratchRight);
    const afterUp = scratchRelative.dot(scratchUp);

    const halfLimitWidth = this.hardLimit[0] / 2;
    const halfLimitHeight = this.hardLimit[1] / 2;
    // same overshoot cap as the dead zone pass, against this box's own half-size
    const limitExtentX = Math.min(extentX, halfLimitWidth);
    const limitExtentY = Math.min(extentY, halfLimitHeight);

    const limitErrorX = afterRight / halfWidth - this.screenPosition[0];
    const limitErrorY = afterUp / halfHeight - this.screenPosition[1];
    const limitEdgeErrorX = limitErrorX + Math.sign(limitErrorX) * limitExtentX;
    const limitEdgeErrorY = limitErrorY + Math.sign(limitErrorY) * limitExtentY;
    if (Math.abs(limitEdgeErrorX) <= halfLimitWidth && Math.abs(limitEdgeErrorY) <= halfLimitHeight) return;

    const clampedX =
      this.screenPosition[0] + clamp(limitEdgeErrorX, -halfLimitWidth, halfLimitWidth) - Math.sign(limitErrorX) * limitExtentX;
    const clampedY =
      this.screenPosition[1] + clamp(limitEdgeErrorY, -halfLimitHeight, halfLimitHeight) - Math.sign(limitErrorY) * limitExtentY;
    out.position
      .addScaledVector(scratchRight, afterRight - clampedX * halfWidth)
      .addScaledVector(scratchUp, afterUp - clampedY * halfHeight);
  };
}
