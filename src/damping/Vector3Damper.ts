import { Vector3 } from 'three';
import { Damper, type DampingConstant } from './Damper';

/** Three independent `Damper`s bundled for a `Vector3` — Cartesian x/y/z only. `OrbitalFollow`'s
 *  horizontal/vertical/radial axes aren't x/y/z and will need their own damper, not this one. */
export class Vector3Damper {
  private readonly x = new Damper();
  private readonly y = new Damper();
  private readonly z = new Damper();

  update(out: Vector3, target: Vector3, damping: DampingConstant, dt: number): Vector3 {
    if (typeof damping === 'number' && damping <= 0) return out.copy(target);

    out.x = this.x.update(out.x, target.x, damping, dt);
    out.y = this.y.update(out.y, target.y, damping, dt);
    out.z = this.z.update(out.z, target.z, damping, dt);
    return out;
  }

  /** See `Damper.reset` — re-arms all three axes' first-call snap. */
  reset(): void {
    this.x.reset();
    this.y.reset();
    this.z.reset();
  }
}
