import { degreesToRadians, quat, vec3, type Euler, type Quat, type Vec3 } from 'math';
import { perlin2d } from 'math/noise';
import type { CameraState } from '../CameraState.js';
import { createDamperState, damp, resetDamper, type DamperState, type DampingConstant } from '../damping/Damper.js';
import { withDefaults } from '../params.js';

type Generator = ReturnType<typeof perlin2d.create>;
/** Three position and three rotation noise channels. */
type Channels = [Generator, Generator, Generator, Generator, Generator, Generator];

export type PerlinNoiseParams = {
  /** Per-axis positional shake amplitude in camera-local space. */
  positionAmplitude: Vec3;
  /** Per-axis oscillation speed for position noise. */
  positionFrequency: Vec3;
  /** Per-axis rotational shake amplitude in degrees. */
  rotationAmplitude: Vec3;
  /** Per-axis oscillation speed for rotation noise. */
  rotationFrequency: Vec3;
  /** Multiplies every amplitude at once. */
  amplitudeGain: number;
  /** Multiplies every channel's frequency. */
  frequencyGain: number;
  /** Response time for changes to `amplitudeGain`. */
  amplitudeDamping: DampingConstant;
};

/** Every setting from `settings`, or its default. */
export const createPerlinNoiseParams = (settings?: Partial<PerlinNoiseParams>): PerlinNoiseParams =>
  withDefaults(
    {
      positionAmplitude: [0, 0, 0],
      positionFrequency: [1, 1, 1],
      rotationAmplitude: [0, 0, 0],
      rotationFrequency: [1, 1, 1],
      amplitudeGain: 1,
      frequencyGain: 1,
      amplitudeDamping: 0,
    },
    settings,
  );

export type PerlinNoiseState = {
  channels: Channels;
  amplitudeGainDamper: DamperState;
  effectiveAmplitudeGain: number;
  positionPhase: Vec3;
  rotationPhase: Vec3;
};

export const createPerlinNoiseState = (seed: number, amplitudeGain = 1): PerlinNoiseState => ({
  channels: [
    perlin2d.create(seed),
    perlin2d.create(seed + 1),
    perlin2d.create(seed + 2),
    perlin2d.create(seed + 3),
    perlin2d.create(seed + 4),
    perlin2d.create(seed + 5),
  ],
  amplitudeGainDamper: createDamperState(),
  effectiveAmplitudeGain: amplitudeGain,
  positionPhase: [0, 0, 0],
  rotationPhase: [0, 0, 0],
});

// Avoid the lattice line where the noise gradients can become degenerate.
const sampleY = 0.5;

const scratchOffset: Vec3 = [0, 0, 0];
const scratchEuler: Euler = [0, 0, 0, 'xyz'];
const scratchRotation: Quat = [0, 0, 0, 1];

/** Adds Perlin position and rotation noise to `out`, in camera-local space. */
export function updatePerlinNoise(
  out: CameraState,
  state: PerlinNoiseState,
  params: PerlinNoiseParams,
  dt: number,
  justActivated: boolean,
): void {
  const { channels, positionPhase, rotationPhase } = state;
  const frequencyStep = dt * params.frequencyGain;
  positionPhase[0] += frequencyStep * params.positionFrequency[0];
  positionPhase[1] += frequencyStep * params.positionFrequency[1];
  positionPhase[2] += frequencyStep * params.positionFrequency[2];
  rotationPhase[0] += frequencyStep * params.rotationFrequency[0];
  rotationPhase[1] += frequencyStep * params.rotationFrequency[1];
  rotationPhase[2] += frequencyStep * params.rotationFrequency[2];

  // Start a new activation from the current amplitude instead of stale damping state.
  if (justActivated) resetDamper(state.amplitudeGainDamper);

  if (typeof params.amplitudeDamping === 'number' && params.amplitudeDamping <= 0) {
    state.effectiveAmplitudeGain = params.amplitudeGain;
  } else {
    state.amplitudeGainDamper.value = state.effectiveAmplitudeGain;
    state.effectiveAmplitudeGain = damp(
      state.amplitudeGainDamper,
      params.amplitudeGain,
      params.amplitudeDamping,
      dt,
    ).value;
  }
  const gain = state.effectiveAmplitudeGain;
  const { positionAmplitude, rotationAmplitude } = params;

  vec3.set(
    scratchOffset,
    perlin2d.sample(channels[0], positionPhase[0], sampleY) * positionAmplitude[0],
    perlin2d.sample(channels[1], positionPhase[1], sampleY) * positionAmplitude[1],
    perlin2d.sample(channels[2], positionPhase[2], sampleY) * positionAmplitude[2],
  );
  vec3.scale(scratchOffset, scratchOffset, gain);
  vec3.transformQuat(scratchOffset, scratchOffset, out.quaternion); // Convert local shake to world space.
  vec3.add(out.position, out.position, scratchOffset);

  scratchEuler[0] =
    degreesToRadians(perlin2d.sample(channels[3], rotationPhase[0], sampleY) * rotationAmplitude[0]) * gain;
  scratchEuler[1] =
    degreesToRadians(perlin2d.sample(channels[4], rotationPhase[1], sampleY) * rotationAmplitude[1]) * gain;
  scratchEuler[2] =
    degreesToRadians(perlin2d.sample(channels[5], rotationPhase[2], sampleY) * rotationAmplitude[2]) * gain;
  quat.multiply(out.quaternion, out.quaternion, quat.fromEuler(scratchRotation, scratchEuler)); // Apply local rotation noise.
}
