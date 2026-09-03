import { degreesToRadians } from 'math';
import { Quaternion, Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import { Damper, type DampingConstant } from '../damping/Damper';
import { resolveTargetPosition, resolveTargetRotation } from '../resolve/Target';
import type { TargetGroup } from './TargetGroup';

const scratchGroupPosition = new Vector3();
const scratchBackward = new Vector3(); // three.js cameras face local -Z, so this is "away from view"
const scratchRight = new Vector3();
const scratchUp = new Vector3();
const scratchForward = new Vector3();
const scratchMemberPosition = new Vector3();
const scratchOffset = new Vector3();
const scratchSize = new Vector3();
const scratchHalfSize = new Vector3();
const scratchMemberQuaternion = new Quaternion();
const scratchAxisX = new Vector3();
const scratchAxisY = new Vector3();
const scratchAxisZ = new Vector3();
const CORNER_SIGNS = [-1, 1] as const;

/**
 * Camera extension: a CEILING on distance, not a rigid fit — dollies `out.position` back along the
 * camera's current view axis only as far as needed to keep `group`'s members (plus `padding`, world
 * units) inside the frame, never closer than Body/Aim already placed it. Spheres (`radius`) use the exact
 * tangent formula (`sin`); boxes (`size`) check all 8 corners against the camera's current axes and take
 * the worst case (`tan`) — a corner's own depth affects how close it can get, so height/width and depth
 * can't just be added. "Dolly Only": never touches `out.quaternion`/`out.fov`, so it needs Aim already
 * looking at `group`. `centerOffsetX`/`Y` shift `out.viewOffsetX`/`Y` separately.
 */
export class GroupFramingExtension {
  group: TargetGroup;
  /** Margin kept clear around the group's members, in world units. */
  padding: number;
  /** Current canvas size in pixels, for the viewport's aspect ratio. */
  viewportWidth: number;
  viewportHeight: number;
  /** Seconds to catch up to the distance ceiling (and `centerOffsetX`/`Y`) as they change. `0` (default)
   *  = hard, instant. */
  damping: DampingConstant;
  /** Shifts the frustum (screen pixels) without moving or rotating the camera. `0` (default) = none. */
  centerOffsetX: number;
  centerOffsetY: number;

  private readonly distanceDamper = new Damper();
  private currentDistance = 0;
  private readonly centerOffsetXDamper = new Damper();
  private readonly centerOffsetYDamper = new Damper();
  private currentCenterOffsetX = 0;
  private currentCenterOffsetY = 0;

  constructor(
    group: TargetGroup,
    padding = 0,
    viewportWidth = 1,
    viewportHeight = 1,
    damping: DampingConstant = 0,
    centerOffsetX = 0,
    centerOffsetY = 0,
  ) {
    this.group = group;
    this.padding = padding;
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.damping = damping;
    this.centerOffsetX = centerOffsetX;
    this.centerOffsetY = centerOffsetY;
  }

  update = (out: CameraState, dt: number, justActivated: boolean): boolean => {
    const boundsRadius = this.group.computeBounds(scratchGroupPosition);
    if (boundsRadius <= 0) return false;

    const verticalHalfFov = degreesToRadians(out.fov) / 2;
    const aspect = this.viewportWidth / this.viewportHeight;
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);

    scratchRight.set(1, 0, 0).applyQuaternion(out.quaternion);
    scratchUp.set(0, 1, 0).applyQuaternion(out.quaternion);
    scratchForward.set(0, 0, -1).applyQuaternion(out.quaternion);

    const padding = Math.max(0, this.padding);
    const tanVertical = Math.tan(verticalHalfFov);
    const tanHorizontal = Math.tan(horizontalHalfFov);

    let sphereReach = 0;
    let hasBoxMember = false;
    let boxRequiredDistance = Number.NEGATIVE_INFINITY;

    for (const member of this.group.members) {
      if (!resolveTargetPosition(scratchMemberPosition, member.target)) continue;
      scratchOffset.subVectors(scratchMemberPosition, scratchGroupPosition);

      if (this.group.resolveMemberSize(scratchSize, member)) {
        hasBoxMember = true;
        if (!resolveTargetRotation(scratchMemberQuaternion, member.target)) scratchMemberQuaternion.identity();
        scratchHalfSize.copy(scratchSize).multiplyScalar(0.5);
        scratchAxisX.set(scratchHalfSize.x, 0, 0).applyQuaternion(scratchMemberQuaternion);
        scratchAxisY.set(0, scratchHalfSize.y, 0).applyQuaternion(scratchMemberQuaternion);
        scratchAxisZ.set(0, 0, scratchHalfSize.z).applyQuaternion(scratchMemberQuaternion);

        const axisXUp = scratchAxisX.dot(scratchUp);
        const axisYUp = scratchAxisY.dot(scratchUp);
        const axisZUp = scratchAxisZ.dot(scratchUp);
        const axisXRight = scratchAxisX.dot(scratchRight);
        const axisYRight = scratchAxisY.dot(scratchRight);
        const axisZRight = scratchAxisZ.dot(scratchRight);
        const axisXForward = scratchAxisX.dot(scratchForward);
        const axisYForward = scratchAxisY.dot(scratchForward);
        const axisZForward = scratchAxisZ.dot(scratchForward);
        const offsetUp = scratchOffset.dot(scratchUp);
        const offsetRight = scratchOffset.dot(scratchRight);
        const offsetForward = scratchOffset.dot(scratchForward);

        // A corner's own depth affects how close it can get before clipping, so height/width and depth
        // aren't independent worst cases — check all 8 corners directly and take the true max.
        for (const sx of CORNER_SIGNS) {
          for (const sy of CORNER_SIGNS) {
            for (const sz of CORNER_SIGNS) {
              const cornerUp = offsetUp + sx * axisXUp + sy * axisYUp + sz * axisZUp;
              const cornerRight = offsetRight + sx * axisXRight + sy * axisYRight + sz * axisZRight;
              const cornerForward = offsetForward + sx * axisXForward + sy * axisYForward + sz * axisZForward;
              const vertical = (Math.abs(cornerUp) + padding) / tanVertical - cornerForward;
              const horizontal = (Math.abs(cornerRight) + padding) / tanHorizontal - cornerForward;
              boxRequiredDistance = Math.max(boxRequiredDistance, vertical, horizontal);
            }
          }
        }
      } else {
        const reach = scratchOffset.length() + (member.radius ?? 0);
        if (reach > sphereReach) sphereReach = reach;
      }
    }

    let requiredDistance = 0;
    if (sphereReach > 0) {
      const effectiveRadius = sphereReach + padding;
      requiredDistance = Math.max(
        requiredDistance,
        effectiveRadius / Math.sin(verticalHalfFov),
        effectiveRadius / Math.sin(horizontalHalfFov),
      );
    }
    if (hasBoxMember) requiredDistance = Math.max(requiredDistance, boxRequiredDistance);

    const bodyDistance = out.position.distanceTo(scratchGroupPosition);
    const distance = Math.max(bodyDistance, requiredDistance);

    const instant = typeof this.damping === 'number' && this.damping <= 0;

    if (justActivated) {
      this.distanceDamper.reset();
      this.centerOffsetXDamper.reset();
      this.centerOffsetYDamper.reset();
    }

    this.currentDistance = instant
      ? distance
      : this.distanceDamper.update(this.currentDistance, distance, this.damping, dt);

    scratchBackward.set(0, 0, 1).applyQuaternion(out.quaternion);
    out.position.copy(scratchGroupPosition).addScaledVector(scratchBackward, this.currentDistance);

    this.currentCenterOffsetX = instant
      ? this.centerOffsetX
      : this.centerOffsetXDamper.update(this.currentCenterOffsetX, this.centerOffsetX, this.damping, dt);
    this.currentCenterOffsetY = instant
      ? this.centerOffsetY
      : this.centerOffsetYDamper.update(this.currentCenterOffsetY, this.centerOffsetY, this.damping, dt);
    out.viewOffsetX = this.currentCenterOffsetX;
    out.viewOffsetY = this.currentCenterOffsetY;

    return (
      this.currentDistance !== distance ||
      this.currentCenterOffsetX !== this.centerOffsetX ||
      this.currentCenterOffsetY !== this.centerOffsetY
    );
  };
}
