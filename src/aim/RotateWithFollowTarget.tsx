import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { DampingConstant } from '../damping/Damper';
import type { Target } from '../resolve/Target';
import { useVirtualCamera } from '../VirtualCameraContext';
import { RotateWithFollowTargetAim } from './RotateWithFollowTargetAim';

export type RotateWithFollowTargetProps = {
  /** Target rotation to copy. Unresolved targets are ignored. */
  target?: Target;
  /** Spring response time to the target's rotation (or `{into, from}` for asymmetric damping). */
  damping?: DampingConstant;
  /** Caps how fast `damping` can close the gap, in radians/sec. */
  maxSpeed?: number;
  ref?: Ref<RotateWithFollowTargetAim>;
};

/** Thin wrapper around `RotateWithFollowTargetAim`. */
export function RotateWithFollowTarget({ target, damping = 0, maxSpeed = Infinity, ref }: RotateWithFollowTargetProps) {
  const { controller, state, initialState } = useVirtualCamera();
  const [aim] = useState(() => {
    const instance = new RotateWithFollowTargetAim(target, damping, maxSpeed);
    if (initialState?.quaternion) instance.primeFrom(state.quaternion);
    return instance;
  });
  aim.target = target;
  aim.damping = damping;
  aim.maxSpeed = maxSpeed;

  useImperativeHandle(ref, () => aim, [aim]);
  useEffect(() => controller.registerAim(aim.update), [controller, aim]);

  return null;
}
