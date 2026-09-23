import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { DampingConstant } from '../damping/Damper';
import { DebugZoneOverlay, type DebugZone } from '../DebugZoneOverlay';
import type { Target } from '../resolve/Target';
import { useVirtualCamera } from '../VirtualCameraContext';
import { PositionComposerBody } from './PositionComposerBody';

export type PositionComposerProps = {
  /** Target to compose around. Unresolved targets are ignored. */
  target?: Target;
  /** Desired distance from the camera to the target. */
  cameraDistance?: number;
  /** Allowed target depth drift before the camera dollies. */
  depthDeadZone?: number;
  /** Where the target should land on screen: `[x, y]`, `0` = center, `±1` = edge. */
  screenPosition?: [number, number];
  /** Allowed target drift from `screenPosition` before the camera shifts laterally. */
  deadZone?: [number, number];
  /** Response time for dolly and lateral composition. */
  damping?: DampingConstant;
  /** Maximum damping speed for both stages, in world units/sec. */
  maxSpeed?: number;
  /** Maximum allowed target drift, enforced immediately. */
  hardLimit?: [number, number];
  /** Target radius used when composing its visible edge. Ignored when `size` is set. */
  radius?: number;
  /** Target dimensions used when composing its visible edges. */
  size?: Vector3Like;
  /** Seconds to extrapolate the target's tracked position ahead by. */
  lookaheadTime?: number;
  /** Smooth-time budget (seconds) for the velocity estimate driving `lookaheadTime`. */
  lookaheadSmoothing?: number;
  /** Whether lookahead ignores vertical movement. */
  lookaheadIgnoreY?: boolean;
  /** Draws the `deadZone` and `hardLimit` overlays. */
  debug?: boolean;
  ref?: Ref<PositionComposerBody>;
};

const defaultScreenPosition: [number, number] = [0, 0];
const defaultDeadZone: [number, number] = [0, 0];
const defaultHardLimit: [number, number] = [0, 0];

/** Positions the camera around a target while maintaining screen composition. */
export function PositionComposer({
  target,
  cameraDistance = 10,
  screenPosition = defaultScreenPosition,
  deadZone = defaultDeadZone,
  damping = 0,
  maxSpeed = Infinity,
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
  const { controller, state: cameraState, initialState } = useVirtualCamera();
  const aspect = useThree((state) => state.viewport.aspect);
  const [body] = useState(() => {
    const instance = new PositionComposerBody(
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
      maxSpeed,
    );
    if (initialState?.position) instance.primeFrom(cameraState.position);
    return instance;
  });
  body.target = target;
  body.cameraDistance = cameraDistance;
  body.screenPosition = screenPosition;
  body.aspect = aspect;
  body.deadZone = deadZone;
  body.damping = damping;
  body.maxSpeed = maxSpeed;
  body.hardLimit = hardLimit;
  body.radius = radius;
  body.size = size;
  body.depthDeadZone = depthDeadZone;
  body.lookaheadTime = lookaheadTime;
  body.lookaheadSmoothing = lookaheadSmoothing;
  body.lookaheadIgnoreY = lookaheadIgnoreY;

  useImperativeHandle(ref, () => body, [body]);
  useEffect(() => controller.registerBody(body.update), [controller, body]);

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
