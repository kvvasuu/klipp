import type { Quat, Vec3 } from 'math';
import type { CameraState } from '../CameraState.js';
import type { DampingConstant } from '../damping/Damper.js';
import type { TargetPose } from '../TargetPose.js';
import {
  createRotationComposerParams,
  createRotationComposerState,
  primeRotationComposer,
  retargetRotationComposer,
  updateRotationComposer,
  type RotationComposerParams,
} from './rotationComposer.js';

/** Rotates the camera to place a target at `screenPosition`. Layers override `readTarget`. */
export class RotationComposerAimCore<T = TargetPose | null> implements RotationComposerParams {
  target: T;
  declare screenPosition: [number, number];
  declare aspect: number;
  declare deadZone: [number, number];
  declare damping: DampingConstant;
  declare maxSpeed: number;
  declare hardLimit: [number, number];
  declare targetOffset: Vec3;
  declare lookaheadTime: number;
  declare lookaheadSmoothing: number;
  declare lookaheadIgnoreY: boolean;

  readonly state = createRotationComposerState();
  private lastTarget: T | undefined = undefined;

  constructor(target: T, options?: Partial<RotationComposerParams>) {
    this.target = target;
    Object.assign(this, createRotationComposerParams(options));
  }

  primeFrom = (rotation: Quat): void => primeRotationComposer(this.state, this, rotation);

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    const pose = this.readTarget();
    if (pose) {
      if (this.target !== this.lastTarget) retargetRotationComposer(this.state);
      this.lastTarget = this.target;
    }
    updateRotationComposer(out, this.state, this, pose, dt, justActivated);
  };

  /** This frame's target pose with its extent, or `null` when there is none. */
  protected readTarget(): TargetPose | null {
    return this.target as TargetPose | null;
  }
}
