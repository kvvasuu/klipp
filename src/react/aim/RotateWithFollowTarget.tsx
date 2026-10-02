import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { createRotateWithFollowTargetParams } from '../../core/aim/rotateWithFollowTarget.js';
import type { Target } from '../../three/resolve/Target.js';
import { useVirtualCamera } from '../VirtualCameraContext.js';
import {
  RotateWithFollowTargetAimThree,
  type RotateWithFollowTargetOptions,
} from '../../three/aim/RotateWithFollowTargetAimThree.js';

export type RotateWithFollowTargetProps = RotateWithFollowTargetOptions & {
  /** Target rotation to copy. Unresolved targets are ignored. */
  target?: Target;
  ref?: Ref<RotateWithFollowTargetAimThree>;
};

/** Thin wrapper around `RotateWithFollowTargetAimThree`. */
export function RotateWithFollowTarget({ target, ref, ...settings }: RotateWithFollowTargetProps) {
  const camera = useVirtualCamera();
  const params = createRotateWithFollowTargetParams(settings);
  const [aim] = useState(() => new RotateWithFollowTargetAimThree(target, params));
  aim.target = target;
  Object.assign(aim, params);

  useImperativeHandle(ref, () => aim, [aim]);
  useEffect(() => camera.setAim(aim), [camera, aim]);

  return null;
}
