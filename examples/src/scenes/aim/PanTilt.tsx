import type { InputAxisController, PanTiltAim } from '@kvvasuu/klipp';
import { Aim, InputController, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import { useRef } from 'react';
import { CanvasOverlay } from '../../scene/CanvasOverlay';
import { Crosshair } from '../../scene/Crosshair';
import { GroundClutter } from '../../scene/GroundClutter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';
import { usePointerLock } from '../../scene/usePointerLock';

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
      <GroundClutter layout="standard" />

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
