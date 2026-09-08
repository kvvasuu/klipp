import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { DampingConstant } from '../damping/Damper';
import type { Target } from '../resolve/Target';
import { useVirtualCameraSlots } from '../VirtualCamera';
import { RotateWithFollowTargetAim } from './RotateWithFollowTargetAim';

export type RotateWithFollowTargetProps = {
  /** Rotation source — the camera's rotation becomes this object's world rotation. A fixed-point target
   *  (no rotation), `null`/`undefined`/omitted are all a no-op. */
  target?: Target;
  /** Seconds to catch up to the target's rotation (or `{into, from}` for asymmetric damping). `0`
   *  (default) = hard, instant match. */
  damping?: DampingConstant;
  /** Imperative access to the underlying `RotateWithFollowTargetAim`, for reading/writing
   *  `target`/`damping` directly instead of through props. */
  ref?: Ref<RotateWithFollowTargetAim>;
};

/** Thin wrapper — the actual logic lives in `RotateWithFollowTargetAim`. */
export function RotateWithFollowTarget({ target, damping = 0, ref }: RotateWithFollowTargetProps) {
  const slots = useVirtualCameraSlots();
  const [aim] = useState(() => new RotateWithFollowTargetAim(target, damping));
  aim.target = target;
  aim.damping = damping;

  useImperativeHandle(ref, () => aim, [aim]);
  useEffect(() => slots.registerAim(aim.update), [slots, aim]);

  return null;
}
