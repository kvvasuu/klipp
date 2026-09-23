import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { Target } from '../resolve/Target';
import { useVirtualCamera } from '../VirtualCameraContext';
import { HardLookAtAim } from './HardLookAtAim';

export type HardLookAtProps = {
  /** Target to look at. Unresolved targets are ignored. */
  target?: Target;
  ref?: Ref<HardLookAtAim>;
};

/** Thin wrapper around `HardLookAtAim`. */
export function HardLookAt({ target, ref }: HardLookAtProps) {
  const { controller } = useVirtualCamera();
  const [aim] = useState(() => new HardLookAtAim(target));
  aim.target = target;

  useImperativeHandle(ref, () => aim, [aim]);
  useEffect(() => controller.registerAim(aim.update), [controller, aim]);

  return null;
}
