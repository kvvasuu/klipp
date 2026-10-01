import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { createHardLockToTargetParams } from '../../core/body/hardLockToTarget.js';
import type { Target } from '../../three/resolve/Target.js';
import { useTargetSlot } from '../useTargetSlot.js';
import { useVirtualCamera } from '../VirtualCameraContext.js';
import { HardLockToTargetBody, type HardLockToTargetOptions } from '../../three/body/HardLockToTargetBody.js';

export type HardLockToTargetProps = HardLockToTargetOptions & {
  /** Target position to follow. Unresolved targets are ignored. */
  target?: Target;
  ref?: Ref<HardLockToTargetBody>;
};

/** Simple body that locks the camera to a target position, optionally with damping. */
export function HardLockToTarget({ target, ref, ...settings }: HardLockToTargetProps) {
  const { controller } = useVirtualCamera();
  const params = createHardLockToTargetParams(settings);
  const [body] = useState(() => new HardLockToTargetBody(target, params));
  body.target = target;
  body.targetSlot = useTargetSlot(target);
  Object.assign(body, params);

  useImperativeHandle(ref, () => body, [body]);
  useEffect(() => controller.registerBody(body.update), [controller, body]);

  return null;
}
