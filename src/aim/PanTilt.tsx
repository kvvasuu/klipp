import { useEffect, useImperativeHandle, useState, type ReactNode, type Ref } from 'react';
import type { DampingConstant } from '../damping/Damper';
import type { InputAxisRecentering } from '../input/InputAxis';
import { InputAxisOwnerContext } from '../input/InputController';
import type { Target } from '../resolve/Target';
import { useVirtualCameraSlots } from '../VirtualCamera';
import { PanTiltAim } from './PanTiltAim';

export type PanTiltProps = {
  /** Rotation frame `pan`/`tilt` compose on top of. `null`/`undefined`/omitted is world
   *  (`referenceUp`-aware), same as an unmounted ref. */
  target?: Target;
  /** Applied to both `pan.damping` and `tilt.damping`. Default `0` (instant, no smoothing). */
  damping?: DampingConstant;
  /** Applied to both `pan.maxSpeed` and `tilt.maxSpeed` - caps how fast `damping` can close the gap, in
   *  degrees/sec. Default `Infinity`. */
  maxSpeed?: number;
  /** `pan.autoNormalize`. Only applies while `panWrap` is `true`. Default `false`. */
  autoNormalize?: boolean;
  /** `pan.wrap` - `true` (default) loops at `panRange`'s edges, `false` hard-clamps. */
  panWrap?: boolean;
  /** `tilt.wrap` - see `panWrap`. Default `false`. */
  tiltWrap?: boolean;
  /** `pan.range` - its edges wrap or clamp depending on `panWrap`. Default `[-180, 180]`. */
  panRange?: [number, number];
  /** `tilt.range` - its edges wrap or clamp depending on `tiltWrap`. Default `[-90, 90]`. */
  tiltRange?: [number, number];
  /** Applied to both `pan.recentering` and `tilt.recentering`. Default disabled. */
  recentering?: InputAxisRecentering;
  /** Imperative access to the underlying `PanTiltAim`, for reading/writing its fields directly instead of
   *  through props, or driving `.pan`/`.tilt` via `applyDelta`. */
  ref?: Ref<PanTiltAim>;
  /** A nested `<InputController>` picks up `pan`/`tilt` automatically, without an explicit `target`. */
  children?: ReactNode;
};

const defaultPanRange: [number, number] = [-180, 180];
const defaultTiltRange: [number, number] = [-90, 90];
const defaultRecentering: InputAxisRecentering = { enabled: false, wait: 1, time: 1 };

/** Thin wrapper - the actual logic lives in `PanTiltAim`. */
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
  const slots = useVirtualCameraSlots();
  const [aim] = useState(() => new PanTiltAim());
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
  useEffect(() => slots.registerAim(aim.update), [slots, aim]);

  return <InputAxisOwnerContext.Provider value={aim}>{children}</InputAxisOwnerContext.Provider>;
}
