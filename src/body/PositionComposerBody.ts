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
 * Two-stage, position-only Body. (1) Dollies along the camera's own Z axis until the target sits at
 * `cameraDistance` — always exact, no dead zone (that's purely a 2D screen-framing concept here, not a
 * distance one). (2) Shifts laterally (camera's own X/Y) until the target projects onto `screenPosition`
 * (`[x,y]`, 0 = screen center, ±1 = edge — same convention `RotationComposer` uses).
 *
 * `deadZone` (`[width, height]`, screen fractions, default `[0,0]` = none) — stage 2 only reacts once the
 * target's CURRENT screen position (given the camera's position from stage 1 and its existing, pre-this-
 * frame orientation) steps outside this box around `screenPosition`; inside it, the camera doesn't move
 * laterally at all. Once outside, it eases toward the nearest point on the dead zone's edge (not all the
 * way back to `screenPosition`'s center) via `damping` (`Vector3Damper`, same per-axis technique
 * `HardLockToTargetBody`/`FollowBody` use). `deadZone=[0,0]` with `damping<=0` (both defaults) reproduces
 * the original hard, instant, no-dead-zone behavior exactly.
 *
 * `hardLimit` (`[width, height]`, same units as `deadZone`, default `[0,0]` = none) — a SECOND, normally
 * wider box the target may never visually leave, checked AFTER damping: if a slow `damping` lets the
 * target lag outside `hardLimit` this frame, that excess is corrected instantly (bypassing the damper
 * entirely) — same shape as `RotationComposerAim`'s `hardLimit`.
 *
 * Both stages need a camera ORIENTATION to define "own Z axis"/"own X/Y plane" — but Body always runs
 * BEFORE Aim (`VirtualCameraController`), so this reads `out.quaternion` as whatever Aim wrote LAST
 * frame, one frame stale. Same story for `out.fov`, used for the perspective projection in stage 2.
 *
 * **`screenPosition` off-center only makes sense paired with an Aim that respects it.** `HardLookAt`
 * always re-centers the target — combined with a non-`[0,0]` `screenPosition`, that creates a feedback
 * loop that settles into a persistent orbit instead of a stable shot. A matching `RotationComposer` fixes
 * this, but ONLY if BOTH sides have a non-zero `deadZone` — with either side still hard (`deadZone=[0,0]`),
 * that side perfectly compensates every frame, so the other's dead zone check always finds zero error and
 * never reacts.
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

    scratchForward.set(0, 0, -1).applyQuaternion(out.quaternion);
    scratchRight.set(1, 0, 0).applyQuaternion(out.quaternion);
    scratchUp.set(0, 1, 0).applyQuaternion(out.quaternion);

    // stage 1: dolly along forward until target's depth matches cameraDistance — always exact
    scratchRelative.copy(scratchTargetPosition).sub(out.position);
    const currentDepth = scratchRelative.dot(scratchForward);
    out.position.addScaledVector(scratchForward, currentDepth - this.cameraDistance);

    // stage 2: shift laterally until target's screen-space projection matches screenPosition (or the
    // dead zone edge). Depth is exactly cameraDistance now (stage 1), so the frustum's half-extents at
    // that depth convert screenPosition (-1..1) into world units directly.
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
        desiredScreenX = this.screenPosition[0] + Math.max(-halfDeadWidth, Math.min(halfDeadWidth, errorX));
        desiredScreenY = this.screenPosition[1] + Math.max(-halfDeadHeight, Math.min(halfDeadHeight, errorY));
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

    // undamped pass: same stage-2 math again, but against out.position AFTER damping, and clamped to
    // hardLimit instead of desired-to-dead-zone-edge — forward/right/up and halfWidth/halfHeight are
    // still valid, neither stage touches out.quaternion or out.fov
    scratchRelative.copy(scratchTargetPosition).sub(out.position);
    const afterRight = scratchRelative.dot(scratchRight);
    const afterUp = scratchRelative.dot(scratchUp);

    const halfLimitWidth = this.hardLimit[0] / 2;
    const halfLimitHeight = this.hardLimit[1] / 2;
    const limitErrorX = afterRight / halfWidth - this.screenPosition[0];
    const limitErrorY = afterUp / halfHeight - this.screenPosition[1];
    if (Math.abs(limitErrorX) <= halfLimitWidth && Math.abs(limitErrorY) <= halfLimitHeight) return; // still inside: no-op

    const clampedX = this.screenPosition[0] + Math.max(-halfLimitWidth, Math.min(halfLimitWidth, limitErrorX));
    const clampedY = this.screenPosition[1] + Math.max(-halfLimitHeight, Math.min(halfLimitHeight, limitErrorY));
    out.position
      .addScaledVector(scratchRight, afterRight - clampedX * halfWidth)
      .addScaledVector(scratchUp, afterUp - clampedY * halfHeight);
  };
}
