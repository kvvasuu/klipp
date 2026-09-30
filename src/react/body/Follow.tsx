import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { DampingConstant } from '../../core/damping/Damper.js';
import { resolveVec3 } from '../../three/resolve/resolveVector3.js';
import type { Target } from '../../three/resolve/Target.js';
import { useTargetSlot } from '../useTargetSlot.js';
import { useVirtualCamera } from '../VirtualCameraContext.js';
import { BindingModes, type BindingMode } from '../../core/body/BindingModes.js';
import { FollowBody } from '../../three/body/FollowBody.js';

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
    const instance = new FollowBody(target, [0, 0, 0], damping);
    if (initialState?.position) instance.primeFrom(state.position);
    return instance;
  });
  body.target = target;
  body.targetSlot = useTargetSlot(target);
  resolveVec3(body.offset, offset);
  body.damping = damping;
  body.bindingMode = bindingMode;
  body.maxSpeed = maxSpeed;

  useImperativeHandle(ref, () => body, [body]);
  useEffect(() => controller.registerBody(body.update), [controller, body]);

  return null;
}
