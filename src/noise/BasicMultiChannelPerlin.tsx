import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { useEffect, useImperativeHandle, type Ref } from 'react';
import type { DampingConstant } from '../damping/Damper';
import { useVirtualCamera } from '../VirtualCameraContext';
import type { BasicMultiChannelPerlinNoise } from './BasicMultiChannelPerlinNoise';
import { useBasicMultiChannelPerlinNoise } from './useBasicMultiChannelPerlinNoise';

export type BasicMultiChannelPerlinProps = {
  /** Per-axis shake amplitude in camera-LOCAL space (X = right/left, Y = up/down, Z = push/pull).
   *  Default `(0, 0, 0)` - no shake until dialed in. */
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
  /** Seeds the 6 independent Perlin channels - same seed reproduces identical noise. Default: random,
   *  chosen ONCE on mount - changing this later has no effect, the permutation tables are built once, at
   *  construction, same as `Klipp`'s `defaultBlend`. */
  seed?: number;
  /** Seconds to ease `amplitudeGain` changes instead of cutting instantly (or `{into, from}` for
   *  asymmetric damping). `0` (default) = instant - see `BasicMultiChannelPerlinNoise`'s doc comment for
   *  why this exists. */
  amplitudeDamping?: DampingConstant;
  /** Imperative access to the underlying `BasicMultiChannelPerlinNoise`. */
  ref?: Ref<BasicMultiChannelPerlinNoise>;
};

/**
 * Additive camera shake, see `BasicMultiChannelPerlinNoise`'s doc comment for the algorithm. Thin wrapper
 * - the actual logic lives there. Unlike Body/Aim, multiple `<Noise.BasicMultiChannelPerlin>` can be
 * mounted on the same `<VirtualCamera>` at once - Noise is a stacking slot (`registerNoise`), not an
 * exclusive one.
 */
export function BasicMultiChannelPerlin({ ref, ...props }: BasicMultiChannelPerlinProps) {
  const { controller } = useVirtualCamera();
  const noise = useBasicMultiChannelPerlinNoise(props);

  useImperativeHandle(ref, () => noise, [noise]);
  useEffect(() => controller.registerNoise(noise.update), [controller, noise]);

  return null;
}
