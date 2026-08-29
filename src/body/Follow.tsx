import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { Vector3 } from 'three';
import type { DampingConstant } from '../damping/Damper';
import type { Target } from '../resolve/Target';
import { resolveVector3 } from '../resolve/resolveVector3';
import { useVirtualCameraSlots } from '../VirtualCamera';
import { BindingModes, type BindingMode } from './BindingModes';
import { FollowBody } from './FollowBody';

const defaultOffset: Vector3Like = [0, 0, 10];

export type FollowProps = {
  /** Tracking Target — the camera keeps a fixed `offset` from this position/object's world transform.
   *  `null`/`undefined`/omitted is a no-op, same as an unmounted ref. */
  target?: Target;
  /** Offset from the target, rotated according to `bindingMode` before being added to its position.
   *  Default `(0, 0, 10)` (see `FollowBody`'s doc comment for the sign convention). */
  offset?: Vector3Like;
  /** Seconds to catch up to the desired position, per axis (or `{into, from}` for asymmetric damping).
   *  `0` (default) = hard, instant follow. */
  damping?: DampingConstant;
  /** Which rotation, if any, `offset` is interpreted in. Default `BindingModes.lockToTarget` (the
   *  target's full, live rotation). See `FollowBody`'s doc comment for what each of the 5 modes does. */
  bindingMode?: BindingMode;
  /** Imperative access to the underlying `FollowBody`, for reading/writing
   *  `target`/`offset`/`damping`/`bindingMode` directly instead of through props. */
  ref?: Ref<FollowBody>;
};

/** Constant offset from the Tracking Target, rotated per `bindingMode` and optionally damped. Thin
 *  wrapper — the actual logic lives in `FollowBody`. */
export function Follow({
  target,
  offset = defaultOffset,
  damping = 0,
  bindingMode = BindingModes.lockToTarget,
  ref,
}: FollowProps) {
  const slots = useVirtualCameraSlots();
  const [body] = useState(() => new FollowBody(target, new Vector3()));
  body.target = target;
  resolveVector3(body.offset, offset);
  body.damping = damping;
  body.bindingMode = bindingMode;

  useImperativeHandle(ref, () => body, [body]);
  useEffect(() => slots.registerBody(body.update), [slots, body]);

  return null;
}
