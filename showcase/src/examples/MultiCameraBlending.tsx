import { Canvas, useFrame } from '@react-three/fiber';
import { Aim, Body, Klipp, VirtualCamera } from 'klipp';
import { useRef, useState, type RefObject } from 'react';
import type { Object3D } from 'three';

type CameraId = 'close-follow' | 'wide-overview' | 'low-angle';

const cameraButtons: { id: CameraId; label: string }[] = [
  { id: 'close-follow', label: 'Close Follow' },
  { id: 'wide-overview', label: 'Wide Overview' },
  { id: 'low-angle', label: 'Low Angle' },
];

function OrbitingTarget({ targetRef }: { targetRef: RefObject<Object3D | null> }) {
  useFrame(({ clock }) => {
    const target = targetRef.current;
    if (!target) return;
    const t = clock.elapsedTime;
    target.position.set(Math.sin(t * 0.4) * 5, 1 + Math.sin(t * 0.7), Math.cos(t * 0.4) * 5);
  });
  return (
    <mesh ref={targetRef}>
      <sphereGeometry args={[0.4, 16, 16]} />
      <meshStandardMaterial color="tomato" />
    </mesh>
  );
}

function Scene({ activeCamera }: { activeCamera: CameraId }) {
  const targetRef = useRef<Object3D>(null);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} />
      <gridHelper args={[24, 24, '#444', '#222']} position={[0, 0.01, 0]} />

      <OrbitingTarget targetRef={targetRef} />

      <Klipp>
        <VirtualCamera name="close-follow" active={activeCamera === 'close-follow'} priority={10}>
          <Body.Follow target={targetRef} offset={[0, 1, 3]} damping={0.3} />
          <Aim.HardLookAt target={targetRef} />
        </VirtualCamera>
        <VirtualCamera name="wide-overview" active={activeCamera === 'wide-overview'} priority={20}>
          <Body.HardLockToTarget target={[14, 10, 14]} damping={0.3} />
          <Aim.HardLookAt target={targetRef} />
        </VirtualCamera>
        <VirtualCamera name="low-angle" active={activeCamera === 'low-angle'} priority={30}>
          <Body.Follow target={targetRef} offset={[3, -0.3, 1]} damping={0.3} />
          <Aim.HardLookAt target={targetRef} />
        </VirtualCamera>
      </Klipp>
    </>
  );
}

/**
 * The core klipp pitch: mount several `<VirtualCamera>`s with different framings and let priority pick
 * the winner — switching is just a number changing, klipp's own blend handles the transition.
 */
export function MultiCameraBlending() {
  const [activeCamera, setActiveCamera] = useState<CameraId>('close-follow');

  return (
    <>
      <Canvas camera={{ position: [0, 5, -10], fov: 50 }}>
        <Scene activeCamera={activeCamera} />
      </Canvas>
      <div className="overlay">
        {cameraButtons.map(({ id, label }) => (
          <button key={id} data-active={activeCamera === id} onClick={() => setActiveCamera(id)}>
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
