import type { Quat, Vec3 } from 'math';
import type { CameraState } from '../../core/CameraState';
import { createPanTiltState, seedPanTilt, updatePanTilt } from '../../core/aim/panTilt';
import { readTargetRotation } from '../readTargetPose';
import type { Target } from '../resolve/Target';
import type { TargetSlot } from '../resolve/TargetRegistry';

/** Pure rotation from two `InputAxis` - `pan` (yaw, wraps ±180°) and `tilt` (pitch, clamped). */
export class PanTiltAim {
  readonly state = createPanTiltState();
  readonly pan = this.state.pan;
  readonly tilt = this.state.tilt;
  readonly inputAxes = { pan: this.pan, tilt: this.tilt };

  target: Target;
  targetSlot: TargetSlot | null = null;
  private readonly targetRotation: Quat = [0, 0, 0, 1];

  update = (out: CameraState, dt: number): void => {
    updatePanTilt(out, this.state, this.readTargetRotation(), dt);
  };

  /** Seeds `pan`/`tilt` from `rotation`'s forward direction, relative to the current reference frame. */
  setFromRotation = (rotation: Quat, referenceUp: Vec3): void => {
    seedPanTilt(this.state, this.readTargetRotation(), rotation, referenceUp);
  };

  private readTargetRotation(): Quat | null {
    return readTargetRotation(this.targetRotation, this.target, this.targetSlot) ? this.targetRotation : null;
  }
}
