import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { Vector3 } from 'three';
import type { DampingConstant } from '../damping/Damper';
import { resolveVector3 } from '../resolve/resolveVector3';
import { useVirtualCameraSlots } from '../VirtualCamera';
import { BasicMultiChannelPerlinNoise } from './BasicMultiChannelPerlinNoise';

export type BasicMultiChannelPerlinProps = {
  /** Per-axis shake amplitude in camera-LOCAL space (X = right/left, Y = up/down, Z = push/pull).
   *  Default `(0, 0, 0)` — no shake until dialed in. Omit entirely (not even a default value) to drive it
   *  imperatively through `ref` instead — a prop that's always applied, even at its default, would fight
   *  a `ref`-based mutation on the next unrelated re-render. */
  positionAmplitude?: Vector3Like;
  /** Per-axis oscillation speed for position noise. Default `(1, 1, 1)`. */
  positionFrequency?: Vector3Like;
  /** Per-axis shake amplitude in DEGREES, camera-local pitch/yaw/roll. Default `(0, 0, 0)`. */
  rotationAmplitude?: Vector3Like;
  /** Per-axis oscillation speed for rotation noise. Default `(1, 1, 1)`. */
  rotationFrequency?: Vector3Like;
  /** Multiplies every amplitude at once. Default `1`. */
  amplitudeGain?: number;
  /** Multiplies every frequency at once (how fast every channel's phase advances). Default `1`. */
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
  positionAmplitude,
  positionFrequency,
  rotationAmplitude,
  rotationFrequency,
  amplitudeGain,
  frequencyGain,
  seed,
  amplitudeDamping,
  ref,
}: BasicMultiChannelPerlinProps) {
  const slots = useVirtualCameraSlots();
  const [noise] = useState(
    () =>
      new BasicMultiChannelPerlinNoise(
        positionAmplitude !== undefined ? resolveVector3(new Vector3(), positionAmplitude) : undefined,
        positionFrequency !== undefined ? resolveVector3(new Vector3(), positionFrequency) : undefined,
        rotationAmplitude !== undefined ? resolveVector3(new Vector3(), rotationAmplitude) : undefined,
        rotationFrequency !== undefined ? resolveVector3(new Vector3(), rotationFrequency) : undefined,
        amplitudeGain,
        frequencyGain,
        seed,
        amplitudeDamping,
      ),
  );
  // only synced when the caller actually passes a value - otherwise this would fight a ref-based
  // imperative mutation (e.g. damping positionFrequency in an external useFrame) on every unrelated re-render
  if (positionAmplitude !== undefined) resolveVector3(noise.positionAmplitude, positionAmplitude);
  if (positionFrequency !== undefined) resolveVector3(noise.positionFrequency, positionFrequency);
  if (rotationAmplitude !== undefined) resolveVector3(noise.rotationAmplitude, rotationAmplitude);
  if (rotationFrequency !== undefined) resolveVector3(noise.rotationFrequency, rotationFrequency);
  if (amplitudeGain !== undefined) noise.amplitudeGain = amplitudeGain;
  if (frequencyGain !== undefined) noise.frequencyGain = frequencyGain;
  if (amplitudeDamping !== undefined) noise.amplitudeDamping = amplitudeDamping;

  useImperativeHandle(ref, () => noise, [noise]);
  useEffect(() => slots.registerNoise(noise.update), [slots, noise]);

  return null;
}
