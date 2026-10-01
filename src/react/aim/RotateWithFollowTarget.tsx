import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { createRotateWithFollowTargetParams } from '../../core/aim/rotateWithFollowTarget.js';
import type { Target } from '../../three/resolve/Target.js';
import { useTargetSlot } from '../useTargetSlot.js';
import { useVirtualCamera } from '../VirtualCameraContext.js';
import {
  RotateWithFollowTargetAim,
  type RotateWithFollowTargetOptions,
} from '../../three/aim/RotateWithFollowTargetAim.js';

export type RotateWithFollowTargetProps = RotateWithFollowTargetOptions & {
  /** Target rotation to copy. Unresolved targets are ignored. */
  target?: Target;
  ref?: Ref<RotateWithFollowTargetAim>;
};

/** Thin wrapper around `RotateWithFollowTargetAim`. */
export function RotateWithFollowTarget({ target, ref, ...settings }: RotateWithFollowTargetProps) {
  const { controller, state, initialState } = useVirtualCamera();
  const params = createRotateWithFollowTargetParams(settings);
  const [aim] = useState(() => {
    const instance = new RotateWithFollowTargetAim(target, params);
    if (initialState?.quaternion) instance.primeFrom(state.quaternion);
    return instance;
  });
  aim.target = target;
  aim.targetSlot = useTargetSlot(target);
  Object.assign(aim, params);

  useImperativeHandle(ref, () => aim, [aim]);
  useEffect(() => controller.registerAim(aim.update), [controller, aim]);

  return null;
}
