import { useEffect, useImperativeHandle, useState, type ReactNode, type Ref } from 'react';
import type { DampingConstant } from '../damping/Damper';
import type { InputAxisRecentering } from '../input/InputAxis';
import { InputAxisOwnerContext } from '../input/InputAxisOwnerContext';
import type { Target } from '../resolve/Target';
import { useVirtualCamera } from '../VirtualCameraContext';
import { PanTiltAim } from './PanTiltAim';

export type PanTiltProps = {
  /** Rotation frame `pan`/`tilt` compose on top of.
   * `null`/`undefined`/omitted is world (`referenceUp`-aware) */
  target?: Target;
  /** Applied to both `pan.damping` and `tilt.damping`. */
  damping?: DampingConstant;
  /** Applied to both `pan.maxSpeed` and `tilt.maxSpeed` - caps how fast `damping` can close the gap, in degrees/sec. */
  maxSpeed?: number;
  /** `pan.autoNormalize`. Only applies while `panWrap` is `true`. */
  autoNormalize?: boolean;
  /** `pan.wrap` - loops at `panRange`'s edges or hard-clamps them. */
  panWrap?: boolean;
  /** `tilt.wrap` - see `panWrap`. */
  tiltWrap?: boolean;
  /** `pan.range` - its edges wrap or clamp depending on `panWrap`. */
  panRange?: [number, number];
  /** `tilt.range` - its edges wrap or clamp depending on `tiltWrap`. */
  tiltRange?: [number, number];
  /** Applied to both `pan.recentering` and `tilt.recentering`. */
  recentering?: InputAxisRecentering;
  ref?: Ref<PanTiltAim>;
  /** Nested `<InputController>` picks up `pan`/`tilt` automatically without an explicit `target`. */
  children?: ReactNode;
};

const defaultPanRange: [number, number] = [-180, 180];
const defaultTiltRange: [number, number] = [-90, 90];
const defaultRecentering: InputAxisRecentering = { enabled: false, wait: 1, time: 1 };

/** Thin wrapper around `PanTiltAim`. */
export function PanTilt({
  target,
  damping = 0,
  maxSpeed = Infinity,
  autoNormalize = false,
  panWrap = true,
  tiltWrap = false,
  panRange = defaultPanRange,
  tiltRange = defaultTiltRange,
  recentering = defaultRecentering,
  ref,
  children,
}: PanTiltProps) {
  const { controller, state, initialState } = useVirtualCamera();
  // matches initialState's own "applied once, at mount" contract
  const [aim] = useState(() => {
    const instance = new PanTiltAim();
    if (initialState?.quaternion) {
      instance.setFromRotation(initialState.quaternion, state.referenceUp);
      instance.pan.reset();
      instance.tilt.reset();
    }
    return instance;
  });
  aim.target = target;
  aim.pan.damping = damping;
  aim.pan.maxSpeed = maxSpeed;
  aim.pan.autoNormalize = autoNormalize;
  aim.pan.wrap = panWrap;
  aim.pan.range = panRange;
  aim.pan.recentering = recentering;
  aim.tilt.damping = damping;
  aim.tilt.maxSpeed = maxSpeed;
  aim.tilt.wrap = tiltWrap;
  aim.tilt.range = tiltRange;
  aim.tilt.recentering = recentering;

  useImperativeHandle(ref, () => aim, [aim]);
  useEffect(() => controller.registerAim(aim.update), [controller, aim]);

  return <InputAxisOwnerContext.Provider value={aim}>{children}</InputAxisOwnerContext.Provider>;
}
