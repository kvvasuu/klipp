import { clamp, degreesToRadians } from 'math';
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

/** `'ceiling'` - only dollies back, never closer than Body/Aim already placed the camera. `'rigid'` -
 *  always sits exactly at the fit distance, dollying in as the group shrinks too. */
export type GroupFramingFitMode = 'ceiling' | 'rigid';

/**
 * Camera extension: dollies `out.position` back along the camera's current view axis just far enough to
 * keep `group`'s members (plus `padding`, world units) inside the frame - `fitMode` decides whether it can
 * also dolly closer. Both spheres (`radius`) and boxes (`size`) get the exact per-axis frustum-plane
 * distance against the camera's current up/right/forward, not an isotropic bound - an offset mostly along
 * one axis isn't penalized as if it could be along the other. Boxes additionally check all 8 corners,
 * since a corner's own depth affects how close it can get. Never touches `out.quaternion`/`out.fov`, so it
 * needs Aim already looking at `group`. `screenPosition` shifts `out.viewOffset` separately.
 */
export class GroupFramingExtension {
  group: TargetGroup;
  /** Margin kept clear around the group's members, in world units. */
  padding: number;
  /** Current canvas size in pixels, for the viewport's aspect ratio. */
  viewportWidth: number;
  viewportHeight: number;
  /** Seconds to catch up to the distance ceiling (and `screenPosition`) as they change. `0` (default)
   *  = hard, instant. */
  damping: DampingConstant;
  /** Shifts the frustum without moving/rotating the camera - same convention as `PositionComposer`'s
   *  `screenPosition` (0 = center, ±1 = frame edge). */
  screenPosition: [number, number];
  /** See `GroupFramingFitMode`. Default `'ceiling'`. */
  fitMode: GroupFramingFitMode;
  /** Clamps the fit distance this extension computes - not Body/Aim's own placement in `'ceiling'` mode.
   *  Defaults `0`/`Infinity` (no clamp). */
  minDistance: number;
  maxDistance: number;

  private readonly distanceDamper = new Damper();
  private currentDistance = 0;
  private readonly screenPositionXDamper = new Damper();
  private readonly screenPositionYDamper = new Damper();
  private currentScreenPosition: [number, number] = [0, 0];
  private forceSizeRecalculation = false;

  constructor(
    group: TargetGroup,
    padding = 0,
    viewportWidth = 1,
    viewportHeight = 1,
    damping: DampingConstant = 0,
    screenPosition: [number, number] = [0, 0],
    fitMode: GroupFramingFitMode = 'ceiling',
    minDistance = 0,
    maxDistance = Infinity,
  ) {
    this.group = group;
    this.padding = padding;
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.damping = damping;
    this.screenPosition = screenPosition;
    this.fitMode = fitMode;
    this.minDistance = minDistance;
    this.maxDistance = maxDistance;
  }

  /** Forces every member's auto-detected `size` to be re-measured on the NEXT `update()` call, then goes
   *  back to the cheap cached behavior - for a member that deforms occasionally (an event), not
   *  continuously. */
  recalculateSize(): void {
    this.forceSizeRecalculation = true;
  }

  update = (out: CameraState, dt: number, justActivated: boolean): boolean => {
    // captured up front so it applies uniformly to every member size lookup this frame (computeBounds's
    // own internal ones included), not just whichever happens to run first
    const dynamicSize = this.forceSizeRecalculation;
    this.forceSizeRecalculation = false;

    const boundsRadius = this.group.computeBounds(scratchGroupPosition, dynamicSize);
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
    const sinVertical = Math.sin(verticalHalfFov);
    const sinHorizontal = Math.sin(horizontalHalfFov);
    const cosVertical = Math.cos(verticalHalfFov);
    const cosHorizontal = Math.cos(horizontalHalfFov);

    let requiredDistance = 0;

    for (const member of this.group.members) {
      if (!resolveTargetPosition(scratchMemberPosition, member.target)) continue;
      scratchOffset.subVectors(scratchMemberPosition, scratchGroupPosition);
      const offsetUp = scratchOffset.dot(scratchUp);
      const offsetRight = scratchOffset.dot(scratchRight);
      const offsetForward = scratchOffset.dot(scratchForward);

      if (this.group.resolveMemberSize(scratchSize, member, dynamicSize)) {
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
              requiredDistance = Math.max(requiredDistance, vertical, horizontal);
            }
          }
        }
      } else {
        // exact per-axis sphere/frustum-plane distance, not an isotropic offset.length() - an offset
        // mostly along the WIDER axis shouldn't be penalized as if it could be along the narrower one.
        const effectiveRadius = (member.radius ?? 0) + padding;
        const vertical = (effectiveRadius + Math.abs(offsetUp) * cosVertical) / sinVertical - offsetForward;
        const horizontal = (effectiveRadius + Math.abs(offsetRight) * cosHorizontal) / sinHorizontal - offsetForward;
        requiredDistance = Math.max(requiredDistance, vertical, horizontal);
      }
    }

    const clampedRequiredDistance = clamp(requiredDistance, this.minDistance, this.maxDistance);
    const distance =
      this.fitMode === 'rigid'
        ? clampedRequiredDistance
        : Math.max(out.position.distanceTo(scratchGroupPosition), clampedRequiredDistance);

    const instant = typeof this.damping === 'number' && this.damping <= 0;

    if (justActivated) {
      this.distanceDamper.reset();
      this.screenPositionXDamper.reset();
      this.screenPositionYDamper.reset();
    }

    this.currentDistance = instant
      ? distance
      : this.distanceDamper.update(this.currentDistance, distance, this.damping, dt);

    scratchBackward.set(0, 0, 1).applyQuaternion(out.quaternion);
    out.position.copy(scratchGroupPosition).addScaledVector(scratchBackward, this.currentDistance);

    this.currentScreenPosition[0] = instant
      ? this.screenPosition[0]
      : this.screenPositionXDamper.update(this.currentScreenPosition[0], this.screenPosition[0], this.damping, dt);
    this.currentScreenPosition[1] = instant
      ? this.screenPosition[1]
      : this.screenPositionYDamper.update(this.currentScreenPosition[1], this.screenPosition[1], this.damping, dt);

    out.viewOffset[0] = this.currentScreenPosition[0];
    out.viewOffset[1] = this.currentScreenPosition[1];

    return (
      this.currentDistance !== distance ||
      this.currentScreenPosition[0] !== this.screenPosition[0] ||
      this.currentScreenPosition[1] !== this.screenPosition[1]
    );
  };
}
