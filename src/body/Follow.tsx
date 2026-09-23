import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { Vector3 } from 'three';
import type { DampingConstant } from '../damping/Damper';
import type { Target } from '../resolve/Target';
import { resolveVector3 } from '../resolve/resolveVector3';
import { useVirtualCamera } from '../VirtualCameraContext';
import { BindingModes, type BindingMode } from './BindingModes';
import { FollowBody } from './FollowBody';

const defaultOffset: Vector3Like = [0, 0, 10];

export type FollowProps = {
  /** Tracking Target — the camera keeps a fixed `offset` from this position/object's world transform.
   *  `null`/`undefined`/omitted is a no-op, same as an unmounted ref. */
  target?: Target;
  /** Offset from the target, rotated according to `bindingMode` before being added to its position.
   *  Default `(0, 0, 10)` — a positive Z sits the camera behind the target, not in front of it. */
  offset?: Vector3Like;
  /** Spring response time to the desired position, per axis (or `{into, from}` for asymmetric damping).
   *  `0` (default) = hard, instant follow. */
  damping?: DampingConstant;
  /** Which rotation, if any, `offset` is interpreted in. Default `BindingModes.lockToTarget` (the
   *  target's full, live rotation). */
  bindingMode?: BindingMode;
  /** Caps how fast `damping` can close the gap, in world units/sec, per axis. Default `Infinity` (no
   *  cap) - only matters once `damping > 0`. */
  maxSpeed?: number;
  /** Imperative access to the underlying `FollowBody`, for reading/writing
   *  `target`/`offset`/`damping`/`bindingMode`/`maxSpeed` directly instead of through props. */
  ref?: Ref<FollowBody>;
};

/** Constant offset from the Tracking Target, rotated per `bindingMode` and optionally damped. Thin
 *  wrapper — the actual logic lives in `FollowBody`. */
export function Follow({
  target,
  offset = defaultOffset,
  damping = 0,
  bindingMode = BindingModes.lockToTarget,
  maxSpeed = Infinity,
  ref,
}: FollowProps) {
  const { controller, state, initialState } = useVirtualCamera();
  const [body] = useState(() => {
    const instance = new FollowBody(target, new Vector3(), damping);
    if (initialState?.position) instance.primeFrom(state.position);
    return instance;
  });
  body.target = target;
  resolveVector3(body.offset, offset);
  body.damping = damping;
  body.bindingMode = bindingMode;
  body.maxSpeed = maxSpeed;

  useImperativeHandle(ref, () => body, [body]);
  useEffect(() => controller.registerBody(body.update), [controller, body]);

  return null;
}
