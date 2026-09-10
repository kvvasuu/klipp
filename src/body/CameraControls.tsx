import type { ThreeElement, Vector3 as Vector3Like } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import CameraControlsImpl, { EventDispatcher } from 'camera-controls';
import { useEffect, useEffectEvent, useImperativeHandle, useState, type Ref } from 'react';
import { EventDispatcher as ThreeEventDispatcher, Vector3 } from 'three';
import { resolveVector3 } from '../resolve/resolveVector3';
import type { Target } from '../resolve/Target';
import { useIsActiveVirtualCamera, useIsLiveVirtualCamera, useVirtualCameraSlots } from '../VirtualCamera';
import { CameraControlsBody } from './CameraControlsBody';

type Overwrite<T, U> = Omit<T, keyof U> & U;

export type CameraControlsProps = Omit<
  Overwrite<
    ThreeElement<typeof CameraControlsImpl>,
    {
      /** Locks orbit/dolly onto this target. Omitted: full free `camera-controls`, like drei's `<CameraControls />`. */
      target?: Target;
      /** World-space starting position, applied at construction regardless of `target`'s state. */
      initialPosition?: Vector3Like;
      /** `camera-controls`' own transition-easing argument for every call this makes. Default `false`. */
      enableTransition?: boolean;
      /** Custom `CameraControlsImpl` subclass to instantiate instead of the base class. */
      impl?: typeof CameraControlsImpl;
      /** Wait for an in-progress blend into this camera before listening to input. Default `true`. */
      waitForBlend?: boolean;
      /** Registers this instance as r3f's `state.controls` while it's actually listening for input (see
       *  `waitForBlend`) - restores whatever was there before once it stops. Default `false`. */
      makeDefault?: boolean;
      /** Imperative access to the underlying `CameraControlsBody` (`.controls` is the real `CameraControlsImpl`). */
      ref?: Ref<CameraControlsBody>;
      /** Also lowers r3f's render quality while dragging/transitioning. Default `false`. */
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
    }
  >,
  'args' | keyof EventDispatcher
>;

/**
 * Thin wrapper - see `CameraControlsBody` for the actual logic.
 *
 * Opt-in subpath, not exported from the main entry, so `camera-controls` stays out of a consumer's
 * bundle unless imported directly. Connects/disconnects input listeners with priority arbitration,
 * not mount/unmount, gated on `waitForBlend`.
 *
 * Any other prop passes straight through onto the real `CameraControlsImpl` instance every render.
 */
export function CameraControls({
  target,
  initialPosition,
  enableTransition = false,
  impl = CameraControlsImpl,
  waitForBlend = true,
  makeDefault = false,
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
  ...controlsProps
}: CameraControlsProps) {
  const slots = useVirtualCameraSlots();
  const isActive = useIsActiveVirtualCamera();
  const isLive = useIsLiveVirtualCamera();
  const shouldConnect = isActive && (waitForBlend ? isLive : true);
  const aspect = useThree((state) => state.viewport.aspect);
  const domElement = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);
  const performance = useThree((state) => state.performance);
  const set = useThree((state) => state.set);
  const get = useThree((state) => state.get);
  const [body] = useState(
    () =>
      new CameraControlsBody(
        target,
        aspect,
        initialPosition ? resolveVector3(new Vector3(), initialPosition) : null,
        impl,
        enableTransition,
      ),
  );
  body.target = target;
  body.aspect = aspect;
  body.enableTransition = enableTransition;

  useImperativeHandle(ref, () => body, [body]);
  useEffect(() => slots.registerBody(body.update), [slots, body]);
  useEffect(() => {
    // gated on the same condition as input listening below - other tools reading state.controls
    // shouldn't see an instance that isn't actually accepting input yet
    if (!makeDefault || !shouldConnect) return;
    const previous = get().controls;
    set({ controls: body.controls as unknown as ThreeEventDispatcher });
    return () => set({ controls: previous });
  }, [makeDefault, shouldConnect, body, set, get]);

  const invalidateAndRegress = useEffectEvent((): void => {
    invalidate();
    if (regress) performance.regress();
  });
  const handleControlStart = useEffectEvent((e: { type: 'controlstart' }): void => {
    invalidateAndRegress();
    onControlStart?.(e);
  });
  const handleControl = useEffectEvent((e: { type: 'control' }): void => {
    invalidateAndRegress();
    onControl?.(e);
  });
  const handleControlEnd = useEffectEvent((e: { type: 'controlend' }): void => onControlEnd?.(e));
  const handleTransitionStart = useEffectEvent((e: { type: 'transitionstart' }): void => {
    invalidateAndRegress();
    onTransitionStart?.(e);
  });
  const handleUpdate = useEffectEvent((e: { type: 'update' }): void => {
    invalidateAndRegress();
    onUpdate?.(e);
  });
  const handleWake = useEffectEvent((e: { type: 'wake' }): void => {
    invalidateAndRegress();
    onWake?.(e);
  });
  const handleRest = useEffectEvent((e: { type: 'rest' }): void => onRest?.(e));
  const handleSleep = useEffectEvent((e: { type: 'sleep' }): void => onSleep?.(e));

  useEffect(() => {
    if (!shouldConnect) return;
    body.controls.connect(domElement);

    body.controls.addEventListener('controlstart', handleControlStart);
    body.controls.addEventListener('control', handleControl);
    body.controls.addEventListener('controlend', handleControlEnd);
    body.controls.addEventListener('transitionstart', handleTransitionStart);
    body.controls.addEventListener('update', handleUpdate);
    body.controls.addEventListener('wake', handleWake);
    body.controls.addEventListener('rest', handleRest);
    body.controls.addEventListener('sleep', handleSleep);

    // disconnect() drops the pointer-lock listeners without releasing the OS-level lock itself -
    // reconnecting re-locks so mouse movement resumes, unless the user already exited it (Esc)
    if (domElement.ownerDocument.pointerLockElement === domElement) body.controls.lockPointer();

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
  }, [body, domElement, shouldConnect]);

  return <primitive object={body.controls} {...controlsProps} />;
}
