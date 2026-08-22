import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { Target } from '../resolve/Target';
import { useVirtualCameraSlots } from '../VirtualCamera';
import { HardLookAtAim } from './HardLookAtAim';

export type HardLookAtProps = {
  /** Look At Target — the camera rotates so this position/object is dead-center in frame. `null`/
   *  `undefined`/omitted is a no-op, same as an unmounted ref. */
  target?: Target;
  /** Imperative access to the underlying `HardLookAtAim`, for reading/writing `target` directly instead
   *  of through props. */
  ref?: Ref<HardLookAtAim>;
};

/** Thin wrapper — the actual logic lives in `HardLookAtAim`. */
export function HardLookAt({ target, ref }: HardLookAtProps) {
  const slots = useVirtualCameraSlots();
  const [aim] = useState(() => new HardLookAtAim(target));
  aim.target = target;

  useImperativeHandle(ref, () => aim, [aim]);
  useEffect(() => slots.registerAim(aim.update), [slots, aim]);

  return null;
}
