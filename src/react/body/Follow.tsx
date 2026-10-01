import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { createFollowParams } from '../../core/body/follow.js';
import { resolveVec3, type Vector3Like } from '../../three/resolve/resolveVector3.js';
import type { Target } from '../../three/resolve/Target.js';
import { useTargetSlot } from '../useTargetSlot.js';
import { useVirtualCamera } from '../VirtualCameraContext.js';
import { FollowBody, type FollowOptions } from '../../three/body/FollowBody.js';

export type FollowProps = Omit<FollowOptions, 'offset'> & {
  /** Target to follow. Unresolved targets are ignored. */
  target?: Target;
  /** Offset from the target, rotated according to `bindingMode`. */
  offset?: Vector3Like;
  ref?: Ref<FollowBody>;
};

/** Follows a target with a configurable offset and rotation frame. */
export function Follow({ target, offset, ref, ...settings }: FollowProps) {
  const { controller, state, initialState } = useVirtualCamera();
  const params = createFollowParams({
    ...settings,
    offset: offset === undefined ? undefined : resolveVec3([0, 0, 0], offset),
  });
  const [body] = useState(() => {
    const instance = new FollowBody(target, params);
    if (initialState?.position) instance.primeFrom(state.position);
    return instance;
  });
  body.target = target;
  body.targetSlot = useTargetSlot(target);
  Object.assign(body, params);

  useImperativeHandle(ref, () => body, [body]);
  useEffect(() => controller.registerBody(body.update), [controller, body]);

  return null;
}
