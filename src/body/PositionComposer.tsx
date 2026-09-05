import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { DampingConstant } from '../damping/Damper';
import type { Target } from '../resolve/Target';
import { useVirtualCameraSlots } from '../VirtualCamera';
import { PositionComposerBody } from './PositionComposerBody';

export type PositionComposerProps = {
  /** Tracking Target — the camera composes its shot around this position/object's world position.
   *  `null`/`undefined`/omitted is a no-op, same as an unmounted ref. */
  target?: Target;
  /** Desired distance from the camera to the target, along the camera's own forward axis. Default `10`. */
  cameraDistance?: number;
  /** Where the target should land on screen: `[x, y]`, `0` = center, `±1` = edge. Default `[0, 0]`
   *  (dead center). */
  screenPosition?: [number, number];
  /** Box (`[width, height]`, screen fractions) around `screenPosition` where the target can sit with NO
   *  lateral camera reaction at all. Default `[0, 0]` (none — always reacts). */
  deadZone?: [number, number];
  /** Seconds to catch up to the dead zone's edge once the target steps outside it (or `{into, from}` for
   *  asymmetric damping). Only matters when `deadZone` is non-zero. `0` (default) = hard, instant snap
   *  to the edge. */
  damping?: DampingConstant;
  /** A SECOND, normally wider box (`[width, height]`, same units as `deadZone`) the target may never
   *  visually leave — enforced instantly (bypassing `damping`) after the damped dead zone reaction runs.
   *  Default `[0, 0]` (none). */
  hardLimit?: [number, number];
  /** Target's own bounding-sphere radius — `deadZone`/`hardLimit` then react to its nearest EDGE, not its
   *  center. Ignored if `size` is given. Default: a dimensionless point. */
  radius?: number;
  /** Target's full box dimensions — takes priority over `radius`. Auto-detected from a `Mesh` target's own
   *  geometry bounds when neither is given. */
  size?: Vector3Like;
  /** Imperative access to the underlying `PositionComposerBody`, for reading/writing
   *  `target`/`cameraDistance`/`screenPosition`/`deadZone`/`damping`/`hardLimit`/`radius`/`size` directly
   *  instead of through props. */
  ref?: Ref<PositionComposerBody>;
};

const defaultScreenPosition: [number, number] = [0, 0];
const defaultDeadZone: [number, number] = [0, 0];
const defaultHardLimit: [number, number] = [0, 0];

/**
 * Two-stage, position-only Body, see `PositionComposerBody`'s doc comment for the algorithm. Thin wrapper
 * — the actual logic lives there. `aspect` is read reactively from the canvas (`useThree`), since
 * `CameraState` has no lens/viewport info of its own.
 */
export function PositionComposer({
  target,
  cameraDistance = 10,
  screenPosition = defaultScreenPosition,
  deadZone = defaultDeadZone,
  damping = 0,
  hardLimit = defaultHardLimit,
  radius,
  size,
  ref,
}: PositionComposerProps) {
  const slots = useVirtualCameraSlots();
  const aspect = useThree((state) => state.viewport.aspect);
  const [body] = useState(
    () =>
      new PositionComposerBody(target, cameraDistance, screenPosition, aspect, deadZone, damping, hardLimit, radius, size),
  );
  body.target = target;
  body.cameraDistance = cameraDistance;
  body.screenPosition = screenPosition;
  body.aspect = aspect;
  body.deadZone = deadZone;
  body.damping = damping;
  body.hardLimit = hardLimit;
  body.radius = radius;
  body.size = size;

  useImperativeHandle(ref, () => body, [body]);
  useEffect(() => slots.registerBody(body.update), [slots, body]);

  return null;
}
