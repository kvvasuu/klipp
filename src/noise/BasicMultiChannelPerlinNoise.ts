import { degreesToRadians } from 'maath';
import { perlin2d } from 'maath/noise';
import { Euler, Quaternion, Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import { Damper, type DampingConstant } from '../damping/Damper';

const scratchPositionOffset = new Vector3();
const scratchEuler = new Euler();
const scratchRotationOffset = new Quaternion();

// Sampled at a fixed, non-integer Y rather than exactly 0: maath's `perlin2d` reuses 3D gradients with a
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
 * Additive camera shake. Unlike Body/Aim (exclusive, one slot each), Noise writes to BOTH position and
 * rotation and is meant to STACK — `VirtualCameraController` runs every registered Noise writer on top of
 * whatever Body+Aim already computed.
 *
 * `positionAmplitude`/`positionFrequency` (per-axis, camera-LOCAL space — X = right/left, Y = up/down,
 * Z = push/pull along the lens) and `rotationAmplitude`/`rotationFrequency` (per-axis DEGREES, camera-
 * local pitch/yaw/roll) drive 6 independent seeded Perlin channels. `amplitudeGain`/`frequencyGain` scale
 * all 6 at once. All amplitudes default to `0` (no shake until dialed in), matching this codebase's
 * "0 disables" convention (`deadZone`/`hardLimit`/`damping`).
 *
 * "Multi channel" here means mounting several `<Noise.BasicMultiChannelPerlin>` with different
 * frequency/amplitude on the same camera — `Noise` already being a STACKING slot gives this for free.
 * `seed` (default: random per instance) decorrelates axes from each other — pass the same `seed` to two
 * instances for reproducible, identical noise.
 *
 * `amplitudeDamping` (default `0` = instant, matching every other damping in this codebase) — without it,
 * dialing `amplitudeGain` down to `0` cuts the shake dead on the very next frame — there's no persistent
 * state to ease from, unlike Body/Aim's damping, which naturally smooths because it's converging toward a
 * moving target every frame. With `amplitudeDamping > 0`, the EFFECTIVE gain eases toward `amplitudeGain`
 * instead of jumping straight to it — the underlying Perlin signal (frequency, character) is untouched,
 * only how loudly it's currently being listened to, so a fade-out reads as the shake naturally calming
 * down, not a hard cut.
 *
 * Deliberately NOT built yet: `pivotOffset` (rotate around a point other than the camera's own origin,
 * coupling position+rotation noise) and a "Constant" (deterministic cosine, not Perlin) channel mode.
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

  update = (out: CameraState, dt: number): void => {
    this.time += dt * this.frequencyGain;

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
