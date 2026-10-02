import type { Vec3 } from 'math';
import type { CameraState } from '../CameraState.js';
import type { DampingConstant } from '../damping/Damper.js';
import type { TargetPose } from '../TargetPose.js';
import type { BindingMode } from './BindingModes.js';
import { createFollowParams, createFollowState, primeFollow, updateFollow, type FollowParams } from './follow.js';

export type FollowOptions = Partial<FollowParams>;

/** Follows a target with an offset rotated according to `bindingMode`. Layers override `readTarget`. */
export class FollowBody<T = TargetPose | null> implements FollowParams {
  target: T;
  declare offset: Vec3;
  declare damping: DampingConstant;
  declare bindingMode: BindingMode;
  declare maxSpeed: number;

  readonly state = createFollowState();
  private lastTarget: T | undefined = undefined;

  constructor(target: T, options?: FollowOptions) {
    this.target = target;
    Object.assign(this, createFollowParams(options));
  }

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    if (this.target !== this.lastTarget) {
      this.lastTarget = this.target;
      this.state.assigned = false;
    }
    updateFollow(out, this.state, this, this.readTarget(), dt, justActivated);
  };

  primeFrom = (position: Vec3): void => primeFollow(this.state, this, position);

  /** This frame's target pose, or `null` when there is none. */
  protected readTarget(): TargetPose | null {
    return this.target as TargetPose | null;
  }
}
