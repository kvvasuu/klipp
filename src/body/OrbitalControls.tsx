import { useThree } from '@react-three/fiber';
import CameraControls from 'camera-controls';
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
  /** Custom `CameraControls` subclass to instantiate instead of the base class — e.g. to override input
   *  handling. Only used once at construction. Default: the base `CameraControls` class. */
  impl?: typeof CameraControls;
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
  /** Also lowers r3f's render quality (`performance.regress()`) while dragging/transitioning, alongside
   *  `invalidate()`. Default `false`. */
  regress?: boolean;
  /** User starts dragging/touching. */
  onControlStart?: (event: { type: 'controlstart' }) => void;
  /** User is dragging (fires continuously). */
  onControl?: (event: { type: 'control' }) => void;
  /** User stops dragging/touching. */
  onControlEnd?: (event: { type: 'controlend' }) => void;
  /** Any transition starts — user control, or a `controls` method called with `enableTransition: true`. */
  onTransitionStart?: (event: { type: 'transitionstart' }) => void;
  /** The camera's transform actually changed this tick. */
  onUpdate?: (event: { type: 'update' }) => void;
  /** Was settled, just started moving again. */
  onWake?: (event: { type: 'wake' }) => void;
  /** Motion settled below `controls.restThreshold`. */
  onRest?: (event: { type: 'rest' }) => void;
  /** Was moving, just stopped. */
  onSleep?: (event: { type: 'sleep' }) => void;
};

/**
 * User-input-driven orbit around a target — klipp's adapter for `camera-controls`, see
 * `OrbitalControlsBody`'s doc comment for the algorithm. Thin wrapper — the actual logic lives there.
 *
 * Opt-in subpath (`@kvvasuu/klipp/body/orbital-controls`) — deliberately NOT exported from klipp's main entry or
 * the `Body` namespace, so `camera-controls` never ends up in a consumer's bundle unless they import this
 * file directly. `camera-controls` is a peer dependency (optional) for exactly this reason.
 *
 * Connects/disconnects `camera-controls`' own mouse/wheel/touch listeners as this `<VirtualCamera>`
 * becomes/stops being `KlippCore`'s priority winner — NOT tied to mount/unmount, and gated on
 * `waitForBlend`. A non-connected `<OrbitalControls>` still has its `update(out, dt)` running every frame
 * — the target keeps being tracked in the background — it just stops listening to drag/scroll, so
 * switching back doesn't reveal a camera that silently moved from unrelated input.
 */
export function OrbitalControls({
  target,
  initialDistance = 10,
  impl = CameraControls,
  waitForBlend = true,
  ref,
  regress = false,
  onControlStart,
  onControl,
  onControlEnd,
  onTransitionStart,
  onUpdate,
  onWake,
  onRest,
  onSleep,
}: OrbitalControlsProps) {
  const slots = useVirtualCameraSlots();
  const isActive = useIsActiveVirtualCamera();
  const isLive = useIsLiveVirtualCamera();
  const shouldConnect = waitForBlend ? isLive : isActive;
  const aspect = useThree((state) => state.viewport.aspect);
  const domElement = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);
  const performance = useThree((state) => state.performance);
  const [body] = useState(() => new OrbitalControlsBody(target, aspect, initialDistance, impl));
  body.target = target;
  body.aspect = aspect;

  useImperativeHandle(ref, () => body, [body]);
  useEffect(() => slots.registerBody(body.update), [slots, body]);
  useEffect(() => {
    if (!shouldConnect) return;
    body.controls.connect(domElement);

    const invalidateAndRegress = (): void => {
      invalidate();
      if (regress) performance.regress();
    };
    const handleControlStart = (e: { type: 'controlstart' }): void => {
      invalidateAndRegress();
      onControlStart?.(e);
    };
    const handleControl = (e: { type: 'control' }): void => {
      invalidateAndRegress();
      onControl?.(e);
    };
    const handleControlEnd = (e: { type: 'controlend' }): void => onControlEnd?.(e);
    const handleTransitionStart = (e: { type: 'transitionstart' }): void => {
      invalidateAndRegress();
      onTransitionStart?.(e);
    };
    const handleUpdate = (e: { type: 'update' }): void => {
      invalidateAndRegress();
      onUpdate?.(e);
    };
    const handleWake = (e: { type: 'wake' }): void => {
      invalidateAndRegress();
      onWake?.(e);
    };
    const handleRest = (e: { type: 'rest' }): void => onRest?.(e);
    const handleSleep = (e: { type: 'sleep' }): void => onSleep?.(e);

    body.controls.addEventListener('controlstart', handleControlStart);
    body.controls.addEventListener('control', handleControl);
    body.controls.addEventListener('controlend', handleControlEnd);
    body.controls.addEventListener('transitionstart', handleTransitionStart);
    body.controls.addEventListener('update', handleUpdate);
    body.controls.addEventListener('wake', handleWake);
    body.controls.addEventListener('rest', handleRest);
    body.controls.addEventListener('sleep', handleSleep);
    return () => {
      body.controls.disconnect();
      body.controls.removeEventListener('controlstart', handleControlStart);
      body.controls.removeEventListener('control', handleControl);
      body.controls.removeEventListener('controlend', handleControlEnd);
      body.controls.removeEventListener('transitionstart', handleTransitionStart);
      body.controls.removeEventListener('update', handleUpdate);
      body.controls.removeEventListener('wake', handleWake);
      body.controls.removeEventListener('rest', handleRest);
      body.controls.removeEventListener('sleep', handleSleep);
    };
  }, [
    body,
    domElement,
    shouldConnect,
    invalidate,
    regress,
    performance,
    onControlStart,
    onControl,
    onControlEnd,
    onTransitionStart,
    onUpdate,
    onWake,
    onRest,
    onSleep,
  ]);

  return null;
}
