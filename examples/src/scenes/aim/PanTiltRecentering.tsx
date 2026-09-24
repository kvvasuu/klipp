import type { InputAxisController } from '@kvvasuu/klipp';
import { Aim, InputController, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useControls } from 'leva';
import { useRef } from 'react';
import { CanvasOverlay } from '../../scene/CanvasOverlay';
import { Crosshair } from '../../scene/Crosshair';
import { GroundClutter } from '../../scene/GroundClutter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';
import { usePointerLock } from '../../scene/usePointerLock';

const degreesPerPixel = 0.15;
const lookSource = { axes: { x: 'pan', y: 'tilt' }, gain: degreesPerPixel };
const centerMarkerPosition: [number, number, number] = [0, 2, -10];

export function PanTiltRecentering() {
  const controllerRef = useRef<InputAxisController>(null);

  const { enabled, wait, time, lockPointer } = useControls('PanTilt: Recentering', {
    enabled: true,
    wait: { value: 1, min: 0, max: 5, step: 0.1 },
    time: { value: 1, min: 0.1, max: 3, step: 0.1 },
    lockPointer: false,
  });

  const locked = usePointerLock(controllerRef, lockPointer);

  return (
    <>
      <GroundClutter layout="lookAround" />
      <mesh position={centerMarkerPosition}>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial color="#7ed957" emissive="#7ed957" emissiveIntensity={0.5} />
      </mesh>

      <Klipp>
        <VirtualCamera name="pan-tilt-recentering-demo" priority={10} initialState={{ position: [0, 2, 0] }}>
          <Aim.PanTilt recentering={{ enabled, wait, time }} damping={0.05}>
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
          {(lockPointer ? 'left-click: lock cursor\n' : '') +
            'drag away, release, and wait -\nit eases back to the glowing marker on its own'}
        </div>
      </CanvasOverlay>
    </>
  );
}
