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

export function PanTiltRestrictedLook() {
  const controllerRef = useRef<InputAxisController>(null);

  const { panMin, panMax, tiltMin, tiltMax, lockPointer } = useControls('PanTilt: Restricted Look', {
    panMin: { value: -30, min: -180, max: 0, step: 5 },
    panMax: { value: 30, min: 0, max: 180, step: 5 },
    tiltMin: { value: -20, min: -90, max: 0, step: 5 },
    tiltMax: { value: 30, min: 0, max: 90, step: 5 },
    lockPointer: false,
  });

  const locked = usePointerLock(controllerRef, lockPointer);

  return (
    <>
      <GroundClutter layout="lookAround" />
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
