import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { clamp, degreesToRadians } from 'math';
import { Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import { Damper, type DampingConstant } from '../damping/Damper';
import { Predictor } from '../damping/Predictor';
import { Vector3Damper } from '../damping/Vector3Damper';
import { resolveTargetHalfExtents, resolveTargetPosition, type Target } from '../resolve/Target';

const scratchForward = new Vector3();
const scratchRight = new Vector3();
const scratchUp = new Vector3();
const scratchTargetPosition = new Vector3();
const scratchRelative = new Vector3();
const scratchDesiredPosition = new Vector3();
const scratchLookaheadDelta = new Vector3();
/** `[halfExtentRight, halfExtentUp]` - reused scratch, no allocation (see `resolveTargetHalfExtents`). */
const scratchExtents: [number, number] = [0, 0];

/**
 * Two-stage, position-only Body: dollies to `cameraDistance`, then shifts laterally to put the target at
 * `screenPosition` (or the `deadZone`/`hardLimit` edge). `damping` eases both stages; the dolly stage also
 * gets its own `depthDeadZone` tolerance before it reacts at all.
 *
 * Reads `out.quaternion`/`out.fov` as whatever Aim wrote LAST frame (Body runs before Aim) — one frame
 * stale. On a fresh activation, the dolly axis instead comes from `VirtualCamera`'s `initialState` (or the
 * camera's pristine default) - set it explicitly for a specific starting axis (e.g. straight down).
 *
 * `radius`/`size` give the target a screen-space EXTENT instead of a point: `deadZone`/`hardLimit` react to
 * its nearest edge, capped to the zone's own half-size so an oversized target settles on dead center
 * instead of oscillating.
 *
 * `lookaheadTime` > 0 composes around the target's extrapolated position instead of its raw one - both
 * stages, and `out.target`, see the shifted point.
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
  depthDeadZone: number;
  radius?: number;
  size?: Vector3Like;
  /** Seconds to extrapolate the target's tracked position ahead by, based on its recent velocity - `0`
   *  (default) predicts nothing, so the rest of `lookahead*` is inert. */
  lookaheadTime: number;
  /** Smooth-time budget (seconds) for the velocity estimate driving `lookaheadTime` - reacts faster while
   *  the target is slowing down than while it's speeding up, so a sudden burst of speed doesn't yank the
   *  predicted point forward instantly. Default `1`. */
  lookaheadSmoothing: number;
  /** Zeroes the Y component of the predicted offset - keeps lookahead horizontal for a target that bobs
   *  or jumps vertically. Default `false`. */
  lookaheadIgnoreY: boolean;

  private readonly damper = new Vector3Damper();
  private readonly depthDamper = new Damper();
  private readonly predictor = new Predictor();
  private lastLookaheadTarget: Target = undefined;
  private forceSizeRecalculation = false;

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
    depthDeadZone = 0,
    lookaheadTime = 0,
    lookaheadSmoothing = 1,
    lookaheadIgnoreY = false,
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
    this.depthDeadZone = depthDeadZone;
    this.lookaheadTime = lookaheadTime;
    this.lookaheadSmoothing = lookaheadSmoothing;
    this.lookaheadIgnoreY = lookaheadIgnoreY;
  }

  /** Forces the auto-detected `size` to be re-measured on the NEXT `update()` call, then goes back to the
   *  cheap cached behavior - for a target that deforms occasionally (an event), not continuously. */
  recalculateSize(): void {
    this.forceSizeRecalculation = true;
  }

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    if (!resolveTargetPosition(scratchTargetPosition, this.target)) return;

    if (justActivated || this.target !== this.lastLookaheadTarget) {
      this.lastLookaheadTarget = this.target;
      this.predictor.reset();
    }
    this.predictor.addPosition(scratchTargetPosition, dt, this.lookaheadSmoothing);
    if (this.lookaheadTime > 0) {
      this.predictor.predictPositionDelta(scratchLookaheadDelta, this.lookaheadTime);
      if (this.lookaheadIgnoreY) scratchLookaheadDelta.y = 0;
      scratchTargetPosition.add(scratchLookaheadDelta);
    }

    out.target.copy(scratchTargetPosition);
    out.hasTarget = true;

    scratchForward.set(0, 0, -1).applyQuaternion(out.quaternion);
    scratchRight.set(1, 0, 0).applyQuaternion(out.quaternion);
    scratchUp.set(0, 1, 0).applyQuaternion(out.quaternion);

    scratchRelative.copy(scratchTargetPosition).sub(out.position);
    const currentDepth = scratchRelative.dot(scratchForward);

    let desiredDepth = this.cameraDistance;
    let insideDepthDeadZone = false;

    // justActivated skips the dead zone check entirely - same reasoning as the lateral one below: it
    // judges drift in out.position, which on a fresh activation is whatever an earlier, unrelated
    // activation left behind, not a meaningful "current" to stay near
    if (!justActivated && this.depthDeadZone > 0) {
      const depthError = currentDepth - this.cameraDistance;
      insideDepthDeadZone = Math.abs(depthError) <= this.depthDeadZone;
      if (!insideDepthDeadZone) {
        desiredDepth = this.cameraDistance + clamp(depthError, -this.depthDeadZone, this.depthDeadZone);
      }
    }

    if (!insideDepthDeadZone) {
      if (justActivated) this.depthDamper.reset();
      const instant = typeof this.damping === 'number' && this.damping <= 0;
      const dampedDepth = instant
        ? desiredDepth
        : this.depthDamper.update(currentDepth, desiredDepth, this.damping, dt);
      out.position.addScaledVector(scratchForward, currentDepth - dampedDepth);
    }

    // stage 2: shift laterally to screenPosition (or the dead zone edge)
    scratchRelative.copy(scratchTargetPosition).sub(out.position);
    const halfHeight = this.cameraDistance * Math.tan(degreesToRadians(out.fov) / 2);
    const halfWidth = halfHeight * this.aspect;

    resolveTargetHalfExtents(
      scratchExtents,
      this.target,
      this.size,
      this.radius,
      scratchRight,
      scratchUp,
      this.forceSizeRecalculation,
    );
    this.forceSizeRecalculation = false;
    const extentX = scratchExtents[0] / halfWidth;
    const extentY = scratchExtents[1] / halfHeight;

    const currentRight = scratchRelative.dot(scratchRight);
    const currentUp = scratchRelative.dot(scratchUp);

    let desiredScreenX = this.screenPosition[0];
    let desiredScreenY = this.screenPosition[1];
    let insideDeadZone = false;

    // justActivated skips the dead zone check entirely — same reasoning as RotationComposerAim's: it
    // judges drift in out.position, which on a fresh activation is whatever an earlier, unrelated
    // activation left behind, not a meaningful "current" to stay near
    if (!justActivated && (this.deadZone[0] > 0 || this.deadZone[1] > 0)) {
      const halfDeadWidth = this.deadZone[0];
      const halfDeadHeight = this.deadZone[1];
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

    const halfLimitWidth = this.hardLimit[0];
    const halfLimitHeight = this.hardLimit[1];
    // same overshoot cap as the dead zone pass, against this box's own half-size
    const limitExtentX = Math.min(extentX, halfLimitWidth);
    const limitExtentY = Math.min(extentY, halfLimitHeight);

    const limitErrorX = afterRight / halfWidth - this.screenPosition[0];
    const limitErrorY = afterUp / halfHeight - this.screenPosition[1];
    const limitEdgeErrorX = limitErrorX + Math.sign(limitErrorX) * limitExtentX;
    const limitEdgeErrorY = limitErrorY + Math.sign(limitErrorY) * limitExtentY;
    if (Math.abs(limitEdgeErrorX) <= halfLimitWidth && Math.abs(limitEdgeErrorY) <= halfLimitHeight) return;

    const clampedX =
      this.screenPosition[0] +
      clamp(limitEdgeErrorX, -halfLimitWidth, halfLimitWidth) -
      Math.sign(limitErrorX) * limitExtentX;
    const clampedY =
      this.screenPosition[1] +
      clamp(limitEdgeErrorY, -halfLimitHeight, halfLimitHeight) -
      Math.sign(limitErrorY) * limitExtentY;
    out.position
      .addScaledVector(scratchRight, afterRight - clampedX * halfWidth)
      .addScaledVector(scratchUp, afterUp - clampedY * halfHeight);
  };
}
