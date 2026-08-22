import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { DampingConstant } from '../damping/Damper';
import type { Target } from '../resolve/Target';
import { useVirtualCameraSlots } from '../VirtualCamera';
import { HardLockToTargetBody } from './HardLockToTargetBody';

export type HardLockToTargetProps = {
  /** Tracking Target — the camera's position becomes this position/object's world position. `null`/
   *  `undefined`/omitted is a no-op, same as an unmounted ref. */
  target?: Target;
  /** Seconds to catch up to the target's position, per axis (or `{into, from}` for asymmetric damping).
   *  `0` (default) = hard, instant lock. */
  damping?: DampingConstant;
  /** Imperative access to the underlying `HardLockToTargetBody`, for reading/writing `target`/`damping`
   *  directly instead of through props. */
  ref?: Ref<HardLockToTargetBody>;
};

/** Simplest Body: position = Tracking Target's world position, optionally damped. Thin wrapper — the
 *  actual logic lives in `HardLockToTargetBody`. */
export function HardLockToTarget({ target, damping = 0, ref }: HardLockToTargetProps) {
  const slots = useVirtualCameraSlots();
  const [body] = useState(() => new HardLockToTargetBody(target, damping));
  body.target = target;
  body.damping = damping;

  useImperativeHandle(ref, () => body, [body]);
  useEffect(() => slots.registerBody(body.update), [slots, body]);

  return null;
}
