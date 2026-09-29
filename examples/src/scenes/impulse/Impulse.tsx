import { impulseField, ImpulseShapes, type ImpulseShape } from '@kvvasuu/klipp';
import { ImpulseListener, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { CameraControls } from '@kvvasuu/klipp/react/camera-controls';
import { bezier } from '@leva-ui/plugin-bezier';
import { useFrame } from '@react-three/fiber';
import { button, useControls } from 'leva';
import { useRef, useState } from 'react';
import { type Mesh } from 'three';
import { GroundClutter } from '../../scene/GroundClutter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const cameraPosition: [number, number, number] = [0, 3, 10];
const pulseDurationMs = 350;

/** Longer shapes get longer durations, so each envelope has time to read on screen. */
const sources: {
  label: string;
  shape: ImpulseShape;
  duration: number;
  position: [number, number, number];
  color: string;
}[] = [
  { label: '🟠 Recoil', shape: ImpulseShapes.recoil, duration: 0.4, position: [1.3, 1, 2], color: '#ff6b4a' },
  { label: '🔵 Bump', shape: ImpulseShapes.bump, duration: 0.5, position: [-1.3, 1, 2], color: '#21a9e0' },
  { label: '🟡 Explosion', shape: ImpulseShapes.explosion, duration: 1, position: [1.3, 1, -2], color: '#ffd23f' },
  { label: '🟢 Rumble', shape: ImpulseShapes.rumble, duration: 2.5, position: [-1.3, 1, -2], color: '#7ed957' },
];

const customPosition: [number, number, number] = [0, 1, 0];
const customColor = '#c084fc';

type LevaGet = (path: string) => unknown;
type SetPulseTimes = (update: (times: number[]) => number[]) => void;
type Bezier = { evaluate: (t: number) => number };

const customIndex = sources.length;

function kickDirection(get: LevaGet): [number, number, number] {
  if (get('Impulse.cameraSpace')) return [0, 0, get('Impulse.kickStrength') as number];
  const { x, y, z } = get('Impulse.direction') as { x: number; y: number; z: number };
  return [x, y, z];
}

function fire(
  get: LevaGet,
  position: [number, number, number],
  shape: ImpulseShape,
  duration: number,
  setPulseTimes: SetPulseTimes,
  index: number,
) {
  impulseField.generate({
    position,
    direction: kickDirection(get),
    shape,
    duration,
    radius: get('Impulse.radius') as number,
    dissipationDistance: get('Impulse.dissipationDistance') as number,
  });
  const now = performance.now();
  setPulseTimes((times) => times.with(index, now));
}

function fireCustom(get: LevaGet, setPulseTimes: SetPulseTimes) {
  const curve = get('Impulse.customShape') as Bezier;
  // the editor draws a 0->1 easing curve, so fold t into 0->1->0 to use it for both the rise and the fall
  const shape: ImpulseShape = (t) => curve.evaluate(t < 0.5 ? t * 2 : (1 - t) * 2);
  fire(get, customPosition, shape, get('Impulse.customDuration') as number, setPulseTimes, customIndex);
}

function ExplosionMarker({
  position,
  color,
  pulseTime,
}: {
  position: [number, number, number];
  color: string;
  pulseTime: number;
}) {
  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const elapsed = performance.now() - pulseTime;
    const pulse = elapsed < pulseDurationMs ? 1 - elapsed / pulseDurationMs : 0;
    mesh.scale.setScalar(1 + pulse * 0.8);
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[0.4, 16, 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
    </mesh>
  );
}

export function Impulse() {
  const [pulseTimes, setPulseTimes] = useState<number[]>(() => new Array(sources.length + 1).fill(0));

  const { gain, shake, cameraSpace } = useControls('Impulse', {
    cameraSpace: true,
    kickStrength: { value: 1.5, min: 0, max: 5, step: 0.1, render: (get) => get('Impulse.cameraSpace') },
    direction: { value: { x: 0, y: 0.3, z: 1 }, render: (get) => !get('Impulse.cameraSpace') },
    radius: { value: 3, min: 0, max: 10, step: 0.5 },
    dissipationDistance: { value: 12, min: 0, max: 30, step: 1 },
    gain: { value: 1.5, min: 0, max: 5, step: 0.1 },
    shake: true,
    customShape: bezier([0.65, 0, 0.35, 1]),
    customDuration: { value: 1, min: 0.1, max: 3, step: 0.05 },
    ...Object.fromEntries(
      sources.map(({ label, shape, duration, position }, i) => [
        label,
        button((get) => fire(get, position, shape, duration, setPulseTimes, i)),
      ]),
    ),
    '🟣 Custom': button((get) => fireCustom(get, setPulseTimes)),
  });

  return (
    <>
      <GroundClutter layout="standard" />
      {sources.map(({ position, color }, i) => (
        <ExplosionMarker key={color} position={position} color={color} pulseTime={pulseTimes[i]} />
      ))}
      <ExplosionMarker position={customPosition} color={customColor} pulseTime={pulseTimes[customIndex]} />

      <Klipp>
        <VirtualCamera name="impulse-demo" priority={10}>
          <CameraControls initialPosition={cameraPosition} />
          <ImpulseListener
            gain={gain}
            shake={shake ? { positionAmplitude: [0.1, 0.1, 0.1], rotationAmplitude: [3, 3, 3] } : undefined}
            cameraSpace={cameraSpace}
          />
          <SpectatorFrustum />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
