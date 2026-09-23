import type { ThreeElement, Vector3 as Vector3Like } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import CameraControlsImpl, { EventDispatcher } from 'camera-controls';
import { useEffect, useEffectEvent, useImperativeHandle, useState, type Ref } from 'react';
import { EventDispatcher as ThreeEventDispatcher, Vector3 } from 'three';
import { resolveVector3 } from '../resolve/resolveVector3';
import type { Target } from '../resolve/Target';
import { useIsActiveVirtualCamera, useIsLiveVirtualCamera, useVirtualCamera } from '../VirtualCameraContext';
import { CameraControlsBody } from './CameraControlsBody';

type Overwrite<T, U> = Omit<T, keyof U> & U;

export type CameraControlsProps = Omit<
  Overwrite<
    ThreeElement<typeof CameraControlsImpl>,
    {
      /** Target for orbiting and dollying. Omit for free camera controls. */
      target?: Target;
      /** World-space starting position, applied at construction regardless of `target`'s state. */
      initialPosition?: Vector3Like;
      /** `camera-controls`' own transition-easing argument for every call this makes. */
      enableTransition?: boolean;
      /** Custom `CameraControlsImpl` subclass to instantiate instead of the base class. */
      impl?: typeof CameraControlsImpl;
      /** Wait for an in-progress blend into this camera before listening to input. */
      waitForBlend?: boolean;
      /** Registers this instance as r3f's `state.controls` while it accepts input. */
      makeDefault?: boolean;
      ref?: Ref<CameraControlsBody>;
      /** Also lowers r3f's render quality while dragging/transitioning. */
      regress?: boolean;
      onControlStart?: (event: { type: 'controlstart' }) => void;
      onControl?: (event: { type: 'control' }) => void;
      onControlEnd?: (event: { type: 'controlend' }) => void;
      onTransitionStart?: (event: { type: 'transitionstart' }) => void;
      onUpdate?: (event: { type: 'update' }) => void;
      onWake?: (event: { type: 'wake' }) => void;
      onRest?: (event: { type: 'rest' }) => void;
      onSleep?: (event: { type: 'sleep' }) => void;
    }
  >,
  'args' | keyof EventDispatcher
>;

/** Connects `camera-controls` to the active virtual camera. */
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
  const { controller } = useVirtualCamera();
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
  useEffect(() => controller.registerBody(body.update), [controller, body]);
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
