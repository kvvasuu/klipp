import { clamp, degreesToRadians, vec3, type Vec3 } from 'math';
import type { CameraState } from '../CameraState.js';
import { createDamperState, damp, resetDamper, type DamperState, type DampingConstant } from '../damping/Damper.js';
import {
  createVector3DamperState,
  dampVector3,
  resetVector3Damper,
  type Vector3DamperState,
} from '../damping/dampVector3.js';
import {
  addPredictorPosition,
  createPredictorState,
  predictPositionDelta,
  resetPredictor,
  type PredictorState,
} from '../damping/predictor.js';
import { withDefaults } from '../params.js';
import { projectTargetExtent, type TargetExtent } from '../TargetExtent.js';

export type PositionComposerParams = {
  /** Desired distance from the camera to the target. */
  cameraDistance: number;
  /** Where the target should land on screen: `[x, y]`, `0` = center, `±1` = edge. */
  screenPosition: [number, number];
  /** Viewport width divided by height. */
  aspect: number;
  /** Allowed target drift from `screenPosition` before the camera shifts laterally. */
  deadZone: [number, number];
  /** Response time for dolly and lateral composition. */
  damping: DampingConstant;
  /** Maximum allowed target drift, enforced immediately. */
  hardLimit: [number, number];
  /** Allowed target depth drift before the camera dollies. */
  depthDeadZone: number;
  /** Maximum damping speed for both stages, in world units/sec. */
  maxSpeed: number;
  /** Seconds to extrapolate the target's tracked position ahead by. */
  lookaheadTime: number;
  /** Smooth-time budget (seconds) for the velocity estimate driving `lookaheadTime`. */
  lookaheadSmoothing: number;
  /** Whether lookahead ignores vertical movement. */
  lookaheadIgnoreY: boolean;
};

/** Every setting from `settings`, or its default. */
export const createPositionComposerParams = (settings?: Partial<PositionComposerParams>): PositionComposerParams =>
  withDefaults(
    {
      cameraDistance: 10,
      screenPosition: [0, 0],
      aspect: 1,
      deadZone: [0, 0],
      damping: 0,
      hardLimit: [0, 0],
      depthDeadZone: 0,
      maxSpeed: Infinity,
      lookaheadTime: 0,
      lookaheadSmoothing: 1,
      lookaheadIgnoreY: false,
    },
    settings,
  );

export type PositionComposerState = {
  damper: Vector3DamperState;
  depthDamper: DamperState;
  predictor: PredictorState;
  primed: boolean;
  /** Last desired lateral position, kept while the target stays inside the dead zone. */
  lastActiveDesiredPosition: Vec3;
  hasActiveDesiredPosition: boolean;
};

export const createPositionComposerState = (): PositionComposerState => ({
  damper: createVector3DamperState(),
  depthDamper: createDamperState(),
  predictor: createPredictorState(),
  primed: false,
  lastActiveDesiredPosition: [0, 0, 0],
  hasActiveDesiredPosition: false,
});

const scratchTarget: Vec3 = [0, 0, 0];
const scratchLookaheadDelta: Vec3 = [0, 0, 0];
const scratchForward: Vec3 = [0, 0, 0];
const scratchRight: Vec3 = [0, 0, 0];
const scratchUp: Vec3 = [0, 0, 0];
const scratchRelative: Vec3 = [0, 0, 0];
const scratchDesired: Vec3 = [0, 0, 0];
const scratchExtents: [number, number] = [0, 0];
const forwardAxis: Vec3 = [0, 0, -1];
const rightAxis: Vec3 = [1, 0, 0];
const upAxis: Vec3 = [0, 1, 0];

/**
 * Positions `out` using depth and screen-space composition around `targetPosition`. A `null` target
 * leaves `out` as is. `retarget` restarts the lookahead history (the target object changed).
 */
export function updatePositionComposer(
  out: CameraState,
  state: PositionComposerState,
  params: PositionComposerParams,
  targetPosition: Vec3 | null,
  extent: TargetExtent,
  dt: number,
  justActivated: boolean,
  retarget: boolean,
): void {
  const skipReset = justActivated && state.primed;
  if (justActivated) state.primed = false;
  if (!targetPosition) return;

  const target = vec3.copy(scratchTarget, targetPosition);
  if (justActivated || retarget) resetPredictor(state.predictor);
  addPredictorPosition(state.predictor, target, dt, params.lookaheadSmoothing);
  if (params.lookaheadTime > 0) {
    predictPositionDelta(scratchLookaheadDelta, state.predictor, params.lookaheadTime);
    if (params.lookaheadIgnoreY) scratchLookaheadDelta[1] = 0;
    vec3.add(target, target, scratchLookaheadDelta);
  }

  vec3.copy(out.target, target);
  out.hasTarget = true;

  const position = out.position;
  vec3.transformQuat(scratchForward, forwardAxis, out.quaternion);
  vec3.transformQuat(scratchRight, rightAxis, out.quaternion);
  vec3.transformQuat(scratchUp, upAxis, out.quaternion);

  vec3.subtract(scratchRelative, target, position);
  const currentDepth = vec3.dot(scratchRelative, scratchForward);

  let desiredDepth = params.cameraDistance;
  let insideDepthDeadZone = false;

  // A fresh activation has no meaningful previous camera position for this check.
  if (!justActivated && params.depthDeadZone > 0) {
    const depthError = currentDepth - params.cameraDistance;
    insideDepthDeadZone = Math.abs(depthError) <= params.depthDeadZone;
    if (!insideDepthDeadZone) {
      desiredDepth = params.cameraDistance + clamp(depthError, -params.depthDeadZone, params.depthDeadZone);
    }
  }

  // Recompute the desired depth so target motion remains visible inside the dead zone.
  if (!insideDepthDeadZone) {
    if (justActivated && !skipReset) resetDamper(state.depthDamper);
    const instant = typeof params.damping === 'number' && params.damping <= 0;
    state.depthDamper.value = currentDepth;
    const dampedDepth = instant
      ? desiredDepth
      : damp(state.depthDamper, desiredDepth, params.damping, dt, params.maxSpeed).value;
    vec3.scaleAndAdd(position, position, scratchForward, currentDepth - dampedDepth);
  }

  // Shift laterally to screenPosition or the dead-zone edge.
  vec3.subtract(scratchRelative, target, position);
  const halfHeight = params.cameraDistance * Math.tan(degreesToRadians(out.fov) / 2);
  const halfWidth = halfHeight * params.aspect;

  projectTargetExtent(scratchExtents, extent, scratchRight, scratchUp);
  const extentX = scratchExtents[0] / halfWidth;
  const extentY = scratchExtents[1] / halfHeight;

  const currentRight = vec3.dot(scratchRelative, scratchRight);
  const currentUp = vec3.dot(scratchRelative, scratchUp);

  let desiredScreenX = params.screenPosition[0];
  let desiredScreenY = params.screenPosition[1];
  let insideDeadZone = false;

  // A fresh activation has no meaningful previous camera position for this check.
  if (!justActivated && (params.deadZone[0] > 0 || params.deadZone[1] > 0)) {
    const halfDeadWidth = params.deadZone[0];
    const halfDeadHeight = params.deadZone[1];
    // Cap the extent to prevent an oversized target from overshooting the zone.
    const deadExtentX = Math.min(extentX, halfDeadWidth);
    const deadExtentY = Math.min(extentY, halfDeadHeight);

    const errorX = currentRight / halfWidth - params.screenPosition[0];
    const errorY = currentUp / halfHeight - params.screenPosition[1];
    // Check the target's leading edge, not only its center.
    const edgeErrorX = errorX + Math.sign(errorX) * deadExtentX;
    const edgeErrorY = errorY + Math.sign(errorY) * deadExtentY;
    insideDeadZone = Math.abs(edgeErrorX) <= halfDeadWidth && Math.abs(edgeErrorY) <= halfDeadHeight;

    if (!insideDeadZone) {
      desiredScreenX =
        params.screenPosition[0] + clamp(edgeErrorX, -halfDeadWidth, halfDeadWidth) - Math.sign(errorX) * deadExtentX;
      desiredScreenY =
        params.screenPosition[1] + clamp(edgeErrorY, -halfDeadHeight, halfDeadHeight) - Math.sign(errorY) * deadExtentY;
    }
  }

  // Enforce hardLimit independently of the dead zone.
  if (!insideDeadZone) {
    vec3.scaleAndAdd(scratchDesired, position, scratchRight, currentRight - desiredScreenX * halfWidth);
    vec3.scaleAndAdd(scratchDesired, scratchDesired, scratchUp, currentUp - desiredScreenY * halfHeight);
    vec3.copy(state.lastActiveDesiredPosition, scratchDesired);
    state.hasActiveDesiredPosition = true;
  } else if (state.hasActiveDesiredPosition) {
    // Keep damping toward the last active target instead of the current camera position.
    vec3.copy(scratchDesired, state.lastActiveDesiredPosition);
  } else {
    vec3.copy(scratchDesired, position); // No previous target means no correction.
  }

  if (justActivated && !skipReset) resetVector3Damper(state.damper);
  dampVector3(state.damper, position, scratchDesired, params.damping, dt, params.maxSpeed);

  if (params.hardLimit[0] <= 0 && params.hardLimit[1] <= 0) return;

  // Undamped pass: the same screen-space math, clamped to hardLimit instead of the dead zone edge.
  vec3.subtract(scratchRelative, target, position);
  const afterRight = vec3.dot(scratchRelative, scratchRight);
  const afterUp = vec3.dot(scratchRelative, scratchUp);

  const halfLimitWidth = params.hardLimit[0];
  const halfLimitHeight = params.hardLimit[1];
  // Same overshoot cap as the dead zone pass, against this box's own half-size.
  const limitExtentX = Math.min(extentX, halfLimitWidth);
  const limitExtentY = Math.min(extentY, halfLimitHeight);

  const limitErrorX = afterRight / halfWidth - params.screenPosition[0];
  const limitErrorY = afterUp / halfHeight - params.screenPosition[1];
  const limitEdgeErrorX = limitErrorX + Math.sign(limitErrorX) * limitExtentX;
  const limitEdgeErrorY = limitErrorY + Math.sign(limitErrorY) * limitExtentY;
  if (Math.abs(limitEdgeErrorX) <= halfLimitWidth && Math.abs(limitEdgeErrorY) <= halfLimitHeight) return;

  const clampedX =
    params.screenPosition[0] +
    clamp(limitEdgeErrorX, -halfLimitWidth, halfLimitWidth) -
    Math.sign(limitErrorX) * limitExtentX;
  const clampedY =
    params.screenPosition[1] +
    clamp(limitEdgeErrorY, -halfLimitHeight, halfLimitHeight) -
    Math.sign(limitErrorY) * limitExtentY;
  vec3.scaleAndAdd(position, position, scratchRight, afterRight - clampedX * halfWidth);
  vec3.scaleAndAdd(position, position, scratchUp, afterUp - clampedY * halfHeight);
}

/** Start the next activation from `position` instead of snapping to the target. */
export function primePositionComposer(
  state: PositionComposerState,
  params: PositionComposerParams,
  position: Vec3,
): void {
  dampVector3(state.damper, position, position, params.damping, 0);
  state.depthDamper.value = 0;
  damp(state.depthDamper, 0, params.damping, 0);
  state.primed = true;
}
