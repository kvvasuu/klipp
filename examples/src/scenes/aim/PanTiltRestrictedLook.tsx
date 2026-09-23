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
const markerDistance = 10;
const markerHeight = 2;

/** A pillar marking one edge of `panRange`, at the world direction the camera reaches right at its limit. */
function RangeMarker({ angleDeg }: { angleDeg: number }) {
  const rad = (angleDeg * Math.PI) / 180;
  const position: [number, number, number] = [
    Math.sin(rad) * markerDistance,
    markerHeight,
    -Math.cos(rad) * markerDistance,
  ];
  return (
    <mesh position={position}>
      <cylinderGeometry args={[0.3, 0.3, 3, 12]} />
      <meshStandardMaterial color="#ff6b4a" emissive="#ff6b4a" emissiveIntensity={0.3} />
    </mesh>
  );
}

/** `panWrap`/`tiltWrap` both false - a security-camera turret with a hard-limited field of view, instead
 *  of `PanTilt`'s default full, free look-around. Drag to either pillar and keep dragging past it - the
 *  camera stops dead at the edge instead of continuing or wrapping. */
export function PanTiltRestrictedLook() {
  const controllerRef = useRef<InputAxisController>(null);

  const { panMin, panMax, tiltMin, tiltMax, lockPointer } = useControls('PanTilt: Restricted Look', {
    panMin: { value: -60, min: -180, max: 0, step: 5 },
    panMax: { value: 60, min: 0, max: 180, step: 5 },
    tiltMin: { value: -20, min: -90, max: 0, step: 5 },
    tiltMax: { value: 30, min: 0, max: 90, step: 5 },
    lockPointer: false,
  });

  const locked = usePointerLock(controllerRef, lockPointer);

  return (
    <>
      <GroundClutter boxes={groundBoxes} />
      <RangeMarker angleDeg={panMin} />
      <RangeMarker angleDeg={panMax} />

      <Klipp>
        <VirtualCamera name="pan-tilt-restricted-look-demo" priority={10} initialState={{ position: [0, 2, 0] }}>
          <Aim.PanTilt
            panWrap={false}
            tiltWrap={false}
            panRange={[panMin, panMax]}
            damping={0.05}
            tiltRange={[tiltMin, tiltMax]}>
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
            'drag past either pillar and keep dragging -\nthe camera stops dead, it never wraps or slides past'}
        </div>
      </CanvasOverlay>
    </>
  );
}
