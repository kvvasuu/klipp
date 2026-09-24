import { useFrame } from '@react-three/fiber';
import { useRef, type RefObject } from 'react';
import type { Mesh } from 'three';

export const orbiterLoopRadius = 6;
const baseAngularSpeed = 0.5;
const speedVariation = 0.6;
const speedOscFreq = 0.4;
const bobAmplitude = 1.5;
const bobFreq = 0.9;
const baseHeight = 2.2;

/** A ball looping around the origin at a varying speed, with a vertical bob. */
export function Orbiter({ ref }: { ref: RefObject<Mesh | null> }) {
  const angleRef = useRef(0);

  useFrame(({ clock }, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    angleRef.current += baseAngularSpeed * (1 + speedVariation * Math.sin(t * speedOscFreq)) * delta;
    mesh.position.set(
      Math.cos(angleRef.current) * orbiterLoopRadius,
      baseHeight + Math.sin(t * bobFreq) * bobAmplitude,
      Math.sin(angleRef.current) * orbiterLoopRadius,
    );
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.5, 16, 16]} />
      <meshStandardMaterial color="#7ed957" emissive="#7ed957" emissiveIntensity={0.4} />
    </mesh>
  );
}
