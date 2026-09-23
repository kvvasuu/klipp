import type { InputAxisController, PanTiltAim } from '@kvvasuu/klipp';
import { Aim, InputController, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import { useRef } from 'react';
import { CanvasOverlay } from '../../scene/CanvasOverlay';
import { Crosshair } from '../../scene/Crosshair';
import { GroundClutter, type GroundBox } from '../../scene/GroundClutter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';
import { usePointerLock } from '../../scene/usePointerLock';

const groundBoxes: GroundBox[] = [
  { x: 2, z: 2, width: 0.7, height: 0.12, depth: 0.7 },
  { x: -3, z: 4, width: 0.6, height: 0.15, depth: 0.8 },
  { x: 5, z: -3, width: 0.8, height: 0.1, depth: 0.6, color: '#9a9aa8' },
  { x: -6, z: -2, width: 0.7, height: 0.12, depth: 0.7 },
  { x: 0, z: -6, width: 0.6, height: 0.1, depth: 0.9 },
  { x: 4, z: 5, width: 0.8, height: 0.15, depth: 0.6, color: '#9a9aa8' },
  { x: -5, z: 4, width: 0.7, height: 0.1, depth: 0.7 },
  { x: 7, z: 2, width: 0.6, height: 0.13, depth: 0.8 },
  { x: -2, z: -6, width: 0.8, height: 0.1, depth: 0.6, color: '#9a9aa8' },
  { x: 3, z: -6, width: 0.7, height: 0.12, depth: 0.7 },
  { x: 10, z: 2, width: 0.6, height: 1.8, depth: 0.6 },
  { x: 7, z: 8, width: 0.5, height: 2.4, depth: 0.5, color: '#9a9aa8' },
  { x: 2, z: 11, width: 0.7, height: 3, depth: 0.7 },
  { x: -4, z: 10.5, width: 0.6, height: 2, depth: 0.6, color: '#c7c7cf' },
  { x: -9, z: 6, width: 0.8, height: 2.8, depth: 0.8 },
  { x: -11, z: -1, width: 0.5, height: 1.6, depth: 0.5, color: '#9a9aa8' },
  { x: -8, z: -7, width: 0.6, height: 3.2, depth: 0.6 },
  { x: -3, z: -11, width: 0.7, height: 2.2, depth: 0.7, color: '#c7c7cf' },
  { x: 3, z: -11, width: 0.5, height: 2.6, depth: 0.5 },
  { x: 9, z: -6, width: 0.6, height: 1.9, depth: 0.6, color: '#9a9aa8' },
  { x: 12, z: -2, width: 0.7, height: 3, depth: 0.7 },
  { x: -12, z: 3, width: 0.5, height: 2.1, depth: 0.5, color: '#c7c7cf' },
];

const degreesPerPixel = 0.15;
const lookSource = { axes: { x: 'pan', y: 'tilt' }, gain: degreesPerPixel };

export function PanTilt() {
  const controllerRef = useRef<InputAxisController>(null);
  const aimRef = useRef<PanTiltAim>(null);
  const panValueRef = useRef<HTMLDivElement>(null);

  const { lockPointer, damping, maxSpeed, autoNormalize } = useControls('PanTilt', {
    lockPointer: false,
    damping: { value: 0.1, min: 0, max: 2, step: 0.05 },
    maxSpeed: { value: 5000, min: 10, max: 10000, step: 10 },
    autoNormalize: true,
  });

  const locked = usePointerLock(controllerRef, lockPointer);

  useFrame(() => {
    if (!panValueRef.current || !aimRef.current) return;
    const { pan, tilt } = aimRef.current;
    panValueRef.current.textContent = `pan.value: ${pan.value.toFixed(1)}°  tilt.value: ${tilt.value.toFixed(1)}°`;
  });

  return (
    <>
      <GroundClutter boxes={groundBoxes} />

      <Klipp>
        <VirtualCamera name="pan-tilt-demo" priority={10} initialState={{ position: [0, 2, 0] }}>
          <Aim.PanTilt ref={aimRef} damping={damping} maxSpeed={maxSpeed} autoNormalize={autoNormalize}>
            <InputController
              ref={controllerRef}
              mouseButtons={{ left: lookSource, right: lookSource }}
              touches={{ one: lookSource }}
              suppressContextMenu
            />
          </Aim.PanTilt>
          <SpectatorFrustum />
        </VirtualCamera>
      </Klipp>

      <CanvasOverlay>
        {locked && <Crosshair />}
        <div className="pan-tilt-hud">
          {lockPointer ? 'left-click: lock cursor\nright-drag or touch: look around' : 'drag or touch: look around'}
          <div ref={panValueRef} />
        </div>
      </CanvasOverlay>
    </>
  );
}
