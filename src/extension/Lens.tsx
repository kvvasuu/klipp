import { useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { DampingConstant } from '../damping/Damper';
import { useVirtualCameraSlots } from '../VirtualCamera';
import { LensExtension } from './LensExtension';

export type LensProps = {
  /** Overrides the camera's field of view, in degrees. `undefined` (default) - leave whatever
   *  `initialState`/blend already set untouched. */
  fov?: number;
  /** Overrides the near clip plane. `undefined` (default) - untouched. */
  near?: number;
  /** Overrides the far clip plane. `undefined` (default) - untouched. */
  far?: number;
  /** Spring response time to `fov` as it changes. `0` (default) = hard, instant. */
  fovDamping?: DampingConstant;
  /** Spring response time to `near` as it changes. `0` (default) = hard, instant. */
  nearDamping?: DampingConstant;
  /** Spring response time to `far` as it changes. `0` (default) = hard, instant. */
  farDamping?: DampingConstant;
  /** Caps how fast `fovDamping` can close the gap, in degrees/sec. Default `Infinity` (no cap). */
  fovMaxSpeed?: number;
  /** Caps how fast `nearDamping` can close the gap, in world units/sec. Default `Infinity` (no cap). */
  nearMaxSpeed?: number;
  /** Caps how fast `farDamping` can close the gap, in world units/sec. Default `Infinity` (no cap). */
  farMaxSpeed?: number;
  /** Imperative access to the underlying `LensExtension`, for mutating `fov`/`near`/`far` every frame
   *  from an external `useFrame` without forcing a React re-render. */
  ref?: Ref<LensExtension>;
};

/**
 * Thin wrapper - the actual logic lives in `LensExtension`. Unlike Body/Aim, nothing else in klipp's
 * pipeline claims `fov`/`near`/`far`, so this is the only way to animate them without an external
 * `useFrame` fighting Klipp's own driver every frame.
 */
export function Lens({
  fov,
  near,
  far,
  fovDamping = 0,
  nearDamping = 0,
  farDamping = 0,
  fovMaxSpeed = Infinity,
  nearMaxSpeed = Infinity,
  farMaxSpeed = Infinity,
  ref,
}: LensProps) {
  const slots = useVirtualCameraSlots();
  const invalidate = useThree((state) => state.invalidate);
  const [extension] = useState(() => new LensExtension(fov, near, far, fovDamping, nearDamping, farDamping));
  extension.fov = fov;
  extension.near = near;
  extension.far = far;
  extension.fovDamping = fovDamping;
  extension.nearDamping = nearDamping;
  extension.farDamping = farDamping;
  extension.fovMaxSpeed = fovMaxSpeed;
  extension.nearMaxSpeed = nearMaxSpeed;
  extension.farMaxSpeed = farMaxSpeed;

  useImperativeHandle(ref, () => extension, [extension]);
  useEffect(() => slots.registerExtension(extension.update), [slots, extension]);

  useEffect(() => {
    invalidate();
  }, [fov, near, far, fovDamping, nearDamping, farDamping, invalidate]);

  return null;
}
