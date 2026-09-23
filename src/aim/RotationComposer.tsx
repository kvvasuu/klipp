import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { Vector3 } from 'three';
import type { DampingConstant } from '../damping/Damper';
import { DebugZoneOverlay, type DebugZone } from '../DebugZoneOverlay';
import { resolveVector3 } from '../resolve/resolveVector3';
import type { Target } from '../resolve/Target';
import { useVirtualCamera } from '../VirtualCameraContext';
import { RotationComposerAim } from './RotationComposerAim';

export type RotationComposerProps = {
  /** Target to compose at `screenPosition`. Unresolved targets are ignored. */
  target?: Target;
  /** Where the target should land on screen: `[x, y]`, `0` = center, `±1` = edge. */
  screenPosition?: [number, number];
  /** Allowed target drift from `screenPosition` before the camera reacts. */
  deadZone?: [number, number];
  /** Response time when the target leaves the `deadZone`. */
  damping?: DampingConstant;
  /** Maximum damping speed, in radians/sec. */
  maxSpeed?: number;
  /** Maximum allowed target drift, enforced immediately. */
  hardLimit?: [number, number];
  /** Offset applied in the target's local rotation space. */
  targetOffset?: Vector3Like;
  /** Target radius used when composing its visible edge. Ignored when `size` is set. */
  radius?: number;
  /** Target dimensions used when composing its visible edges. */
  size?: Vector3Like;
  /** Seconds to aim ahead of the target's current position. */
  lookaheadTime?: number;
  /** Smoothing time for the lookahead velocity estimate. */
  lookaheadSmoothing?: number;
  /** Whether lookahead ignores vertical movement. */
  lookaheadIgnoreY?: boolean;
  /** Draws the `deadZone` and `hardLimit` overlays. */
  debug?: boolean;
  ref?: Ref<RotationComposerAim>;
};

const defaultScreenPosition: [number, number] = [0, 0];
const defaultDeadZone: [number, number] = [0, 0];
const defaultHardLimit: [number, number] = [0, 0];
const defaultTargetOffset: Vector3Like = [0, 0, 0];

/** Keeps a target within a chosen screen region by rotating the camera. */
export function RotationComposer({
  target,
  screenPosition = defaultScreenPosition,
  deadZone = defaultDeadZone,
  damping = 0,
  maxSpeed = Infinity,
  hardLimit = defaultHardLimit,
  targetOffset = defaultTargetOffset,
  radius,
  size,
  lookaheadTime = 0,
  lookaheadSmoothing = 1,
  lookaheadIgnoreY = false,
  debug = false,
  ref,
}: RotationComposerProps) {
  const { controller, state: cameraState, initialState } = useVirtualCamera();
  const aspect = useThree((state) => state.viewport.aspect);
  const [aim] = useState(() => {
    const instance = new RotationComposerAim(
      target,
      screenPosition,
      aspect,
      deadZone,
      damping,
      hardLimit,
      new Vector3(),
      radius,
      size,
      lookaheadTime,
      lookaheadSmoothing,
      lookaheadIgnoreY,
      maxSpeed,
    );
    if (initialState?.quaternion) instance.primeFrom(cameraState.quaternion);
    return instance;
  });
  aim.target = target;
  aim.screenPosition = screenPosition;
  aim.aspect = aspect;
  aim.deadZone = deadZone;
  aim.damping = damping;
  aim.maxSpeed = maxSpeed;
  aim.hardLimit = hardLimit;
  aim.radius = radius;
  aim.size = size;
  aim.lookaheadTime = lookaheadTime;
  aim.lookaheadSmoothing = lookaheadSmoothing;
  aim.lookaheadIgnoreY = lookaheadIgnoreY;
  resolveVector3(aim.targetOffset, targetOffset);

  useImperativeHandle(ref, () => aim, [aim]);
  useEffect(() => controller.registerAim(aim.update), [controller, aim]);

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
