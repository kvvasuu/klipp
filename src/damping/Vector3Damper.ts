import { Vector3 } from 'three';
import { Damper, type DampingConstant } from './Damper';

/** Damps the Cartesian components of a `Vector3` independently. */
export class Vector3Damper {
  private readonly x = new Damper();
  private readonly y = new Damper();
  private readonly z = new Damper();

  update(out: Vector3, target: Vector3, damping: DampingConstant, dt: number, maxSpeed = Infinity): Vector3 {
    if (typeof damping === 'number' && damping <= 0) return out.copy(target);

    out.x = this.x.update(out.x, target.x, damping, dt, maxSpeed);
    out.y = this.y.update(out.y, target.y, damping, dt, maxSpeed);
    out.z = this.z.update(out.z, target.z, damping, dt, maxSpeed);
    return out;
  }

  /** Reset all three component dampers. */
  reset(): void {
    this.x.reset();
    this.y.reset();
    this.z.reset();
  }
}
