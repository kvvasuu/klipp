import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { DampingConstant } from '../damping/Damper';
import type { Target } from '../resolve/Target';
import { useVirtualCameraSlots } from '../VirtualCamera';
import { HardLockToTargetBody } from './HardLockToTargetBody';

export type HardLockToTargetProps = {
  /** Tracking Target — the camera's position becomes this position/object's world position. `null`/
   *  `undefined`/omitted is a no-op, same as an unmounted ref. */
  target?: Target;
  /** Spring response time to the target's position, per axis (or `{into, from}` for asymmetric
   *  damping). `0` (default) = hard, instant lock. */
  damping?: DampingConstant;
  /** Caps how fast `damping` can close the gap, in world units/sec, per axis. Default `Infinity` (no
   *  cap) - only matters once `damping > 0`. */
  maxSpeed?: number;
  /** Imperative access to the underlying `HardLockToTargetBody`, for reading/writing
   *  `target`/`damping`/`maxSpeed` directly instead of through props. */
  ref?: Ref<HardLockToTargetBody>;
};

/** Simplest Body: position = Tracking Target's world position, optionally damped. Thin wrapper — the
 *  actual logic lives in `HardLockToTargetBody`. */
export function HardLockToTarget({ target, damping = 0, maxSpeed = Infinity, ref }: HardLockToTargetProps) {
  const slots = useVirtualCameraSlots();
  const [body] = useState(() => new HardLockToTargetBody(target, damping));
  body.target = target;
  body.damping = damping;
  body.maxSpeed = maxSpeed;

  useImperativeHandle(ref, () => body, [body]);
  useEffect(() => slots.registerBody(body.update), [slots, body]);

  return null;
}
