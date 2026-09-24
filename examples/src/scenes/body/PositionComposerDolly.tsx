import { Body, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { folder, useControls } from 'leva';
import { useRef, type RefObject } from 'react';
import { DoubleSide, Euler, Mesh, Quaternion, Vector3 } from 'three';
import { GroundClutter } from '../../scene/GroundClutter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const cameraHeight = 2;
const cameraPosition: [number, number, number] = [0, cameraHeight, 10];
const cameraQuaternion = new Quaternion().setFromEuler(new Euler(0, 0, 0));
const depthRange = 5;
const targetRadius = 0.6;

const scratchForward = new Vector3();

function Target({
  meshRef,
  autoMove,
  manualZ,
}: {
  meshRef: RefObject<Mesh | null>;
  autoMove: boolean;
  manualZ: number;
}) {
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.position.z = autoMove ? Math.sin(clock.elapsedTime * 0.6) * depthRange : manualZ;
  });

  return (
    <mesh ref={meshRef} position={[0, cameraHeight, 0]}>
      <sphereGeometry args={[targetRadius, 16, 16]} />
      <meshStandardMaterial color="#ff6b4a" emissive="#ff6b4a" emissiveIntensity={0.4} />
    </mesh>
  );
}

/** Marks `cameraDistance ± depthDeadZone`, since `debug` only draws the screen-space zones. */
function DepthZoneRings({ cameraDistance, depthDeadZone }: { cameraDistance: number; depthDeadZone: number }) {
  const nearRef = useRef<Mesh>(null);
  const farRef = useRef<Mesh>(null);

  useFrame(({ camera }) => {
    scratchForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    if (nearRef.current) {
      nearRef.current.position.copy(camera.position).addScaledVector(scratchForward, cameraDistance - depthDeadZone);
      nearRef.current.quaternion.copy(camera.quaternion);
    }
    if (farRef.current) {
      farRef.current.position.copy(camera.position).addScaledVector(scratchForward, cameraDistance + depthDeadZone);
      farRef.current.quaternion.copy(camera.quaternion);
    }
  });

  if (depthDeadZone <= 0) return null;
  return (
    <>
      <mesh ref={nearRef}>
        <ringGeometry args={[1.6, 1.75, 32]} />
        <meshBasicMaterial color="#7ed957" transparent opacity={0.6} side={DoubleSide} />
      </mesh>
      <mesh ref={farRef}>
        <ringGeometry args={[1.6, 1.75, 32]} />
        <meshBasicMaterial color="#ffd23f" transparent opacity={0.6} side={DoubleSide} />
      </mesh>
    </>
  );
}

export function PositionComposerDolly() {
  const targetRef = useRef<Mesh>(null);

  const { autoMove, manualZ, cameraDistance, depthDeadZone, damping, debug } = useControls('PositionComposer: Dolly', {
    Motion: folder({
      autoMove: true,
      manualZ: { value: 0, min: -depthRange, max: depthRange, step: 0.1 },
    }),
    cameraDistance: { value: 10, min: 6, max: 16, step: 0.5 },
    depthDeadZone: { value: 1.5, min: 0, max: 4, step: 0.1 },
    damping: { value: 0.6, min: 0, max: 3, step: 0.05 },
    debug: true,
  });

  return (
    <>
      <GroundClutter layout="dolly" />
      <Target meshRef={targetRef} autoMove={autoMove} manualZ={manualZ} />
      {debug && <DepthZoneRings cameraDistance={cameraDistance} depthDeadZone={depthDeadZone} />}

      <Klipp>
        <VirtualCamera
          name="position-composer-dolly-demo"
          priority={10}
          initialState={{ position: cameraPosition, quaternion: cameraQuaternion }}>
          <Body.PositionComposer
            target={targetRef}
            radius={targetRadius}
            cameraDistance={cameraDistance}
            depthDeadZone={depthDeadZone}
            damping={damping}
          />
          <SpectatorFrustum maxDistance={cameraDistance + depthRange + 4} />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
