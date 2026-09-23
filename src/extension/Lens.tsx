import { useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { DampingConstant } from '../damping/Damper';
import { useVirtualCamera } from '../VirtualCameraContext';
import { LensExtension } from './LensExtension';

export type LensProps = {
  /** Overrides the camera's field of view, in degrees. `undefined` leaves the current value untouched. */
  fov?: number;
  /** Overrides the near clip plane. `undefined` leaves the current value untouched. */
  near?: number;
  /** Overrides the far clip plane. `undefined` leaves the current value untouched. */
  far?: number;
  /** Spring response time to `fov` as it changes. `0` is instant. */
  fovDamping?: DampingConstant;
  /** Spring response time to `near` as it changes. `0` is instant. */
  nearDamping?: DampingConstant;
  /** Spring response time to `far` as it changes. `0` is instant. */
  farDamping?: DampingConstant;
  /** Caps how fast `fovDamping` can close the gap, in degrees/sec. `Infinity` means no cap. */
  fovMaxSpeed?: number;
  /** Caps how fast `nearDamping` can close the gap, in world units/sec. `Infinity` means no cap. */
  nearMaxSpeed?: number;
  /** Caps how fast `farDamping` can close the gap, in world units/sec. `Infinity` means no cap. */
  farMaxSpeed?: number;
  ref?: Ref<LensExtension>;
};

/** Animates the camera lens without forcing a React re-render. */
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
  const { controller } = useVirtualCamera();
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
  useEffect(() => controller.registerExtension(extension.update), [controller, extension]);

  useEffect(() => {
    invalidate();
  }, [fov, near, far, fovDamping, nearDamping, farDamping, invalidate]);

  return null;
}
