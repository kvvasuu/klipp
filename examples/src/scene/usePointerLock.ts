import type { InputAxisController } from '@kvvasuu/klipp';
import { MouseButton } from '@kvvasuu/klipp';
import { useThree } from '@react-three/fiber';
import { useEffect, useEffectEvent, useState, type RefObject } from 'react';

/** Left-click toggles Pointer Lock while `enabled`. Returns whether the lock is currently engaged. */
export function usePointerLock(controllerRef: RefObject<InputAxisController | null>, enabled: boolean): boolean {
  const gl = useThree((state) => state.gl);
  const [locked, setLocked] = useState(false);

  const onPointerDown = useEffectEvent((event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || (event.buttons & MouseButton.left) !== MouseButton.left) return;
    const inputSystem = controllerRef.current?.inputSystem;
    if (!inputSystem) return;
    if (document.pointerLockElement === gl.domElement) inputSystem.exitPointerLock();
    else if (enabled) inputSystem.requestPointerLock();
  });

  useEffect(() => {
    const element = gl.domElement;
    element.addEventListener('pointerdown', onPointerDown);
    return () => element.removeEventListener('pointerdown', onPointerDown);
  }, [gl]);

  useEffect(() => {
    if (!enabled) controllerRef.current?.inputSystem.exitPointerLock();
  }, [enabled, controllerRef]);

  useEffect(() => {
    const onChange = (): void => setLocked(document.pointerLockElement === gl.domElement);
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, [gl]);

  return locked;
}
