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

/** Fit mode controlling whether the extension can dolly the camera closer. */
export type GroupFramingFitMode = 'ceiling' | 'rigid';

/** Which screen dimensions the fit distance has to satisfy. */
export type GroupFramingMode = 'horizontal' | 'vertical' | 'horizontalAndVertical';

/** Keeps a target group inside the camera frame by adjusting position and view offset. */
export class GroupFramingExtension {
  group: TargetGroup;
  padding: number;
  viewportWidth: number;
  viewportHeight: number;
  damping: DampingConstant;
  maxSpeed: number;
  screenPosition: [number, number];
  fitMode: GroupFramingFitMode;
  minDistance: number;
  maxDistance: number;
  framingMode: GroupFramingMode;

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
    framingMode: GroupFramingMode = 'horizontalAndVertical',
    maxSpeed = Infinity,
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
    this.framingMode = framingMode;
    this.maxSpeed = maxSpeed;
  }

  /** Re-measure member sizes on the next update. */
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

    const includeVertical = this.framingMode !== 'horizontal';
    const includeHorizontal = this.framingMode !== 'vertical';
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
        // aren't independent worst cases - check all 8 corners directly and take the true max.
        for (const sx of CORNER_SIGNS) {
          for (const sy of CORNER_SIGNS) {
            for (const sz of CORNER_SIGNS) {
              const cornerUp = offsetUp + sx * axisXUp + sy * axisYUp + sz * axisZUp;
              const cornerRight = offsetRight + sx * axisXRight + sy * axisYRight + sz * axisZRight;
              const cornerForward = offsetForward + sx * axisXForward + sy * axisYForward + sz * axisZForward;
              if (includeVertical) {
                requiredDistance = Math.max(
                  requiredDistance,
                  (Math.abs(cornerUp) + padding) / tanVertical - cornerForward,
                );
              }
              if (includeHorizontal) {
                requiredDistance = Math.max(
                  requiredDistance,
                  (Math.abs(cornerRight) + padding) / tanHorizontal - cornerForward,
                );
              }
            }
          }
        }
      } else {
        // exact per-axis sphere/frustum-plane distance, not an isotropic offset.length() - an offset
        // mostly along the WIDER axis shouldn't be penalized as if it could be along the narrower one.
        const effectiveRadius = (member.radius ?? 0) + padding;
        if (includeVertical) {
          const vertical = (effectiveRadius + Math.abs(offsetUp) * cosVertical) / sinVertical - offsetForward;
          requiredDistance = Math.max(requiredDistance, vertical);
        }
        if (includeHorizontal) {
          const horizontal = (effectiveRadius + Math.abs(offsetRight) * cosHorizontal) / sinHorizontal - offsetForward;
          requiredDistance = Math.max(requiredDistance, horizontal);
        }
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
      : this.distanceDamper.update(this.currentDistance, distance, this.damping, dt, this.maxSpeed);

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
