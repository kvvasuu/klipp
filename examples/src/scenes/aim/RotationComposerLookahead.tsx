import { Aim, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import { useRef, type RefObject } from 'react';
import type { Mesh } from 'three';
import { GroundClutter, type GroundBox } from '../../scene/GroundClutter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const cameraPosition: [number, number, number] = [0, 5, 15];

const loopRadius = 6;
const baseAngularSpeed = 0.5;
const speedVariation = 0.6;
const speedOscFreq = 0.4;
const bobAmplitude = 1.5;
const bobFreq = 0.9;
const baseHeight = 2.2;

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

function Orbiter({ meshRef }: { meshRef: RefObject<Mesh | null> }) {
  const angleRef = useRef(0);

  useFrame(({ clock }, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    angleRef.current += baseAngularSpeed * (1 + speedVariation * Math.sin(t * speedOscFreq)) * delta;
    mesh.position.set(
      Math.cos(angleRef.current) * loopRadius,
      baseHeight + Math.sin(t * bobFreq) * bobAmplitude,
      Math.sin(angleRef.current) * loopRadius,
    );
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.5, 16, 16]} />
      <meshStandardMaterial color="#7ed957" emissive="#7ed957" emissiveIntensity={0.4} />
    </mesh>
  );
}

/** A ball loops at varying speed with a vertical bob, `screenPosition`/`deadZone`/`damping` all at their
 *  hard, instant, dead-center default - `lookaheadTime` already has it trailing off the crosshair,
 *  opposite its direction of travel, by an amount that tracks its current speed. Drop it to `0` to pin the
 *  ball dead-center instead; `lookaheadSmoothing` controls how quickly the slip catches up to a sudden
 *  speed change, and `lookaheadIgnoreY` drops the vertical half of it. Unlike the companion `PositionComposer:
 *  Lookahead` scene, the camera itself never moves - only `Aim.RotationComposer`'s rotation is doing this. */
export function RotationComposerLookahead() {
  const orbiterRef = useRef<Mesh>(null);

  const { lookaheadTime, lookaheadSmoothing, lookaheadIgnoreY, debug } = useControls('RotationComposer: Lookahead', {
    lookaheadTime: { value: 0.5, min: 0, max: 1.5, step: 0.05 },
    lookaheadSmoothing: { value: 1, min: 0.05, max: 3, step: 0.05 },
    lookaheadIgnoreY: false,
    debug: true,
  });

  return (
    <>
      <GroundClutter boxes={groundBoxes} />
      <Orbiter meshRef={orbiterRef} />

      <Klipp>
        <VirtualCamera
          name="rotation-composer-lookahead-demo"
          priority={10}
          initialState={{ position: cameraPosition }}>
          <Aim.RotationComposer
            target={orbiterRef}
            lookaheadTime={lookaheadTime}
            lookaheadSmoothing={lookaheadSmoothing}
            lookaheadIgnoreY={lookaheadIgnoreY}
            debug={debug}
          />
          <SpectatorFrustum maxDistance={cameraPosition[2] + loopRadius + 4} />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
