import type { Quat } from 'math';
import type { Quaternion } from 'three';
import { createDamperState, resetDamper, type DampingConstant } from '../../core/damping/Damper.js';
import { dampQuaternion } from '../../core/damping/dampQuaternion.js';

const scratchOut: Quat = [0, 0, 0, 1];
const scratchTarget: Quat = [0, 0, 0, 1];

/** Stateful wrapper over `dampQuaternion` for three.js quaternions. */
export class QuaternionDamper {
  readonly state = createDamperState();

  update(out: Quaternion, target: Quaternion, damping: DampingConstant, dt: number, maxSpeed = Infinity): Quaternion {
    dampQuaternion(this.state, out.toArray(scratchOut), target.toArray(scratchTarget), damping, dt, maxSpeed);
    return out.fromArray(scratchOut);
  }

  /** Reset the underlying angle spring. */
  reset(): void {
    resetDamper(this.state);
  }
}
