import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { createHardLockToTargetParams } from '../../core/body/hardLockToTarget.js';
import type { Target } from '../../three/resolve/Target.js';
import { useVirtualCamera } from '../VirtualCameraContext.js';
import { HardLockToTargetBodyThree, type HardLockToTargetOptions } from '../../three/body/HardLockToTargetBodyThree.js';

export type HardLockToTargetProps = HardLockToTargetOptions & {
  /** Target position to follow. Unresolved targets are ignored. */
  target?: Target;
  ref?: Ref<HardLockToTargetBodyThree>;
};

/** Simple body that locks the camera to a target position, optionally with damping. */
export function HardLockToTarget({ target, ref, ...settings }: HardLockToTargetProps) {
  const camera = useVirtualCamera();
  const params = createHardLockToTargetParams(settings);
  const [body] = useState(() => new HardLockToTargetBodyThree(target, params));
  body.target = target;
  Object.assign(body, params);

  useImperativeHandle(ref, () => body, [body]);
  useEffect(() => camera.setBody(body), [camera, body]);

  return null;
}
