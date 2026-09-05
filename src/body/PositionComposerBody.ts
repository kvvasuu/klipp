import { clamp } from 'math';
import { Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import type { DampingConstant } from '../damping/Damper';
import { Vector3Damper } from '../damping/Vector3Damper';
import { resolveTargetPosition, type Target } from '../resolve/Target';

const scratchForward = new Vector3();
const scratchRight = new Vector3();
const scratchUp = new Vector3();
const scratchTargetPosition = new Vector3();
const scratchRelative = new Vector3();
const scratchDesiredPosition = new Vector3();

/**
 * Two-stage, position-only Body: dollies to `cameraDistance`, then shifts laterally to put the target at
 * `screenPosition` (or the `deadZone`/`hardLimit` edge).
 *
 * Reads `out.quaternion`/`out.fov` as whatever Aim wrote LAST frame (Body runs before Aim) — one frame
 * stale. On a fresh activation, the dolly axis instead comes from `VirtualCamera`'s `initialState` (or the
 * camera's pristine default) - set it explicitly for a specific starting axis (e.g. straight down).
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

  private readonly damper = new Vector3Damper();

  constructor(
    target: Target,
    cameraDistance = 10,
    screenPosition: [number, number] = [0, 0],
    aspect = 1,
    deadZone: [number, number] = [0, 0],
    damping: DampingConstant = 0,
    hardLimit: [number, number] = [0, 0],
  ) {
    this.target = target;
    this.cameraDistance = cameraDistance;
    this.screenPosition = screenPosition;
    this.aspect = aspect;
    this.deadZone = deadZone;
    this.damping = damping;
    this.hardLimit = hardLimit;
  }

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

    const currentRight = scratchRelative.dot(scratchRight);
    const currentUp = scratchRelative.dot(scratchUp);

    let desiredScreenX = this.screenPosition[0];
    let desiredScreenY = this.screenPosition[1];
    let insideDeadZone = false;

    // justActivated skips the dead zone check entirely — same reasoning as RotationComposerAim's: it
    // judges drift in out.position, which on a fresh activation is whatever an earlier, unrelated
    // activation left behind, not a meaningful "current" to stay near
    if (!justActivated && (this.deadZone[0] > 0 || this.deadZone[1] > 0)) {
      const errorX = currentRight / halfWidth - this.screenPosition[0];
      const errorY = currentUp / halfHeight - this.screenPosition[1];
      insideDeadZone = Math.abs(errorX) <= this.deadZone[0] / 2 && Math.abs(errorY) <= this.deadZone[1] / 2;

      if (!insideDeadZone) {
        const halfDeadWidth = this.deadZone[0] / 2;
        const halfDeadHeight = this.deadZone[1] / 2;
        desiredScreenX = this.screenPosition[0] + clamp(errorX, -halfDeadWidth, halfDeadWidth);
        desiredScreenY = this.screenPosition[1] + clamp(errorY, -halfDeadHeight, halfDeadHeight);
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
    const limitErrorX = afterRight / halfWidth - this.screenPosition[0];
    const limitErrorY = afterUp / halfHeight - this.screenPosition[1];
    if (Math.abs(limitErrorX) <= halfLimitWidth && Math.abs(limitErrorY) <= halfLimitHeight) return;

    const clampedX = this.screenPosition[0] + clamp(limitErrorX, -halfLimitWidth, halfLimitWidth);
    const clampedY = this.screenPosition[1] + clamp(limitErrorY, -halfLimitHeight, halfLimitHeight);
    out.position
      .addScaledVector(scratchRight, afterRight - clampedX * halfWidth)
      .addScaledVector(scratchUp, afterUp - clampedY * halfHeight);
  };
}
