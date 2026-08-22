import { useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { Target } from '../resolve/Target';
import { useIsActiveVirtualCamera, useIsLiveVirtualCamera, useVirtualCameraSlots } from '../VirtualCamera';
import { OrbitalControlsBody } from './OrbitalControlsBody';

export type OrbitalControlsProps = {
  /** Tracking Target — the camera orbits around this position/object's world position. `null`/
   *  `undefined`/omitted leaves the underlying `camera-controls` orbit target wherever it last was. */
  target?: Target;
  /** Starting distance from `target`, only used once at construction — `camera-controls` otherwise
   *  starts the camera coincident with the target (a degenerate zero-distance orbit). Set the actual
   *  live distance afterward via `ref`'s `controls.dollyTo(...)`. Default `10`. */
  initialDistance?: number;
  /** Whether to wait for an in-progress blend INTO this camera to finish before listening to drag/
   *  scroll input. Default `true`: connects once this camera is what `Klipp` is actually showing
   *  (`useIsLiveVirtualCamera`). Set `false` to connect the instant this camera wins priority
   *  arbitration instead (`useIsActiveVirtualCamera`), even while still blending in — dragging then moves
   *  the orbit target while the blend is compositing toward it, visibly fighting the blend. Only matters
   *  if this `<VirtualCamera>` isn't already the sole/always-active one. */
  waitForBlend?: boolean;
  /** Imperative access to the underlying `OrbitalControlsBody` — `.controls` on it is a real
   *  `camera-controls` `CameraControls` instance for configuring anything not exposed as a prop here
   *  (`smoothTime`, `minDistance`/`maxDistance`, `minPolarAngle`/`maxPolarAngle`, ...). */
  ref?: Ref<OrbitalControlsBody>;
};

/**
 * User-input-driven orbit around a target — klipp's adapter for `camera-controls`, see
 * `OrbitalControlsBody`'s doc comment for the algorithm. Thin wrapper — the actual logic lives there.
 *
 * Opt-in subpath (`klipp/body/orbital-controls`) — deliberately NOT exported from klipp's main entry or
 * the `Body` namespace, so `camera-controls` never ends up in a consumer's bundle unless they import this
 * file directly. `camera-controls` is a peer dependency (optional) for exactly this reason.
 *
 * Connects/disconnects `camera-controls`' own mouse/wheel/touch listeners as this `<VirtualCamera>`
 * becomes/stops being `KlippCore`'s priority winner — NOT tied to mount/unmount, and gated on
 * `waitForBlend`. A non-connected `<OrbitalControls>` still has its `update(out, dt)` running every frame
 * — the target keeps being tracked in the background — it just stops listening to drag/scroll, so
 * switching back doesn't reveal a camera that silently moved from unrelated input.
 */
export function OrbitalControls({ target, initialDistance = 10, waitForBlend = true, ref }: OrbitalControlsProps) {
  const slots = useVirtualCameraSlots();
  const isActive = useIsActiveVirtualCamera();
  const isLive = useIsLiveVirtualCamera();
  const shouldConnect = waitForBlend ? isLive : isActive;
  const aspect = useThree((state) => state.viewport.aspect);
  const domElement = useThree((state) => state.gl.domElement);
  const [body] = useState(() => new OrbitalControlsBody(target, aspect, initialDistance));
  body.target = target;
  body.aspect = aspect;

  useImperativeHandle(ref, () => body, [body]);
  useEffect(() => slots.registerBody(body.update), [slots, body]);
  useEffect(() => {
    if (!shouldConnect) return;
    body.controls.connect(domElement);
    return () => body.controls.disconnect();
  }, [body, domElement, shouldConnect]);

  return null;
}
