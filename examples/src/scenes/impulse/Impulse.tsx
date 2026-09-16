import { impulseField, ImpulseShapes, type ImpulseShape } from '@kvvasuu/klipp';
import { ImpulseListener, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { CameraControls } from '@kvvasuu/klipp/react/camera-controls';
import { bezier } from '@leva-ui/plugin-bezier';
import { useFrame } from '@react-three/fiber';
import { button, useControls } from 'leva';
import { useRef, type RefObject } from 'react';
import { type Mesh } from 'three';
import { GroundClutter, type GroundBox } from '../../scene/GroundClutter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const cameraPosition: [number, number, number] = [0, 3, 10];
const pulseDurationMs = 350;

/** `duration` per source, not a single shared value - each preset's attack/hold/decay shape only reads
 *  as distinct given enough real time to actually see it (`recoil`/`bump` snap by quickly on purpose,
 *  `rumble`'s long hold needs room to register at all). */
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

function ExplosionMarker({
  position,
  color,
  pulseRef,
}: {
  position: [number, number, number];
  color: string;
  pulseRef: RefObject<number>;
}) {
  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const elapsed = performance.now() - pulseRef.current;
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

/** One button per built-in `ImpulseShapes` preset. `cameraSpace` switches the kick between a fixed
 *  camera-relative punch (`kickStrength`) and a freely tunable world-space `direction`. `shake` adds a
 *  secondary rattle on the same `<ImpulseListener>`. `CameraControls` supplies the base position/rotation. */
export function Impulse() {
  const pulseRefs = useRef(sources.map(() => ({ current: 0 })));
  const customPulseRef = useRef({ current: 0 });
  // read by the buttons below - leva's own `get` needs a full folder-prefixed path, not the short key
  const paramsRef = useRef({
    kickStrength: 1,
    direction: { x: 0, y: 0.3, z: 1 },
    radius: 3,
    dissipationDistance: 12,
    cameraSpace: true,
    customShape: { evaluate: (t: number) => t } as { evaluate: (t: number) => number },
    customDuration: 1.5,
  });

  const {
    kickStrength,
    direction,
    radius,
    dissipationDistance,
    gain,
    shake,
    cameraSpace,
    customShape,
    customDuration,
  } = useControls('Impulse', {
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
        button(() => {
          const { kickStrength, direction, radius, dissipationDistance, cameraSpace } = paramsRef.current;
          impulseField.generate({
            position,
            direction: cameraSpace ? [0, 0, kickStrength] : [direction.x, direction.y, direction.z],
            shape,
            duration,
            radius,
            dissipationDistance,
          });
          pulseRefs.current[i].current = performance.now();
        }),
      ]),
    ),
    '🟣 Custom': button(() => {
      const { kickStrength, direction, radius, dissipationDistance, cameraSpace, customShape, customDuration } =
        paramsRef.current;
      impulseField.generate({
        position: customPosition,
        direction: cameraSpace ? [0, 0, kickStrength] : [direction.x, direction.y, direction.z],
        // the curve editor is a standard 0->1 CSS-style easing curve, not an envelope - fold t into a
        // 0->1->0 triangle first so the same edited shape governs both the rise and the mirrored fall
        shape: (t) => customShape.evaluate(t < 0.5 ? t * 2 : (1 - t) * 2),
        duration: customDuration,
        radius,
        dissipationDistance,
      });
      customPulseRef.current.current = performance.now();
    }),
  });

  paramsRef.current = {
    kickStrength,
    direction,
    radius,
    dissipationDistance,
    cameraSpace,
    customShape,
    customDuration,
  };

  return (
    <>
      <GroundClutter boxes={groundBoxes} />
      {sources.map(({ position, color }, i) => (
        <ExplosionMarker key={color} position={position} color={color} pulseRef={pulseRefs.current[i]} />
      ))}
      <ExplosionMarker position={customPosition} color={customColor} pulseRef={customPulseRef.current} />

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
