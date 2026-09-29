import { mat3, mat4, quat, vec3, type Mat3, type Mat4, type Quat, type Vec3 } from 'math';
import type { CameraState } from '../CameraState';
import type { DampingConstant } from '../damping/Damper';
import {
  createVector3DamperState,
  dampVector3,
  resetVector3Damper,
  type Vector3DamperState,
} from '../damping/Vector3Damper';
import type { Target } from '../resolve/Target';
import type { TargetSlot } from '../resolve/TargetRegistry';
import { createTargetPose, type TargetPose } from '../TargetPose';
import { readTargetPose } from '../three/readTargetPose';
import { BindingModes, type BindingMode } from './BindingModes';

export type FollowParams = {
  offset: Vec3;
  damping: DampingConstant;
  bindingMode: BindingMode;
  maxSpeed: number;
};

export type FollowState = {
  damper: Vector3DamperState;
  primed: boolean;
  /** Target rotation captured by `lockToTargetOnAssign`, valid while `assigned`. */
  assignedRotation: Quat;
  assigned: boolean;
};

export const createFollowState = (): FollowState => ({
  damper: createVector3DamperState(),
  primed: false,
  assignedRotation: [0, 0, 0, 1],
  assigned: false,
});

/** Whether `updateFollow` will read `target.rotation` this frame. */
export const followNeedsTargetRotation = (state: FollowState, params: FollowParams): boolean =>
  params.bindingMode !== BindingModes.worldSpace &&
  !(params.bindingMode === BindingModes.lockToTargetOnAssign && state.assigned);

const worldUp: Vec3 = [0, 1, 0];
const forwardAxis: Vec3 = [0, 0, -1];
const origin: Vec3 = [0, 0, 0];
const scratchRotation: Quat = [0, 0, 0, 1];
const scratchRotatedOffset: Vec3 = [0, 0, 0];
const scratchDesired: Vec3 = [0, 0, 0];
const scratchForward: Vec3 = [0, 0, 0];
const scratchLookMatrix: Mat4 = mat4.create();
const scratchRotationMatrix: Mat3 = mat3.create();

function resolveOffsetRotation(out: Quat, state: FollowState, params: FollowParams, target: TargetPose): void {
  if (params.bindingMode === BindingModes.worldSpace) {
    quat.identity(out);
    return;
  }

  if (params.bindingMode === BindingModes.lockToTargetOnAssign) {
    if (!state.assigned) {
      state.assigned = true;
      if (target.hasRotation) quat.copy(state.assignedRotation, target.rotation);
      else quat.identity(state.assignedRotation);
    }
    quat.copy(out, state.assignedRotation);
    return;
  }

  if (!target.hasRotation) {
    quat.identity(out);
    return;
  }
  quat.copy(out, target.rotation);

  if (params.bindingMode === BindingModes.lockToTarget) return;

  vec3.transformQuat(scratchForward, forwardAxis, out);
  if (params.bindingMode === BindingModes.lockToTargetWithWorldUp) scratchForward[1] = 0;
  if (vec3.squaredLength(scratchForward) < 1e-10) return; // degenerate (straight up/down): keep the full rotation
  vec3.normalize(scratchForward, scratchForward);
  mat4.targetTo(scratchLookMatrix, origin, scratchForward, worldUp);
  // Not quat.fromMat4: it allocates a Mat3 per call.
  quat.fromMat3(out, mat3.fromMat4(scratchRotationMatrix, scratchLookMatrix));
}

/** Moves `out` to the target position plus `offset`, rotated according to `bindingMode`. A `null` target leaves `out` as is. */
export function updateFollow(
  out: CameraState,
  state: FollowState,
  params: FollowParams,
  target: TargetPose | null,
  dt: number,
  justActivated: boolean,
): void {
  if (justActivated) {
    if (state.primed) state.primed = false;
    else resetVector3Damper(state.damper);
  }
  if (!target) return;

  resolveOffsetRotation(scratchRotation, state, params, target);
  vec3.transformQuat(scratchRotatedOffset, params.offset, scratchRotation);
  vec3.add(scratchDesired, scratchRotatedOffset, target.position);

  dampVector3(state.damper, out.position, scratchDesired, params.damping, dt, params.maxSpeed);
  vec3.subtract(out.target, out.position, scratchRotatedOffset);
  out.hasTarget = true;
  vec3.transformQuat(out.referenceUp, worldUp, scratchRotation);
}

/** Start the next activation from `position` instead of snapping to the target. */
export function primeFollow(state: FollowState, params: FollowParams, position: Vec3): void {
  dampVector3(state.damper, position, position, params.damping, 0);
  state.primed = true;
}

/** Follows a target with an offset rotated according to `bindingMode`. */
export class FollowBody implements FollowParams {
  target: Target;
  targetSlot: TargetSlot | null = null;
  offset: Vec3;
  damping: DampingConstant;
  bindingMode: BindingMode;
  maxSpeed: number;

  readonly state = createFollowState();
  private readonly pose = createTargetPose();
  private lastTarget: Target = undefined;

  constructor(
    target: Target,
    offset: Vec3 = [0, 0, 10],
    damping: DampingConstant = 0,
    bindingMode: BindingMode = BindingModes.lockToTarget,
    maxSpeed = Infinity,
  ) {
    this.target = target;
    this.offset = offset;
    this.damping = damping;
    this.bindingMode = bindingMode;
    this.maxSpeed = maxSpeed;
  }

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    if (this.target !== this.lastTarget) {
      this.lastTarget = this.target;
      this.state.assigned = false;
    }
    const withRotation = followNeedsTargetRotation(this.state, this);
    const resolved = readTargetPose(this.pose, this.target, this.targetSlot, withRotation);
    updateFollow(out, this.state, this, resolved ? this.pose : null, dt, justActivated);
  };

  primeFrom = (position: Vec3): void => primeFollow(this.state, this, position);
}
