import { Extension, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { folder, useControls } from 'leva';
import { Euler, Quaternion } from 'three';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const cameraPosition: [number, number, number] = [0, 1.5, 5];
const cameraQuaternion = new Quaternion().setFromEuler(new Euler(0, 0, 0));
const nearObjectPosition: [number, number, number] = [0, 1.5, 3.2];

const tunnelRingCount = 12;
const tunnelSpacing = 6;
const tunnelStartZ = -2;
const tunnelColors = ['#21a9e0', '#ff6b4a'];
const tunnelRings = Array.from({ length: tunnelRingCount }, (_, i) => ({
  color: tunnelColors[i % tunnelColors.length],
  position: [0, 1.5, tunnelStartZ - i * tunnelSpacing] as const,
}));

function Tunnel() {
  return (
    <>
      {tunnelRings.map(({ color, position }, i) => (
        <mesh key={i} position={position}>
          <torusGeometry args={[2.5, 0.15, 12, 32]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
        </mesh>
      ))}
    </>
  );
}

/** No Body/Aim - `initialState` fixes the camera in place, and `Extension.Lens` is the only thing touching
 *  fov/near/far from there. The near sphere and the ring tunnel exist purely to make clipping visible:
 *  push `near` past ~1.8 to clip the sphere, pull `far` below the tunnel's far end to clip rings one by
 *  one, and swing `fov` to see the same tunnel stretch or compress. */
export function Lens() {
  const { fov, near, far, fovDamping, nearDamping, farDamping } = useControls('Lens', {
    fov: { value: 50, min: 10, max: 160, step: 1 },
    near: { value: 1, min: 0.05, max: 3, step: 0.05 },
    far: { value: 40, min: 5, max: 100, step: 1 },
    Damping: folder({
      fovDamping: { value: 0.5, min: 0, max: 2, step: 0.05 },
      nearDamping: { value: 0.5, min: 0, max: 2, step: 0.05 },
      farDamping: { value: 0.5, min: 0, max: 2, step: 0.05 },
    }),
  });

  return (
    <>
      <mesh position={nearObjectPosition}>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial color="#ffd23f" emissive="#ffd23f" emissiveIntensity={0.4} />
      </mesh>
      <Tunnel />

      <Klipp>
        <VirtualCamera
          name="lens-demo"
          priority={10}
          initialState={{ position: cameraPosition, quaternion: cameraQuaternion }}>
          <Extension.Lens
            fov={fov}
            near={near}
            far={far}
            fovDamping={fovDamping}
            nearDamping={nearDamping}
            farDamping={farDamping}
          />
          <SpectatorFrustum maxDistance={far} />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
