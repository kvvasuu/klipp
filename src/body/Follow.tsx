import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { Vector3 } from 'three';
import type { DampingConstant } from '../damping/Damper';
import { resolveVector3 } from '../resolve/resolveVector3';
import type { Target } from '../resolve/Target';
import { useVirtualCamera } from '../VirtualCameraContext';
import { BindingModes, type BindingMode } from './BindingModes';
import { FollowBody } from './FollowBody';

const defaultOffset: Vector3Like = [0, 0, 10];

export type FollowProps = {
  /** Target to follow. Unresolved targets are ignored. */
  target?: Target;
  /** Offset from the target, rotated according to `bindingMode`. */
  offset?: Vector3Like;
  /** Response time for following the target position. */
  damping?: DampingConstant;
  /** Rotation frame used to interpret `offset`. */
  bindingMode?: BindingMode;
  /** Maximum damping speed, in world units/sec. */
  maxSpeed?: number;
  ref?: Ref<FollowBody>;
};

/** Follows a target with a configurable offset and rotation frame. */
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
