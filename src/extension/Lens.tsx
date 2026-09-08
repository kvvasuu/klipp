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
  /** Seconds to catch up to `fov` as it changes. `0` (default) = hard, instant. */
  fovDamping?: DampingConstant;
  /** Seconds to catch up to `near` as it changes. `0` (default) = hard, instant. */
  nearDamping?: DampingConstant;
  /** Seconds to catch up to `far` as it changes. `0` (default) = hard, instant. */
  farDamping?: DampingConstant;
  /** Imperative access to the underlying `LensExtension`, for mutating `fov`/`near`/`far` every frame
   *  from an external `useFrame` without forcing a React re-render. */
  ref?: Ref<LensExtension>;
};

/**
 * Thin wrapper - the actual logic lives in `LensExtension`. Unlike Body/Aim, nothing else in klipp's
 * pipeline claims `fov`/`near`/`far`, so this is the only way to animate them without an external
 * `useFrame` fighting Klipp's own driver every frame.
 */
export function Lens({ fov, near, far, fovDamping, nearDamping, farDamping, ref }: LensProps) {
  const slots = useVirtualCameraSlots();
  const invalidate = useThree((state) => state.invalidate);
  const [extension] = useState(() => new LensExtension(fov, near, far, fovDamping, nearDamping, farDamping));
  // only synced when actually passed - otherwise this would fight a ref-based imperative mutation on
  // every unrelated re-render
  if (fov !== undefined) extension.fov = fov;
  if (near !== undefined) extension.near = near;
  if (far !== undefined) extension.far = far;
  if (fovDamping !== undefined) extension.fovDamping = fovDamping;
  if (nearDamping !== undefined) extension.nearDamping = nearDamping;
  if (farDamping !== undefined) extension.farDamping = farDamping;

  useImperativeHandle(ref, () => extension, [extension]);
  useEffect(() => slots.registerExtension(extension.update), [slots, extension]);

  useEffect(() => {
    invalidate();
  }, [fov, near, far, fovDamping, nearDamping, farDamping, invalidate]);

  return null;
}
