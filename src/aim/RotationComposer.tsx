import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { Vector3 } from 'three';
import type { DampingConstant } from '../damping/Damper';
import { resolveVector3 } from '../resolve/resolveVector3';
import type { Target } from '../resolve/Target';
import { useVirtualCameraSlots } from '../VirtualCamera';
import { RotationComposerAim } from './RotationComposerAim';

export type RotationComposerProps = {
  /** Look At Target — the camera rotates so this position/object composes at `screenPosition`. `null`/
   *  `undefined`/omitted is a no-op, same as an unmounted ref. */
  target?: Target;
  /** Where the target should land on screen: `[x, y]`, `0` = center, `±1` = edge. Default `[0, 0]`
   *  (dead center, same result as `HardLookAt`). */
  screenPosition?: [number, number];
  /** Box (`[width, height]`, screen fractions) around `screenPosition` where the target can sit with NO
   *  camera reaction at all. Default `[0, 0]` (none — always reacts, same as `HardLookAt`). */
  deadZone?: [number, number];
  /** Seconds to catch up to the dead zone's edge once the target steps outside it (or `{into, from}` for
   *  asymmetric damping). Only matters when `deadZone` is non-zero. `0` (default) = hard, instant snap
   *  to the edge. */
  damping?: DampingConstant;
  /** A SECOND, normally wider box (`[width, height]`, same units as `deadZone`) the target may never
   *  visually leave — enforced instantly (bypassing `damping`) after the damped dead zone reaction runs.
   *  Default `[0, 0]` (none). */
  hardLimit?: [number, number];
  /** Translation applied to the target's position, in the target's own local rotation space, before all
   *  composition math — e.g. aim at a character's head instead of its feet/origin. Degrades to a plain
   *  world-space offset for a target with no rotation (a fixed point). Default `(0, 0, 0)`. */
  targetOffset?: Vector3Like;
  /** Imperative access to the underlying `RotationComposerAim`, for reading/writing
   *  `target`/`screenPosition`/`deadZone`/`damping`/`hardLimit`/`targetOffset` directly instead of
   *  through props. */
  ref?: Ref<RotationComposerAim>;
};

const defaultScreenPosition: [number, number] = [0, 0];
const defaultDeadZone: [number, number] = [0, 0];
const defaultHardLimit: [number, number] = [0, 0];
const defaultTargetOffset: Vector3Like = [0, 0, 0];

/**
 * Rotation-only Aim, see `RotationComposerAim`'s doc comment for the algorithm. Thin wrapper — the actual
 * logic lives there. `aspect` is read reactively from the canvas (`useThree`), since `CameraState` has no
 * lens/viewport info of its own.
 */
export function RotationComposer({
  target,
  screenPosition = defaultScreenPosition,
  deadZone = defaultDeadZone,
  damping = 0,
  hardLimit = defaultHardLimit,
  targetOffset = defaultTargetOffset,
  ref,
}: RotationComposerProps) {
  const slots = useVirtualCameraSlots();
  const aspect = useThree((state) => state.viewport.aspect);
  const [aim] = useState(
    () => new RotationComposerAim(target, screenPosition, aspect, deadZone, damping, hardLimit, new Vector3()),
  );
  aim.target = target;
  aim.screenPosition = screenPosition;
  aim.aspect = aspect;
  aim.deadZone = deadZone;
  aim.damping = damping;
  aim.hardLimit = hardLimit;
  resolveVector3(aim.targetOffset, targetOffset);

  useImperativeHandle(ref, () => aim, [aim]);
  useEffect(() => slots.registerAim(aim.update), [slots, aim]);

  return null;
}
