import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { Target } from '../../three/resolve/Target.js';
import { useVirtualCamera } from '../VirtualCameraContext.js';
import { HardLookAtAimThree } from '../../three/aim/HardLookAtAimThree.js';

export type HardLookAtProps = {
  /** Target to look at. Unresolved targets are ignored. */
  target?: Target;
  ref?: Ref<HardLookAtAimThree>;
};

/** Thin wrapper around `HardLookAtAimThree`. */
export function HardLookAt({ target, ref }: HardLookAtProps) {
  const camera = useVirtualCamera();
  const [aim] = useState(() => new HardLookAtAimThree(target));
  aim.target = target;

  useImperativeHandle(ref, () => aim, [aim]);
  useEffect(() => camera.setAim(aim), [camera, aim]);

  return null;
}
