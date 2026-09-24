import { BindingModes, type InputAxisController, type PanTiltAim } from '@kvvasuu/klipp';
import { Aim, Body, InputController, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useControls } from 'leva';
import { useRef } from 'react';
import { Euler, Group, Quaternion } from 'three';
import { Airplane } from '../../scene/Airplane';
import { CanvasOverlay } from '../../scene/CanvasOverlay';
import { Crosshair } from '../../scene/Crosshair';
import { GroundClutter } from '../../scene/GroundClutter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';
import { usePointerLock } from '../../scene/usePointerLock';

const initialQuaternion = new Quaternion().setFromEuler(new Euler((-10 * Math.PI) / 180, 0, 0));

const degreesPerPixel = 0.15;
const lookSource = { axes: { x: 'pan', y: 'tilt' }, gain: degreesPerPixel };
const seatOffset: [number, number, number] = [0, 0.8, 1];

export function PanTiltReferenceFrame() {
  const planeRef = useRef<Group>(null);
  const controllerRef = useRef<InputAxisController>(null);
  const aimRef = useRef<PanTiltAim>(null);

  const { rigidMount, lockPointer } = useControls('PanTilt: Reference Frame', {
    rigidMount: true,
    lockPointer: false,
  });

  const locked = usePointerLock(controllerRef, lockPointer);

  return (
    <>
      <GroundClutter layout="flightPath" />
      <Airplane ref={planeRef} />

      <Klipp>
        <VirtualCamera
          name="pan-tilt-reference-frame-demo"
          priority={10}
          initialState={{ quaternion: initialQuaternion }}>
          <Body.Follow target={planeRef} offset={seatOffset} bindingMode={BindingModes.lockToTarget} />
          <Aim.PanTilt ref={aimRef} target={rigidMount ? planeRef : undefined} damping={0.05}>
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
        </div>
      </CanvasOverlay>
    </>
  );
}
