import { clamp, degreesToRadians, vec3, type Vec3 } from 'math';
import type { CameraState } from '../CameraState.js';
import { createDamperState, damp, resetDamper, type DamperState, type DampingConstant } from '../damping/Damper.js';
import { createTargetExtent, type TargetExtent } from '../TargetExtent.js';
import { withDefaults } from '../params.js';

/** A group member resolved for this frame. Unresolved members are skipped. */
export type GroupMember = { position: Vec3; extent: TargetExtent; weight: number; resolved: boolean };

export const createGroupMember = (): GroupMember => ({
  position: [0, 0, 0],
  extent: createTargetExtent(),
  weight: 1,
  resolved: false,
});

/** Strategy used to compute the group's position. */
export type GroupPositionMode = 'groupCenter' | 'groupAverage';

/** Fit mode controlling whether the extension can dolly the camera closer. */
export type GroupFramingFitMode = 'ceiling' | 'rigid';

/** Which screen dimensions the fit distance has to satisfy. */
export type GroupFramingMode = 'horizontal' | 'vertical' | 'horizontalAndVertical';

export type GroupFramingParams = {
  /** Margin kept clear around the group's members, in world units. */
  padding: number;
  /** Viewport width in pixels. */
  viewportWidth: number;
  /** Viewport height in pixels. */
  viewportHeight: number;
  /** Response time for distance and screen composition. */
  damping: DampingConstant;
  /** Maximum damping speed, in world units/sec. */
  maxSpeed: number;
  /** Frustum offset used to compose the group on screen. */
  screenPosition: [number, number];
  /** `'ceiling'` never dollies closer than the Body placed the camera, `'rigid'` always sits at the fit distance. */
  fitMode: GroupFramingFitMode;
  /** Minimum fit distance. */
  minDistance: number;
  /** Maximum fit distance. */
  maxDistance: number;
  /** Which screen dimensions the fit distance has to satisfy. */
  framingMode: GroupFramingMode;
};

/** Every setting from `settings`, or its default. */
export const createGroupFramingParams = (settings?: Partial<GroupFramingParams>): GroupFramingParams =>
  withDefaults(
    {
      padding: 0,
      viewportWidth: 1,
      viewportHeight: 1,
      damping: 0,
      maxSpeed: Infinity,
      screenPosition: [0, 0],
      fitMode: 'ceiling',
      minDistance: 0,
      maxDistance: Infinity,
      framingMode: 'horizontalAndVertical',
    },
    settings,
  );

export type GroupFramingState = {
  distanceDamper: DamperState;
  screenPositionXDamper: DamperState;
  screenPositionYDamper: DamperState;
  currentDistance: number;
  currentScreenPosition: [number, number];
};

export const createGroupFramingState = (): GroupFramingState => ({
  distanceDamper: createDamperState(),
  screenPositionXDamper: createDamperState(),
  screenPositionYDamper: createDamperState(),
  currentDistance: 0,
  currentScreenPosition: [0, 0],
});

const scratchMin: Vec3 = [0, 0, 0];
const scratchMax: Vec3 = [0, 0, 0];
const scratchAccumulator: Vec3 = [0, 0, 0];
const scratchGroupPosition: Vec3 = [0, 0, 0];
const scratchRight: Vec3 = [0, 0, 0];
const scratchUp: Vec3 = [0, 0, 0];
const scratchForward: Vec3 = [0, 0, 0];
const scratchOffset: Vec3 = [0, 0, 0];
const scratchAxisX: Vec3 = [0, 0, 0];
const scratchAxisY: Vec3 = [0, 0, 0];
const scratchAxisZ: Vec3 = [0, 0, 0];
const scratchBackward: Vec3 = [0, 0, 0];
const rightAxis: Vec3 = [1, 0, 0];
const upAxis: Vec3 = [0, 1, 0];
const forwardAxis: Vec3 = [0, 0, -1];
const backwardAxis: Vec3 = [0, 0, 1];
const CORNER_SIGNS = [-1, 1] as const;

/** A member's enclosing radius: a box's half-diagonal, otherwise its sphere radius. */
const fallbackRadius = (member: GroupMember): number =>
  member.extent.hasSize ? vec3.length(member.extent.size) / 2 : member.extent.radius;

function computeCenterPosition(out: Vec3, members: readonly GroupMember[]): boolean {
  let any = false;
  for (const member of members) {
    if (!member.resolved) continue;
    const radius = fallbackRadius(member);
    const p = member.position;
    if (!any) {
      vec3.subtractScalar(scratchMin, p, radius);
      vec3.addScalar(scratchMax, p, radius);
      any = true;
      continue;
    }
    scratchMin[0] = Math.min(scratchMin[0], p[0] - radius);
    scratchMin[1] = Math.min(scratchMin[1], p[1] - radius);
    scratchMin[2] = Math.min(scratchMin[2], p[2] - radius);
    scratchMax[0] = Math.max(scratchMax[0], p[0] + radius);
    scratchMax[1] = Math.max(scratchMax[1], p[1] + radius);
    scratchMax[2] = Math.max(scratchMax[2], p[2] + radius);
  }
  if (!any) return false;
  vec3.scale(out, vec3.add(out, scratchMin, scratchMax), 0.5);
  return true;
}

function computeAveragePosition(out: Vec3, members: readonly GroupMember[]): boolean {
  let totalWeight = 0;
  vec3.set(scratchAccumulator, 0, 0, 0);
  for (const member of members) {
    if (member.weight <= 0 || !member.resolved) continue;
    vec3.scaleAndAdd(scratchAccumulator, scratchAccumulator, member.position, member.weight);
    totalWeight += member.weight;
  }
  if (totalWeight <= 0) return false;
  vec3.scale(out, scratchAccumulator, 1 / totalWeight);
  return true;
}

/**
 * Writes the group position to `outPosition` and returns a conservative enclosing radius, or -1 (leaving
 * `outPosition` untouched) when no member is resolved.
 */
export function computeGroupBounds(
  outPosition: Vec3,
  members: readonly GroupMember[],
  mode: GroupPositionMode,
): number {
  const resolved =
    mode === 'groupAverage'
      ? computeAveragePosition(outPosition, members)
      : computeCenterPosition(outPosition, members);
  if (!resolved) return -1;

  let radius = 0;
  for (const member of members) {
    if (!member.resolved) continue;
    const reach = vec3.distance(member.position, outPosition) + fallbackRadius(member);
    if (reach > radius) radius = reach;
  }
  return radius;
}

/** Half the horizontal field of view, in radians, for a vertical half-FOV and aspect ratio. */
export const horizontalHalfFov = (verticalHalfFov: number, aspect: number): number =>
  Math.atan(Math.tan(verticalHalfFov) * aspect);

/**
 * Keeps the group inside the frame by moving `out` along its own view axis and easing `viewOffset` to
 * `screenPosition`. Returns true while still moving.
 */
export function updateGroupFraming(
  out: CameraState,
  state: GroupFramingState,
  params: GroupFramingParams,
  members: readonly GroupMember[],
  positionMode: GroupPositionMode,
  dt: number,
  justActivated: boolean,
): boolean {
  if (justActivated) {
    resetDamper(state.distanceDamper);
    resetDamper(state.screenPositionXDamper);
    resetDamper(state.screenPositionYDamper);
  }
  const boundsRadius = computeGroupBounds(scratchGroupPosition, members, positionMode);
  if (boundsRadius <= 0) return false;

  const verticalHalfFov = degreesToRadians(out.fov) / 2;
  const aspect = params.viewportWidth / params.viewportHeight;
  const horizontalHalf = horizontalHalfFov(verticalHalfFov, aspect);

  vec3.transformQuat(scratchRight, rightAxis, out.quaternion);
  vec3.transformQuat(scratchUp, upAxis, out.quaternion);
  vec3.transformQuat(scratchForward, forwardAxis, out.quaternion);

  const includeVertical = params.framingMode !== 'horizontal';
  const includeHorizontal = params.framingMode !== 'vertical';
  const padding = Math.max(0, params.padding);
  const tanVertical = Math.tan(verticalHalfFov);
  const tanHorizontal = Math.tan(horizontalHalf);
  const sinVertical = Math.sin(verticalHalfFov);
  const sinHorizontal = Math.sin(horizontalHalf);
  const cosVertical = Math.cos(verticalHalfFov);
  const cosHorizontal = Math.cos(horizontalHalf);

  let requiredDistance = 0;

  for (const member of members) {
    if (!member.resolved) continue;
    vec3.subtract(scratchOffset, member.position, scratchGroupPosition);
    const offsetUp = vec3.dot(scratchOffset, scratchUp);
    const offsetRight = vec3.dot(scratchOffset, scratchRight);
    const offsetForward = vec3.dot(scratchOffset, scratchForward);
    const { extent } = member;

    if (extent.hasSize) {
      const { size, rotation } = extent;
      vec3.transformQuat(scratchAxisX, vec3.set(scratchAxisX, size[0] * 0.5, 0, 0), rotation);
      vec3.transformQuat(scratchAxisY, vec3.set(scratchAxisY, 0, size[1] * 0.5, 0), rotation);
      vec3.transformQuat(scratchAxisZ, vec3.set(scratchAxisZ, 0, 0, size[2] * 0.5), rotation);

      const axisXUp = vec3.dot(scratchAxisX, scratchUp);
      const axisYUp = vec3.dot(scratchAxisY, scratchUp);
      const axisZUp = vec3.dot(scratchAxisZ, scratchUp);
      const axisXRight = vec3.dot(scratchAxisX, scratchRight);
      const axisYRight = vec3.dot(scratchAxisY, scratchRight);
      const axisZRight = vec3.dot(scratchAxisZ, scratchRight);
      const axisXForward = vec3.dot(scratchAxisX, scratchForward);
      const axisYForward = vec3.dot(scratchAxisY, scratchForward);
      const axisZForward = vec3.dot(scratchAxisZ, scratchForward);

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
      const effectiveRadius = extent.radius + padding;
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

  const clampedRequiredDistance = clamp(requiredDistance, params.minDistance, params.maxDistance);
  const distance =
    params.fitMode === 'rigid'
      ? clampedRequiredDistance
      : Math.max(vec3.distance(out.position, scratchGroupPosition), clampedRequiredDistance);

  const instant = typeof params.damping === 'number' && params.damping <= 0;

  if (instant) state.currentDistance = distance;
  else {
    state.distanceDamper.value = state.currentDistance;
    state.currentDistance = damp(state.distanceDamper, distance, params.damping, dt, params.maxSpeed).value;
  }

  vec3.transformQuat(scratchBackward, backwardAxis, out.quaternion);
  vec3.scaleAndAdd(out.position, scratchGroupPosition, scratchBackward, state.currentDistance);

  const current = state.currentScreenPosition;
  if (instant) {
    current[0] = params.screenPosition[0];
    current[1] = params.screenPosition[1];
  } else {
    state.screenPositionXDamper.value = current[0];
    current[0] = damp(state.screenPositionXDamper, params.screenPosition[0], params.damping, dt).value;
    state.screenPositionYDamper.value = current[1];
    current[1] = damp(state.screenPositionYDamper, params.screenPosition[1], params.damping, dt).value;
  }

  out.viewOffset[0] = current[0];
  out.viewOffset[1] = current[1];

  return (
    state.currentDistance !== distance ||
    current[0] !== params.screenPosition[0] ||
    current[1] !== params.screenPosition[1]
  );
}
