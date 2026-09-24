import { Body, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useControls } from 'leva';
import { useRef } from 'react';
import { Euler, Mesh, Quaternion } from 'three';
import { GroundClutter } from '../../scene/GroundClutter';
import { Orbiter, orbiterLoopRadius } from '../../scene/Orbiter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const cameraPosition: [number, number, number] = [0, 3, 20];
const cameraQuaternion = new Quaternion().setFromEuler(new Euler(-0.1, 0, 0));

export function PositionComposerLookahead() {
  const orbiterRef = useRef<Mesh>(null);

  const { cameraDistance, lookaheadTime, lookaheadSmoothing, lookaheadIgnoreY, debug } = useControls(
    'PositionComposer: Lookahead',
    {
      cameraDistance: { value: 14, min: 8, max: 24, step: 0.5 },
      lookaheadTime: { value: 0.5, min: 0, max: 1.5, step: 0.05 },
      lookaheadSmoothing: { value: 1, min: 0.05, max: 3, step: 0.05 },
      lookaheadIgnoreY: false,
      debug: true,
    },
  );

  return (
    <>
      <GroundClutter layout="standard" />
      <Orbiter ref={orbiterRef} />

      <Klipp>
        <VirtualCamera
          name="position-composer-lookahead-demo"
          priority={10}
          initialState={{ position: cameraPosition, quaternion: cameraQuaternion }}>
          <Body.PositionComposer
            target={orbiterRef}
            cameraDistance={cameraDistance}
            lookaheadTime={lookaheadTime}
            lookaheadSmoothing={lookaheadSmoothing}
            lookaheadIgnoreY={lookaheadIgnoreY}
            debug={debug}
          />
          <SpectatorFrustum maxDistance={cameraDistance + orbiterLoopRadius + 4} />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
