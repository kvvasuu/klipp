import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { DampingConstant } from '../damping/Damper';
import type { Target } from '../resolve/Target';
import { useVirtualCamera } from '../VirtualCameraContext';
import { HardLockToTargetBody } from './HardLockToTargetBody';

export type HardLockToTargetProps = {
  /** Target position to follow. Unresolved targets are ignored. */
  target?: Target;
  /** Response time for following the target position. */
  damping?: DampingConstant;
  /** Maximum damping speed, in world units/sec. */
  maxSpeed?: number;
  ref?: Ref<HardLockToTargetBody>;
};

/** Simple body that locks the camera to a target position, optionally with damping. */
export function HardLockToTarget({ target, damping = 0, maxSpeed = Infinity, ref }: HardLockToTargetProps) {
  const { controller } = useVirtualCamera();
  const [body] = useState(() => new HardLockToTargetBody(target, damping));
  body.target = target;
  body.damping = damping;
  body.maxSpeed = maxSpeed;

  useImperativeHandle(ref, () => body, [body]);
  useEffect(() => controller.registerBody(body.update), [controller, body]);

  return null;
}
