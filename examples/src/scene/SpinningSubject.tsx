import { useFrame } from '@react-three/fiber';
import { useRef, type ReactNode, type RefObject } from 'react';
import type { Mesh } from 'three';

/** A slowly spinning mesh for cameras to frame. Pass a geometry as `children` to change its shape. */
export function SpinningSubject({
  ref,
  position,
  color = '#ffd23f',
  children = <icosahedronGeometry args={[1, 0]} />,
}: {
  ref?: RefObject<Mesh | null>;
  position: [number, number, number];
  color?: string;
  children?: ReactNode;
}) {
  const localRef = useRef<Mesh>(null);
  const meshRef = ref ?? localRef;

  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.3;
  });

  return (
    <mesh ref={meshRef} position={position}>
      {children}
      <meshStandardMaterial color={color} />
    </mesh>
  );
}
