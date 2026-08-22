import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { Vector3 } from 'three';
import type { DampingConstant } from '../damping/Damper';
import { resolveVector3 } from '../resolve/resolveVector3';
import { useVirtualCameraSlots } from '../VirtualCamera';
import { BasicMultiChannelPerlinNoise } from './BasicMultiChannelPerlinNoise';

const defaultAmplitude: Vector3Like = [0, 0, 0];
const defaultFrequency: Vector3Like = [1, 1, 1];

export type BasicMultiChannelPerlinProps = {
  /** Per-axis shake amplitude in camera-LOCAL space (X = right/left, Y = up/down, Z = push/pull).
   *  Default `(0, 0, 0)` — no shake until dialed in. */
  positionAmplitude?: Vector3Like;
  /** Per-axis oscillation speed for position noise. Default `(1, 1, 1)`. */
  positionFrequency?: Vector3Like;
  /** Per-axis shake amplitude in DEGREES, camera-local pitch/yaw/roll. Default `(0, 0, 0)`. */
  rotationAmplitude?: Vector3Like;
  /** Per-axis oscillation speed for rotation noise. Default `(1, 1, 1)`. */
  rotationFrequency?: Vector3Like;
  /** Multiplies every amplitude at once. Default `1`. */
  amplitudeGain?: number;
  /** Multiplies every frequency at once (how fast the internal clock advances). Default `1`. */
  frequencyGain?: number;
  /** Seeds the 6 independent Perlin channels — same seed reproduces identical noise. Default: random,
   *  chosen ONCE on mount. Unlike the other props, changing this later has no effect — the seeded
   *  permutation tables are built once, at construction, same as `Klipp`'s `defaultBlend`. */
  seed?: number;
  /** Seconds to ease `amplitudeGain` changes instead of cutting instantly (or `{into, from}` for
   *  asymmetric damping). `0` (default) = instant. See `BasicMultiChannelPerlinNoise`'s doc comment for
   *  why this exists — fading shake in/out smoothly instead of a hard cut. */
  amplitudeDamping?: DampingConstant;
  /** Imperative access to the underlying `BasicMultiChannelPerlinNoise`. */
  ref?: Ref<BasicMultiChannelPerlinNoise>;
};

/**
 * Additive camera shake, see `BasicMultiChannelPerlinNoise`'s doc comment for the algorithm. Thin wrapper
 * — the actual logic lives there. Unlike Body/Aim, multiple `<Noise.BasicMultiChannelPerlin>` can be
 * mounted on the same `<VirtualCamera>` at once — Noise is a stacking slot (`registerNoise`), not an
 * exclusive one.
 */
export function BasicMultiChannelPerlin({
  positionAmplitude = defaultAmplitude,
  positionFrequency = defaultFrequency,
  rotationAmplitude = defaultAmplitude,
  rotationFrequency = defaultFrequency,
  amplitudeGain = 1,
  frequencyGain = 1,
  seed,
  amplitudeDamping = 0,
  ref,
}: BasicMultiChannelPerlinProps) {
  const slots = useVirtualCameraSlots();
  const [noise] = useState(
    () =>
      new BasicMultiChannelPerlinNoise(
        new Vector3(),
        new Vector3(),
        new Vector3(),
        new Vector3(),
        amplitudeGain,
        frequencyGain,
        seed,
        amplitudeDamping,
      ),
  );
  resolveVector3(noise.positionAmplitude, positionAmplitude);
  resolveVector3(noise.positionFrequency, positionFrequency);
  resolveVector3(noise.rotationAmplitude, rotationAmplitude);
  resolveVector3(noise.rotationFrequency, rotationFrequency);
  noise.amplitudeGain = amplitudeGain;
  noise.frequencyGain = frequencyGain;
  noise.amplitudeDamping = amplitudeDamping;

  useImperativeHandle(ref, () => noise, [noise]);
  useEffect(() => slots.registerNoise(noise.update), [slots, noise]);

  return null;
}
