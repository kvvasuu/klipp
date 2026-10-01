import type { Quat, Vec3 } from 'math';
import type { CameraState } from '../../core/CameraState.js';
import { createPanTiltState, seedPanTilt, updatePanTilt } from '../../core/aim/panTilt.js';
import { readTargetRotation } from '../readTargetPose.js';
import type { Target } from '../resolve/Target.js';
import type { TargetSlot } from '../resolve/TargetRegistry.js';

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

  /** Start facing `rotation`, with both axes settled there instead of easing in. */
  primeFrom = (rotation: Quat, referenceUp: Vec3): void => {
    this.setFromRotation(rotation, referenceUp);
    this.pan.reset();
    this.tilt.reset();
  };

  private readTargetRotation(): Quat | null {
    return readTargetRotation(this.targetRotation, this.target, this.targetSlot) ? this.targetRotation : null;
  }
}
