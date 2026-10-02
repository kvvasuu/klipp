import type { Quat, Vec3 } from 'math';
import type { CameraState } from '../CameraState.js';
import type { TargetPose } from '../TargetPose.js';
import { createPanTiltState, seedPanTilt, updatePanTilt } from './panTilt.js';

/** Rotation from two `InputAxis`: `pan` (yaw) and `tilt` (pitch), relative to an optional target's rotation. */
export class PanTiltAim<T = TargetPose | null> {
  readonly state = createPanTiltState();
  readonly pan = this.state.pan;
  readonly tilt = this.state.tilt;
  readonly inputAxes = { pan: this.pan, tilt: this.tilt };

  /** Makes `pan` and `tilt` relative to this target's rotation. */
  target: T;

  constructor(target: T = null as T) {
    this.target = target;
  }

  update = (out: CameraState, dt: number): void => {
    updatePanTilt(out, this.state, this.targetRotation(), dt);
  };

  /** Seeds `pan`/`tilt` from `rotation`'s forward direction, relative to the current reference frame. */
  setFromRotation = (rotation: Quat, referenceUp: Vec3): void => {
    seedPanTilt(this.state, this.targetRotation(), rotation, referenceUp);
  };

  /** Start facing `rotation`, with both axes settled there instead of easing in. */
  primeFrom = (rotation: Quat, referenceUp: Vec3): void => {
    this.setFromRotation(rotation, referenceUp);
    this.pan.reset();
    this.tilt.reset();
  };

  /** This frame's target pose, or `null` when there is none. Only its rotation is read. */
  protected readTarget(): TargetPose | null {
    return this.target as TargetPose | null;
  }

  private targetRotation(): Quat | null {
    const pose = this.readTarget();
    return pose?.hasRotation ? pose.rotation : null;
  }
}
