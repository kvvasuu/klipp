import { degreesToRadians } from 'math';
import { perlin2d } from 'math/noise';
import { Euler, Quaternion, Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import { Damper, type DampingConstant } from '../damping/Damper';

const scratchPositionOffset = new Vector3();
const scratchEuler = new Euler();
const scratchRotationOffset = new Quaternion();

// Sampled at a fixed, non-integer Y rather than exactly 0: `perlin2d` reuses 3D gradients with a
// zero X-component for some lattice points, and Y=0 sits exactly on the grid line where those degenerate
// to a constant 0 across an entire unit cell. Y=0.5 sits inside a cell instead of on its edge, so it
// can't hit that degeneracy.
const sampleY = 0.5;

type Generator = ReturnType<typeof perlin2d.create>;
/** Position x/y/z, then rotation x/y/z — 6 independently seeded channels, decorrelated by seed rather
 *  than by a phase offset on one shared table. */
type Channels = [Generator, Generator, Generator, Generator, Generator, Generator];

function createChannels(seed: number): Channels {
  return [
    perlin2d.create(seed),
    perlin2d.create(seed + 1),
    perlin2d.create(seed + 2),
    perlin2d.create(seed + 3),
    perlin2d.create(seed + 4),
    perlin2d.create(seed + 5),
  ];
}

/**
 * Additive camera shake, position AND rotation, 6 independently-seeded Perlin channels.
 *
 * `amplitudeDamping` (default `0` = instant) — without it, `amplitudeGain` dropping to `0` cuts the shake
 * dead on the next frame, since there's no persistent state to ease from (unlike Body/Aim, which converges
 * toward a moving target every frame). With damping, the EFFECTIVE gain eases toward `amplitudeGain`
 * instead, so a fade-out reads as the shake calming down, not a hard cut.
 *
 * Not built yet: `pivotOffset` (rotate around a point other than the camera's own origin) and a
 * "Constant" (deterministic, not Perlin) channel mode.
 */
export class BasicMultiChannelPerlinNoise {
  positionAmplitude: Vector3;
  positionFrequency: Vector3;
  rotationAmplitude: Vector3;
  rotationFrequency: Vector3;
  amplitudeGain: number;
  frequencyGain: number;
  amplitudeDamping: DampingConstant;

  private readonly channels: Channels;
  private readonly amplitudeGainDamper = new Damper();
  private effectiveAmplitudeGain: number;
  private time = 0;

  constructor(
    positionAmplitude = new Vector3(),
    positionFrequency = new Vector3(1, 1, 1),
    rotationAmplitude = new Vector3(),
    rotationFrequency = new Vector3(1, 1, 1),
    amplitudeGain = 1,
    frequencyGain = 1,
    seed = Math.random() * 10000,
    amplitudeDamping: DampingConstant = 0,
  ) {
    this.positionAmplitude = positionAmplitude;
    this.positionFrequency = positionFrequency;
    this.rotationAmplitude = rotationAmplitude;
    this.rotationFrequency = rotationFrequency;
    this.amplitudeGain = amplitudeGain;
    this.frequencyGain = frequencyGain;
    this.amplitudeDamping = amplitudeDamping;
    this.effectiveAmplitudeGain = amplitudeGain;
    this.channels = createChannels(seed);
  }

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    this.time += dt * this.frequencyGain;

    // re-arms the damper's own first-call snap — on reactivation, effectiveAmplitudeGain is frozen at
    // wherever an earlier, unrelated activation left it, so easing from there would resume a fade that
    // has nothing to do with this activation instead of starting fresh at the current amplitudeGain
    if (justActivated) this.amplitudeGainDamper.reset();

    this.effectiveAmplitudeGain =
      typeof this.amplitudeDamping === 'number' && this.amplitudeDamping <= 0
        ? this.amplitudeGain
        : this.amplitudeGainDamper.update(this.effectiveAmplitudeGain, this.amplitudeGain, this.amplitudeDamping, dt);

    scratchPositionOffset
      .set(
        perlin2d.sample(this.channels[0], this.time * this.positionFrequency.x, sampleY) * this.positionAmplitude.x,
        perlin2d.sample(this.channels[1], this.time * this.positionFrequency.y, sampleY) * this.positionAmplitude.y,
        perlin2d.sample(this.channels[2], this.time * this.positionFrequency.z, sampleY) * this.positionAmplitude.z,
      )
      .multiplyScalar(this.effectiveAmplitudeGain)
      .applyQuaternion(out.quaternion); // camera-local shake, rotated into world
    out.position.add(scratchPositionOffset);

    scratchEuler.set(
      degreesToRadians(
        perlin2d.sample(this.channels[3], this.time * this.rotationFrequency.x, sampleY) * this.rotationAmplitude.x,
      ) * this.effectiveAmplitudeGain,
      degreesToRadians(
        perlin2d.sample(this.channels[4], this.time * this.rotationFrequency.y, sampleY) * this.rotationAmplitude.y,
      ) * this.effectiveAmplitudeGain,
      degreesToRadians(
        perlin2d.sample(this.channels[5], this.time * this.rotationFrequency.z, sampleY) * this.rotationAmplitude.z,
      ) * this.effectiveAmplitudeGain,
    );
    scratchRotationOffset.setFromEuler(scratchEuler);
    out.quaternion.multiply(scratchRotationOffset); // camera-local rotation perturbation
  };
}
