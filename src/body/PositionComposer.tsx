import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { DampingConstant } from '../damping/Damper';
import { DebugZoneOverlay, type DebugZone } from '../DebugZoneOverlay';
import type { Target } from '../resolve/Target';
import { useVirtualCameraSlots } from '../VirtualCamera';
import { PositionComposerBody } from './PositionComposerBody';

export type PositionComposerProps = {
  /** Tracking Target — the camera composes its shot around this position/object's world position.
   *  `null`/`undefined`/omitted is a no-op, same as an unmounted ref. */
  target?: Target;
  /** Desired distance from the camera to the target, along the camera's own forward axis. Default `10`. */
  cameraDistance?: number;
  /** How far the target's depth can drift from `cameraDistance` with NO dolly reaction at all - world
   *  units along the camera's forward axis. Default `0` (none — always reacts). */
  depthDeadZone?: number;
  /** Where the target should land on screen: `[x, y]`, `0` = center, `±1` = edge. Default `[0, 0]`
   *  (dead center). */
  screenPosition?: [number, number];
  /** How far (`[x, y]`) the target can drift from `screenPosition` with NO lateral camera reaction at
   *  all — same unit as `screenPosition` itself (`1` reaches the frame edge). Default `[0, 0]` (none —
   *  always reacts). */
  deadZone?: [number, number];
  /** Seconds to catch up to the desired depth and the dead zone's edge (or `{into, from}` for asymmetric
   *  damping) — the dolly stage reacts to `depthDeadZone`, the lateral stage to `deadZone`. `0` (default)
   *  = hard, instant snap to both. */
  damping?: DampingConstant;
  /** A SECOND, normally larger reach (`[x, y]`, same unit as `deadZone`) the target may never visually
   *  drift past — enforced instantly (bypassing `damping`) after the damped dead zone reaction runs.
   *  Default `[0, 0]` (none). */
  hardLimit?: [number, number];
  /** Target's own bounding-sphere radius — `deadZone`/`hardLimit` then react to its nearest EDGE, not its
   *  center. Ignored if `size` is given. Default: a dimensionless point. */
  radius?: number;
  /** Target's full box dimensions — takes priority over `radius`. Auto-detected from a `Mesh` target's own
   *  geometry bounds when neither is given. */
  size?: Vector3Like;
  /** Seconds to extrapolate the target's tracked position ahead by, based on its recent velocity. Default
   *  `0` (none). */
  lookaheadTime?: number;
  /** Smooth-time budget (seconds) for the velocity estimate driving `lookaheadTime`. Default `1`. */
  lookaheadSmoothing?: number;
  /** Zeroes the Y component of the predicted offset - keeps lookahead horizontal for a target that bobs
   *  or jumps vertically. Default `false`. */
  lookaheadIgnoreY?: boolean;
  /** Draws `deadZone`/`hardLimit` as bordered rectangles over the canvas - only while this
   *  `VirtualCamera` is actually the one on screen. Default `false`. */
  debug?: boolean;
  /** Imperative access to the underlying `PositionComposerBody`, for reading/writing
   *  `target`/`cameraDistance`/`screenPosition`/`deadZone`/`damping`/`hardLimit`/`depthDeadZone`/`radius`/
   *  `size`/`lookaheadTime`/`lookaheadSmoothing`/`lookaheadIgnoreY` directly instead of through props, and
   *  for calling `recalculateSize()` on a target that deformed (a `SkinnedMesh` bone animation, a mutated
   *  `BufferGeometry`) - auto-detected `size` is otherwise only measured once. */
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
  depthDeadZone = 0,
  lookaheadTime = 0,
  lookaheadSmoothing = 1,
  lookaheadIgnoreY = false,
  debug = false,
  ref,
}: PositionComposerProps) {
  const slots = useVirtualCameraSlots();
  const aspect = useThree((state) => state.viewport.aspect);
  const [body] = useState(
    () =>
      new PositionComposerBody(
        target,
        cameraDistance,
        screenPosition,
        aspect,
        deadZone,
        damping,
        hardLimit,
        radius,
        size,
        depthDeadZone,
        lookaheadTime,
        lookaheadSmoothing,
        lookaheadIgnoreY,
      ),
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
  body.depthDeadZone = depthDeadZone;
  body.lookaheadTime = lookaheadTime;
  body.lookaheadSmoothing = lookaheadSmoothing;
  body.lookaheadIgnoreY = lookaheadIgnoreY;

  useImperativeHandle(ref, () => body, [body]);
  useEffect(() => slots.registerBody(body.update), [slots, body]);

  if (!debug) return null;
  const zones: DebugZone[] = [];
  // deadZone/hardLimit are a half-reach from screenPosition, DebugZoneOverlay wants a full box size
  if (hardLimit[0] > 0 || hardLimit[1] > 0) {
    zones.push({ screenPosition, size: [hardLimit[0] * 2, hardLimit[1] * 2], className: 'klipp-debug-hardlimit' });
  }
  if (deadZone[0] > 0 || deadZone[1] > 0) {
    zones.push({ screenPosition, size: [deadZone[0] * 2, deadZone[1] * 2], className: 'klipp-debug-deadzone' });
  }
  return <DebugZoneOverlay zones={zones} crosshair={screenPosition} />;
}
