import { degreesToRadians, radiansToDegrees } from 'math';
import { Euler, Quaternion, Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import { InputAxis } from '../input/InputAxis';
import { resolveTargetRotation, type Target } from '../resolve/Target';

const worldUp = new Vector3(0, 1, 0);
const forwardAxis = new Vector3(0, 0, -1);
const epsilon = 1e-6;

const scratchEuler = new Euler(0, 0, 0, 'YXZ');
const scratchReferenceFrame = new Quaternion();
const scratchForward = new Vector3();
const scratchTargetForward = new Vector3();
const scratchA = new Vector3();
const scratchB = new Vector3();
const scratchRight = new Vector3();
const scratchCross = new Vector3();

/** Signed angle (degrees) from `from` to `to`, measured around `axis`. */
function signedAngleDeg(from: Vector3, to: Vector3, axis: Vector3): number {
  scratchCross.crossVectors(from, to);
  return radiansToDegrees(Math.atan2(scratchCross.dot(axis), from.dot(to)));
}

/** Pure rotation from two `InputAxis` - `pan` (yaw, wraps ±180°) and `tilt` (pitch, clamped). */
export class PanTiltAim {
  readonly pan = new InputAxis(0, 0, [-180, 180], true);
  readonly tilt = new InputAxis(0, 0, [-90, 90]);
  readonly inputAxes = { pan: this.pan, tilt: this.tilt };

  target: Target;

  update = (out: CameraState, dt: number): void => {
    this.pan.update(dt);
    this.tilt.update(dt);

    this.resolveReferenceFrame(scratchReferenceFrame, out.referenceUp);

    scratchEuler.set(-degreesToRadians(this.tilt.value), -degreesToRadians(this.pan.value), 0);
    out.quaternion.setFromEuler(scratchEuler);
    out.quaternion.premultiply(scratchReferenceFrame);
  };

  /** Seeds `pan`/`tilt` from `rotation`'s forward direction, relative to the current reference frame -
   *  call before any `applyDelta`, since it assumes both axes are still at `rawValue`. */
  setFromRotation = (rotation: Quaternion, referenceUp: Vector3): void => {
    this.resolveReferenceFrame(scratchReferenceFrame, referenceUp);
    scratchForward.copy(forwardAxis).applyQuaternion(scratchReferenceFrame);
    scratchTargetForward.copy(forwardAxis).applyQuaternion(rotation);

    scratchA.copy(scratchForward).projectOnPlane(referenceUp);
    scratchB.copy(scratchTargetForward).projectOnPlane(referenceUp);
    let panRawDeg = 0;
    if (scratchA.lengthSq() > epsilon && scratchB.lengthSq() > epsilon) {
      panRawDeg = signedAngleDeg(scratchA, scratchB, referenceUp);
    }

    scratchForward.applyAxisAngle(referenceUp, degreesToRadians(panRawDeg));
    scratchRight.crossVectors(referenceUp, scratchForward);
    let tiltDeg = 0;
    if (scratchRight.lengthSq() > epsilon) {
      tiltDeg = signedAngleDeg(scratchForward, scratchTargetForward, scratchRight);
    }

    // pan.value grows in the opposite direction from a standard signed angle around referenceUp
    const panDeg = -panRawDeg;
    this.pan.applyDelta(panDeg - this.pan.value);
    this.tilt.applyDelta(tiltDeg - this.tilt.value);
  };

  private resolveReferenceFrame(out: Quaternion, referenceUp: Vector3): void {
    if (!resolveTargetRotation(out, this.target)) {
      out.setFromUnitVectors(worldUp, referenceUp);
    }
  }
}
