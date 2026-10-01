import { clamp, degreesToRadians, mat4, quat, vec3, vec4, type Mat4, type Quat, type Vec3 } from 'math';
import type { CameraState } from '../CameraState.js';
import { createDamperState, damp, resetDamper, type DamperState, type DampingConstant } from '../damping/Damper.js';
import { dampQuaternion } from '../damping/dampQuaternion.js';
import {
  addPredictorPosition,
  createPredictorState,
  predictPositionDelta,
  resetPredictor,
  type PredictorState,
} from '../damping/predictor.js';
import { projectTargetExtent, type TargetExtent } from '../TargetExtent.js';
import { withDefaults } from '../params.js';

export type RotationComposerParams = {
  /** Where the target should land on screen: `[x, y]`, `0` = center, `±1` = edge. */
  screenPosition: [number, number];
  /** Viewport width divided by height. */
  aspect: number;
  /** Allowed target drift from `screenPosition` before the camera reacts. */
  deadZone: [number, number];
  /** Response time when the target leaves the `deadZone`. */
  damping: DampingConstant;
  /** Maximum damping speed, in radians/sec. */
  maxSpeed: number;
  /** Maximum allowed target drift, enforced immediately. */
  hardLimit: [number, number];
  /** Offset from the target, in the target's local space. */
  targetOffset: Vec3;
  /** Seconds to aim ahead of the target's current position. */
  lookaheadTime: number;
  /** Smoothing time for the lookahead velocity estimate. */
  lookaheadSmoothing: number;
  /** Whether lookahead ignores vertical movement. */
  lookaheadIgnoreY: boolean;
};

/** Every setting from `settings`, or its default. */
export const createRotationComposerParams = (settings?: Partial<RotationComposerParams>): RotationComposerParams =>
  withDefaults(
    {
      screenPosition: [0, 0],
      aspect: 1,
      deadZone: [0, 0],
      damping: 0,
      maxSpeed: Infinity,
      hardLimit: [0, 0],
      targetOffset: [0, 0, 0],
      lookaheadTime: 0,
      lookaheadSmoothing: 1,
      lookaheadIgnoreY: false,
    },
    settings,
  );

export type RotationComposerState = {
  damper: DamperState;
  /** Damps the published look-at direction as a rotation to avoid degenerate intermediate points. */
  lookAtDirectionDamper: DamperState;
  lookAtDistanceDamper: DamperState;
  publishedLookRotation: Quat;
  publishedDistance: number;
  /** Last desired rotation, kept while the target stays inside the dead zone. */
  lastActiveDesiredRotation: Quat;
  hasActiveDesiredRotation: boolean;
  predictor: PredictorState;
  primed: boolean;
};

export const createRotationComposerState = (): RotationComposerState => ({
  damper: createDamperState(),
  lookAtDirectionDamper: createDamperState(),
  lookAtDistanceDamper: createDamperState(),
  publishedLookRotation: [0, 0, 0, 1],
  publishedDistance: 0,
  lastActiveDesiredRotation: [0, 0, 0, 1],
  hasActiveDesiredRotation: false,
  predictor: createPredictorState(),
  primed: false,
});

/** Only extents with a dead zone or hard limit are read, so callers can skip resolving them otherwise. */
export const rotationComposerNeedsExtent = (params: RotationComposerParams): boolean =>
  params.deadZone[0] > 0 || params.deadZone[1] > 0 || params.hardLimit[0] > 0 || params.hardLimit[1] > 0;

/** Matches `damp`'s own `epsilon`: the gap at which it declares the distance arrived. */
const DISTANCE_EPSILON = 1e-4;

const forwardAxis: Vec3 = [0, 0, -1];
const rightAxis: Vec3 = [1, 0, 0];
const upAxis: Vec3 = [0, 1, 0];
const scratchTarget: Vec3 = [0, 0, 0];
const scratchTargetRotation: Quat = [0, 0, 0, 1];
const scratchLookaheadDelta: Vec3 = [0, 0, 0];
const scratchOffset: Vec3 = [0, 0, 0];
const scratchDesiredRotation: Quat = [0, 0, 0, 1];
const scratchHardLimitRotation: Quat = [0, 0, 0, 1];
const scratchInverse: Quat = [0, 0, 0, 1];
const scratchLocalDir: Vec3 = [0, 0, 0];
const scratchDesiredDir: Vec3 = [0, 0, 0];
const scratchDelta: Quat = [0, 0, 0, 1];
const scratchRight: Vec3 = [0, 0, 0];
const scratchUp: Vec3 = [0, 0, 0];
const scratchLookMatrix: Mat4 = mat4.create();
const scratchExtents: [number, number] = [0, 0];
/** `[x, y, depth]` of a world point in the camera's screen space. `depth <= 0` means behind the camera. */
const scratchScreenPoint: [number, number, number] = [0, 0, 0];

function computeScreenPoint(
  position: Vec3,
  rotation: Quat,
  worldPoint: Vec3,
  tanHalfFovH: number,
  tanHalfFovV: number,
): readonly [number, number, number] {
  vec3.subtract(scratchLocalDir, worldPoint, position);
  vec3.transformQuat(scratchLocalDir, scratchLocalDir, quat.conjugate(scratchInverse, rotation));
  const depth = -scratchLocalDir[2];
  scratchScreenPoint[0] = scratchLocalDir[0] / depth / tanHalfFovH;
  scratchScreenPoint[1] = scratchLocalDir[1] / depth / tanHalfFovV;
  scratchScreenPoint[2] = depth;
  return scratchScreenPoint;
}

function lookAtRotation(out: Quat, position: Vec3, target: Vec3, up: Vec3): Quat {
  mat4.targetTo(scratchLookMatrix, position, target, up);
  return quat.fromMat4(out, scratchLookMatrix);
}

/** A look-at rotation that places the target at screen point `(desiredX, desiredY)` instead of the center. */
function composeRotationForScreenPoint(
  out: Quat,
  position: Vec3,
  target: Vec3,
  referenceUp: Vec3,
  desiredX: number,
  desiredY: number,
  tanHalfFovH: number,
  tanHalfFovV: number,
): void {
  lookAtRotation(out, position, target, referenceUp);
  if (desiredX === 0 && desiredY === 0) return;

  vec3.normalize(scratchDesiredDir, vec3.set(scratchDesiredDir, desiredX * tanHalfFovH, desiredY * tanHalfFovV, -1));
  // Not quat.rotationTo: it snaps angles under ~0.08° to identity. This direction never opposes forward.
  vec3.cross(scratchLocalDir, scratchDesiredDir, forwardAxis);
  const w = vec3.dot(scratchDesiredDir, forwardAxis) + 1;
  quat.normalize(scratchDelta, quat.set(scratchDelta, scratchLocalDir[0], scratchLocalDir[1], scratchLocalDir[2], w));
  quat.multiply(out, out, scratchDelta);
}

/**
 * Rotates `out` to place the target at `screenPosition`. A `null` target leaves `out` as is; a `null`
 * rotation counts as identity for `targetOffset`. `retarget` restarts the lookahead history.
 */
export function updateRotationComposer(
  out: CameraState,
  state: RotationComposerState,
  params: RotationComposerParams,
  targetPosition: Vec3 | null,
  targetRotation: Quat | null,
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

  if (targetRotation) quat.copy(scratchTargetRotation, targetRotation);
  else quat.identity(scratchTargetRotation);
  vec3.add(target, target, vec3.transformQuat(scratchOffset, params.targetOffset, scratchTargetRotation));

  const { position, referenceUp, quaternion: rotation } = out;

  // Publish the damped look-at point so blends do not jump to the raw target position.
  if (justActivated) {
    resetDamper(state.lookAtDirectionDamper);
    resetDamper(state.lookAtDistanceDamper);
  }
  lookAtRotation(scratchDesiredRotation, position, target, referenceUp);
  dampQuaternion(
    state.lookAtDirectionDamper,
    state.publishedLookRotation,
    scratchDesiredRotation,
    params.damping,
    dt,
    params.maxSpeed,
  );
  const targetDistance = vec3.distance(position, target);
  state.lookAtDistanceDamper.value = state.publishedDistance;
  state.publishedDistance = damp(state.lookAtDistanceDamper, targetDistance, params.damping, dt).value;
  // Publish the exact target only after both direction and distance have settled.
  if (
    vec4.exactEquals(state.publishedLookRotation, scratchDesiredRotation) &&
    Math.abs(state.publishedDistance - targetDistance) < DISTANCE_EPSILON
  ) {
    vec3.copy(out.lookAtTarget, target);
  } else {
    vec3.transformQuat(out.lookAtTarget, forwardAxis, state.publishedLookRotation);
    vec3.scaleAndAdd(out.lookAtTarget, position, out.lookAtTarget, state.publishedDistance);
  }
  out.hasLookAtTarget = true;

  const halfFovV = degreesToRadians(out.fov) / 2;
  const tanHalfFovV = Math.tan(halfFovV);
  const tanHalfFovH = tanHalfFovV * params.aspect;
  const { screenPosition, deadZone, hardLimit } = params;

  let desiredX = screenPosition[0];
  let desiredY = screenPosition[1];
  let insideDeadZone = false;

  // A fresh activation has no meaningful previous orientation for a dead-zone check.
  if (!justActivated && (deadZone[0] > 0 || deadZone[1] > 0)) {
    // Measure the target using the orientation from before this update.
    const [screenX, screenY, depth] = computeScreenPoint(position, rotation, target, tanHalfFovH, tanHalfFovV);

    if (depth > 1e-6) {
      const halfWidth = deadZone[0];
      const halfHeight = deadZone[1];
      vec3.transformQuat(scratchRight, rightAxis, rotation);
      vec3.transformQuat(scratchUp, upAxis, rotation);
      projectTargetExtent(scratchExtents, extent, scratchRight, scratchUp);
      // Cap the extent to prevent an oversized target from overshooting the zone.
      const extentX = Math.min(scratchExtents[0] / depth / tanHalfFovH, halfWidth);
      const extentY = Math.min(scratchExtents[1] / depth / tanHalfFovV, halfHeight);

      const errorX = screenX - screenPosition[0];
      const errorY = screenY - screenPosition[1];
      // Check the target's leading edge, not only its center.
      const edgeErrorX = errorX + Math.sign(errorX) * extentX;
      const edgeErrorY = errorY + Math.sign(errorY) * extentY;
      insideDeadZone = Math.abs(edgeErrorX) <= halfWidth && Math.abs(edgeErrorY) <= halfHeight;

      if (!insideDeadZone) {
        desiredX = screenPosition[0] + clamp(edgeErrorX, -halfWidth, halfWidth) - Math.sign(errorX) * extentX;
        desiredY = screenPosition[1] + clamp(edgeErrorY, -halfHeight, halfHeight) - Math.sign(errorY) * extentY;
      }
    }
    // A target behind the camera is corrected directly toward screenPosition.
  }

  // hardLimit is enforced independently of the dead zone.
  if (!insideDeadZone) {
    composeRotationForScreenPoint(
      scratchDesiredRotation,
      position,
      target,
      referenceUp,
      desiredX,
      desiredY,
      tanHalfFovH,
      tanHalfFovV,
    );
    quat.copy(state.lastActiveDesiredRotation, scratchDesiredRotation);
    state.hasActiveDesiredRotation = true;
  } else if (state.hasActiveDesiredRotation) {
    // Keep damping toward the last active target instead of the current camera rotation.
    quat.copy(scratchDesiredRotation, state.lastActiveDesiredRotation);
  } else {
    quat.copy(scratchDesiredRotation, rotation); // No previous target means no correction.
  }

  if (justActivated && !skipReset) resetDamper(state.damper);
  dampQuaternion(state.damper, rotation, scratchDesiredRotation, params.damping, dt, params.maxSpeed);

  if (hardLimit[0] <= 0 && hardLimit[1] <= 0) return;

  const [screenX, screenY, depth] = computeScreenPoint(position, rotation, target, tanHalfFovH, tanHalfFovV);
  if (depth <= 1e-6) return;

  const halfLimitWidth = hardLimit[0];
  const halfLimitHeight = hardLimit[1];
  vec3.transformQuat(scratchRight, rightAxis, rotation);
  vec3.transformQuat(scratchUp, upAxis, rotation);
  projectTargetExtent(scratchExtents, extent, scratchRight, scratchUp);
  // Cap the extent to prevent an oversized target from overshooting the limit.
  const limitExtentX = Math.min(scratchExtents[0] / depth / tanHalfFovH, halfLimitWidth);
  const limitExtentY = Math.min(scratchExtents[1] / depth / tanHalfFovV, halfLimitHeight);

  const errorX = screenX - screenPosition[0];
  const errorY = screenY - screenPosition[1];
  const edgeErrorX = errorX + Math.sign(errorX) * limitExtentX;
  const edgeErrorY = errorY + Math.sign(errorY) * limitExtentY;
  if (Math.abs(edgeErrorX) <= halfLimitWidth && Math.abs(edgeErrorY) <= halfLimitHeight) return;

  const clampedX =
    screenPosition[0] + clamp(edgeErrorX, -halfLimitWidth, halfLimitWidth) - Math.sign(errorX) * limitExtentX;
  const clampedY =
    screenPosition[1] + clamp(edgeErrorY, -halfLimitHeight, halfLimitHeight) - Math.sign(errorY) * limitExtentY;
  composeRotationForScreenPoint(
    scratchHardLimitRotation,
    position,
    target,
    referenceUp,
    clampedX,
    clampedY,
    tanHalfFovH,
    tanHalfFovV,
  );
  quat.copy(rotation, scratchHardLimitRotation);
}

/** Start the next activation from `rotation` instead of snapping to the target. */
export function primeRotationComposer(
  state: RotationComposerState,
  params: RotationComposerParams,
  rotation: Quat,
): void {
  dampQuaternion(state.damper, rotation, rotation, params.damping, 0);
  state.primed = true;
}
