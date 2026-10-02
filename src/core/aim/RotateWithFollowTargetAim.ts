import type { Quat } from 'math';
import type { CameraState } from '../CameraState.js';
import type { DampingConstant } from '../damping/Damper.js';
import type { TargetPose } from '../TargetPose.js';
import {
  createRotateWithFollowTargetParams,
  createRotateWithFollowTargetState,
  primeRotateWithFollowTarget,
  updateRotateWithFollowTarget,
  type RotateWithFollowTargetParams,
} from './rotateWithFollowTarget.js';

export type RotateWithFollowTargetOptions = Partial<RotateWithFollowTargetParams>;

/** Follows the target's rotation. Layers override `readTarget` to read their own targets. */
export class RotateWithFollowTargetAim<T = TargetPose | null> implements RotateWithFollowTargetParams {
  target: T;
  declare damping: DampingConstant;
  declare maxSpeed: number;

  readonly state = createRotateWithFollowTargetState();

  constructor(target: T, options?: RotateWithFollowTargetOptions) {
    this.target = target;
    Object.assign(this, createRotateWithFollowTargetParams(options));
  }

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    const pose = this.readTarget();
    const rotation = pose?.hasRotation ? pose.rotation : null;
    updateRotateWithFollowTarget(out, this.state, this, rotation, dt, justActivated);
  };

  primeFrom = (rotation: Quat): void => primeRotateWithFollowTarget(this.state, this, rotation);

  /** This frame's target pose, or `null` when there is none. Only its rotation is read. */
  protected readTarget(): TargetPose | null {
    return this.target as TargetPose | null;
  }
}
