import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { DampingConstant } from '../damping/Damper';
import type { Target } from '../resolve/Target';
import { useVirtualCamera } from '../VirtualCamera';
import { RotateWithFollowTargetAim } from './RotateWithFollowTargetAim';

export type RotateWithFollowTargetProps = {
  /** Rotation source — the camera's rotation becomes this object's world rotation. A fixed-point target
   *  (no rotation), `null`/`undefined`/omitted are all a no-op. */
  target?: Target;
  /** Spring response time to the target's rotation (or `{into, from}` for asymmetric damping). `0`
   *  (default) = hard, instant match. */
  damping?: DampingConstant;
  /** Caps how fast `damping` can close the gap, in radians/sec. Default `Infinity` (no cap) - only
   *  matters once `damping > 0`. */
  maxSpeed?: number;
  /** Imperative access to the underlying `RotateWithFollowTargetAim`, for reading/writing
   *  `target`/`damping`/`maxSpeed` directly instead of through props. */
  ref?: Ref<RotateWithFollowTargetAim>;
};

/** Thin wrapper — the actual logic lives in `RotateWithFollowTargetAim`. */
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
