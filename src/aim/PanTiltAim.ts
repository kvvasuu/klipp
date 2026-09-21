import { degreesToRadians } from 'math';
import { Euler, Quaternion, Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import { InputAxis } from '../input/InputAxis';
import { resolveTargetRotation, type Target } from '../resolve/Target';

const worldUp = new Vector3(0, 1, 0);
const scratchEuler = new Euler(0, 0, 0, 'YXZ');
const scratchReferenceFrame = new Quaternion();

/** Pure rotation from two `InputAxis` - `pan` (yaw, wraps ±180°) and `tilt` (pitch, clamped). */
export class PanTiltAim {
  readonly pan = new InputAxis(0, 0, [-180, 180], true);
  readonly tilt = new InputAxis(0, 0, [-90, 90]);
  readonly inputAxes = { pan: this.pan, tilt: this.tilt };

  target: Target;

  update = (out: CameraState, dt: number): void => {
    this.pan.update(dt);
    this.tilt.update(dt);

    if (!resolveTargetRotation(scratchReferenceFrame, this.target)) {
      scratchReferenceFrame.setFromUnitVectors(worldUp, out.referenceUp);
    }

    scratchEuler.set(-degreesToRadians(this.tilt.value), -degreesToRadians(this.pan.value), 0);
    out.quaternion.setFromEuler(scratchEuler);
    out.quaternion.premultiply(scratchReferenceFrame);
  };
}
