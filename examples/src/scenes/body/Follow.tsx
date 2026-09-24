import { BindingModes, type BindingMode } from '@kvvasuu/klipp';
import { Aim, Body, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useControls } from 'leva';
import { useRef } from 'react';
import { Group } from 'three';
import { Airplane } from '../../scene/Airplane';
import { GroundClutter } from '../../scene/GroundClutter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

export function Follow() {
  const planeRef = useRef<Group>(null);

  const { offset, damping, bindingMode } = useControls('Follow', {
    offset: { x: 0, y: 0.5, z: 5 },
    damping: { value: 0, min: 0, max: 2, step: 0.05 },
    bindingMode: { value: BindingModes.lockToTarget as BindingMode, options: Object.values(BindingModes) },
  });

  return (
    <>
      <GroundClutter layout="flightPath" />
      <Airplane ref={planeRef} />

      <Klipp>
        <VirtualCamera name="follow-demo" priority={10}>
          <Body.Follow
            target={planeRef}
            offset={[offset.x, offset.y, offset.z]}
            damping={damping}
            bindingMode={bindingMode}
          />
          <Aim.HardLookAt target={planeRef} />
          <SpectatorFrustum />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
