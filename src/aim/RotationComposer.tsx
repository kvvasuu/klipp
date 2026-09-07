import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { Vector3 } from 'three';
import { DebugZoneOverlay, type DebugZone } from '../DebugZoneOverlay';
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
  /** How far (`[x, y]`) the target can drift from `screenPosition` with NO camera reaction at all — same
   *  unit as `screenPosition` itself (`1` reaches the frame edge). Default `[0, 0]` (none — always
   *  reacts, same as `HardLookAt`). */
  deadZone?: [number, number];
  /** Seconds to catch up to the dead zone's edge once the target steps outside it (or `{into, from}` for
   *  asymmetric damping). Only matters when `deadZone` is non-zero. `0` (default) = hard, instant snap
   *  to the edge. */
  damping?: DampingConstant;
  /** A SECOND, normally larger reach (`[x, y]`, same unit as `deadZone`) the target may never visually
   *  drift past — enforced instantly (bypassing `damping`) after the damped dead zone reaction runs.
   *  Default `[0, 0]` (none). */
  hardLimit?: [number, number];
  /** Translation applied to the target's position, in the target's own local rotation space, before all
   *  composition math — e.g. aim at a character's head instead of its feet/origin. Degrades to a plain
   *  world-space offset for a target with no rotation (a fixed point). Default `(0, 0, 0)`. */
  targetOffset?: Vector3Like;
  /** Target's own bounding-sphere radius — `deadZone`/`hardLimit` then react to its nearest EDGE, not its
   *  center. Ignored if `size` is given. Default: a dimensionless point. */
  radius?: number;
  /** Target's full box dimensions — takes priority over `radius`. Auto-detected from a `Mesh` target's own
   *  geometry bounds when neither is given. */
  size?: Vector3Like;
  /** Draws `deadZone`/`hardLimit` as bordered rectangles over the canvas - only while this
   *  `VirtualCamera` is actually the one on screen. Default `false`. */
  debug?: boolean;
  /** Imperative access to the underlying `RotationComposerAim`, for reading/writing
   *  `target`/`screenPosition`/`deadZone`/`damping`/`hardLimit`/`targetOffset`/`radius`/`size` directly
   *  instead of through props, and for calling `recalculateSize()` on a target that deformed (a
   *  `SkinnedMesh` bone animation, a mutated `BufferGeometry`) - auto-detected `size` is otherwise only
   *  measured once. */
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
  radius,
  size,
  debug = false,
  ref,
}: RotationComposerProps) {
  const slots = useVirtualCameraSlots();
  const aspect = useThree((state) => state.viewport.aspect);
  const [aim] = useState(
    () =>
      new RotationComposerAim(target, screenPosition, aspect, deadZone, damping, hardLimit, new Vector3(), radius, size),
  );
  aim.target = target;
  aim.screenPosition = screenPosition;
  aim.aspect = aspect;
  aim.deadZone = deadZone;
  aim.damping = damping;
  aim.hardLimit = hardLimit;
  aim.radius = radius;
  aim.size = size;
  resolveVector3(aim.targetOffset, targetOffset);

  useImperativeHandle(ref, () => aim, [aim]);
  useEffect(() => slots.registerAim(aim.update), [slots, aim]);

  if (!debug) return null;
  const zones: DebugZone[] = [];
  // deadZone/hardLimit are a half-reach from screenPosition, DebugZoneOverlay wants a full box size
  if (hardLimit[0] > 0 || hardLimit[1] > 0) {
    zones.push({ screenPosition, size: [hardLimit[0] * 2, hardLimit[1] * 2], color: '#cc3333' });
  }
  if (deadZone[0] > 0 || deadZone[1] > 0) {
    zones.push({ screenPosition, size: [deadZone[0] * 2, deadZone[1] * 2], color: '#33cc33' });
  }
  return <DebugZoneOverlay zones={zones} />;
}
