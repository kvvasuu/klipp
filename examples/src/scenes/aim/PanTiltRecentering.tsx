import type { InputAxisController } from '@kvvasuu/klipp';
import { Aim, InputController, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
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
];

const degreesPerPixel = 0.15;
const lookSource = { axes: { x: 'pan', y: 'tilt' }, gain: degreesPerPixel };
const centerMarkerPosition: [number, number, number] = [0, 2, -10];

/** Drag away from center, release, and wait - `pan`/`tilt` both ease back toward 0 (the glowing marker's
 *  direction) once `wait` seconds pass with no further `applyDelta`. Any new drag cancels an in-progress
 *  recenter immediately. */
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
      <GroundClutter boxes={groundBoxes} />
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
