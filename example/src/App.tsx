import { Canvas, useFrame } from '@react-three/fiber';
import { Aim, Body, Klipp, Noise, VirtualCamera, impulseManager } from 'klipp';
import { OrbitalControls } from 'klipp/body/orbital-controls';
import { useRef, useState, type RefObject } from 'react';
import { Group, Vector3, type Object3D } from 'three';
import './App.css';

const headOffset = new Vector3(0, 1.3, 0);

function SpinningCharacter({ groupRef }: { groupRef: RefObject<Group | null> }) {
  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const t = clock.elapsedTime;
    group.position.set(Math.sin(t * 0.5) * 6, 2, Math.cos(t * 0.5) * 6);
    group.rotation.z = Math.sin(t * 1.2) * 1.0; // roll — sweeps the head offset side to side
  });
  return (
    <group ref={groupRef}>
      <mesh>
        <boxGeometry args={[0.8, 1.4, 0.8]} />
        <meshStandardMaterial color="steelblue" />
      </mesh>
      <mesh position={headOffset}>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshStandardMaterial color="orange" />
      </mesh>
    </group>
  );
}

/** Marker at the EXACT world point RotationComposer is aiming at — computed the same way the Aim itself
 *  does (offset rotated INTO the target's local space), so it visibly follows the roll instead of
 *  staying at a fixed world offset. */
function LookAtMarker({ targetRef, offsetEnabled }: { targetRef: RefObject<Object3D | null>; offsetEnabled: boolean }) {
  const markerRef = useRef<Object3D>(null);
  const worldOffset = useRef(new Vector3()).current;

  useFrame(() => {
    const target = targetRef.current;
    const marker = markerRef.current;
    if (!target || !marker) return;
    marker.position.copy(target.position);
    if (offsetEnabled) {
      worldOffset.copy(headOffset).applyQuaternion(target.quaternion);
      marker.position.add(worldOffset);
    }
  });

  return (
    <mesh ref={markerRef}>
      <sphereGeometry args={[0.15, 12, 12]} />
      <meshBasicMaterial color="lime" />
    </mesh>
  );
}

function TargetOffsetScene({ offsetEnabled }: { offsetEnabled: boolean }) {
  const groupRef = useRef<Group>(null);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} />
      <gridHelper args={[24, 24, '#444', '#222']} position={[0, 0.01, 0]} />

      <SpinningCharacter groupRef={groupRef} />
      <LookAtMarker targetRef={groupRef} offsetEnabled={offsetEnabled} />

      <Klipp>
        <VirtualCamera name="targetOffset-demo" active={true} priority={10}>
          <Body.Follow target={groupRef} offset={[0, 4, 4]} damping={0} bindingMode="lockToTargetWithWorldUp" />
          <Aim.HardLookAt target={groupRef} />
          <Noise.BasicMultiChannelPerlin
            positionAmplitude={1}
            rotationAmplitude={1}
            rotationFrequency={10}
            amplitudeDamping={1}
            amplitudeGain={1}
          />
        </VirtualCamera>
      </Klipp>
    </>
  );
}

function ZigzagTarget({ targetRef }: { targetRef: RefObject<Object3D | null> }) {
  useFrame(({ clock }) => {
    const target = targetRef.current;
    if (!target) return;
    const t = clock.elapsedTime;
    target.position.set(Math.sin(t * 2.2) * 15, 2, -6);
  });
  return (
    <mesh ref={targetRef}>
      <sphereGeometry args={[0.4, 16, 16]} />
      <meshStandardMaterial color="tomato" />
    </mesh>
  );
}

function HardLimitScene({ hardLimitEnabled }: { hardLimitEnabled: boolean }) {
  const targetRef = useRef<Object3D>(null);
  const hardLimit: [number, number] = hardLimitEnabled ? [0.6, 0.6] : [0, 0];

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} />
      <gridHelper args={[24, 24, '#444', '#222']} position={[0, 0.01, 0]} />

      <ZigzagTarget targetRef={targetRef} />

      <Klipp>
        {/* Heavy damping alone would let a fast zigzagging target lag arbitrarily far off-center;
            hardLimit forces it back inside its (wider) box every frame it strays past that, undamped. */}
        <VirtualCamera name="hardLimit-demo" active={true} priority={10}>
          <Body.PositionComposer target={targetRef} deadZone={[0.4, 0.4]} damping={0.3} hardLimit={hardLimit} />
          {/* <Aim.RotationComposer target={targetRef} deadZone={[0.1, 0.1]} damping={4} hardLimit={hardLimit} /> */}
        </VirtualCamera>
      </Klipp>
    </>
  );
}

type NoisePreset = 'off' | 'subtle' | 'heavy';

const noisePresets: Record<
  NoisePreset,
  { positionAmplitude: [number, number, number]; rotationAmplitude: [number, number, number] }
> = {
  off: { positionAmplitude: [0, 0, 0], rotationAmplitude: [0, 0, 0] },
  subtle: { positionAmplitude: [0.05, 0.05, 0.05], rotationAmplitude: [0.5, 0.5, 0.5] },
  heavy: { positionAmplitude: [0.4, 0.4, 0.4], rotationAmplitude: [4, 4, 4] },
};

function NoiseScene({ preset }: { preset: NoisePreset }) {
  const boxRef = useRef<Object3D>(null);
  const { positionAmplitude, rotationAmplitude } = noisePresets[preset];

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} />
      <gridHelper args={[24, 24, '#444', '#222']} position={[0, 0.01, 0]} />
      <mesh ref={boxRef} position={[0, 0.5, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="steelblue" />
      </mesh>

      <Klipp>
        {/* Static Body (Follow with a fixed Vector3 target = no rotation to react to) + HardLookAt, so
            the ONLY thing moving the camera at all is Noise — isolates the shake for visual inspection. */}
        <VirtualCamera name="noise-demo" active={true} priority={10}>
          <Body.Follow target={[0, 0.5, 0]} offset={[0, 3, 8]} damping={0} />
          <Aim.HardLookAt target={boxRef} />
          <Noise.BasicMultiChannelPerlin
            amplitudeDamping={1}
            positionAmplitude={positionAmplitude}
            rotationAmplitude={rotationAmplitude}
          />
        </VirtualCamera>
      </Klipp>
    </>
  );
}

const explosionPosition: [number, number, number] = [0, 0, 0];

function triggerExplosion() {
  impulseManager.generate({
    position: explosionPosition,
    direction: [0.5, 1.2, 2],
    radius: 0,
    dissipationDistance: 10,
    attackTime: 0.1,
    sustainTime: 0.05,
    decayTime: 0.5,
  });
}

/**
 * One-shot camera shake using `Noise.ImpulseListener` + `impulseManager.generate(...)`. Unlike a plain
 * Noise amplitude spike, this is a genuine world-space event: it has a POSITION (the explosion site) and
 * dissipates with distance, so a camera further from the blast shakes less — try moving
 * `explosionPosition` far from the box to see the falloff.
 */
function ExplosionScene() {
  const boxRef = useRef<Object3D>(null);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} />
      <gridHelper args={[24, 24, '#444', '#222']} position={[0, 0.01, 0]} />
      <mesh ref={boxRef} position={[0, 0.5, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="steelblue" />
      </mesh>

      <Klipp>
        <VirtualCamera name="explosion-demo" active={true} priority={10}>
          <Body.Follow target={[0, 0.5, 0]} offset={[0, 3, 8]} damping={0} />
          <Aim.HardLookAt target={boxRef} />
          <Noise.ImpulseListener />
        </VirtualCamera>
      </Klipp>
    </>
  );
}

function OrbitingBall({ targetRef }: { targetRef: RefObject<Object3D | null> }) {
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

type OrbitalActiveCamera = 'orbital' | 'overview';

/**
 * Two scenarios stress-testing `OrbitalControls` at once: (1) `target` is a continuously moving object,
 * tracked every frame while `camera-controls` also handles live drag/scroll input on top. (2) Two
 * `<VirtualCamera>`s, switchable by priority — `overview-cam` (fixed `HardLockToTarget` + `HardLookAt`)
 * vs `orbital-cam`. Drag around while on "Overview", then switch back to "Orbital" — it should resume
 * exactly where it left off, unaffected by input that landed while it wasn't showing.
 */
function OrbitalScene({ activeCamera }: { activeCamera: OrbitalActiveCamera }) {
  const targetRef = useRef<Object3D>(null);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} />
      <gridHelper args={[24, 24, '#444', '#222']} position={[0, 0.01, 0]} />

      <OrbitingBall targetRef={targetRef} />

      <Klipp>
        <VirtualCamera name="orbital-cam" active={true} priority={activeCamera === 'orbital' ? 20 : 10}>
          <OrbitalControls target={targetRef} initialDistance={8} />
          <Noise.BasicMultiChannelPerlin
            positionAmplitude={0.2}
            rotationAmplitude={0.2}
            positionFrequency={2}
            rotationFrequency={2}
          />
        </VirtualCamera>
        <VirtualCamera name="overview-cam" active={true} priority={activeCamera === 'overview' ? 20 : 10}>
          <Body.HardLockToTarget target={[10, 8, 10]} />
          <Aim.HardLookAt target={targetRef} />
        </VirtualCamera>
      </Klipp>
    </>
  );
}

type Demo = 'offset' | 'hardLimit' | 'noise' | 'explosion' | 'orbital';

function App() {
  const [demo, setDemo] = useState<Demo>('offset');
  const [offsetEnabled, setOffsetEnabled] = useState(false);
  const [hardLimitEnabled, setHardLimitEnabled] = useState(false);
  const [noisePreset, setNoisePreset] = useState<NoisePreset>('off');
  const [orbitalActiveCamera, setOrbitalActiveCamera] = useState<OrbitalActiveCamera>('orbital');

  return (
    <>
      <div className="preset-bar">
        <button data-active={demo === 'offset'} onClick={() => setDemo('offset')}>
          Target Offset
        </button>
        <button data-active={demo === 'hardLimit'} onClick={() => setDemo('hardLimit')}>
          Hard Limit
        </button>
        <button data-active={demo === 'noise'} onClick={() => setDemo('noise')}>
          Noise
        </button>
        <button data-active={demo === 'explosion'} onClick={() => setDemo('explosion')}>
          Explosion
        </button>
        <button data-active={demo === 'orbital'} onClick={() => setDemo('orbital')}>
          Orbital
        </button>
        {demo === 'offset' && (
          <button data-active={offsetEnabled} onClick={() => setOffsetEnabled((v) => !v)}>
            {offsetEnabled ? 'targetOffset: głowa (zielony marker)' : 'targetOffset: origin (wyłączony)'}
          </button>
        )}
        {demo === 'hardLimit' && (
          <button data-active={hardLimitEnabled} onClick={() => setHardLimitEnabled((v) => !v)}>
            {hardLimitEnabled ? 'hardLimit: włączony' : 'hardLimit: wyłączony — target ucieka z kadru'}
          </button>
        )}
        {demo === 'noise' && (
          <>
            <button data-active={noisePreset === 'off'} onClick={() => setNoisePreset('off')}>
              Noise: wyłączony
            </button>
            <button data-active={noisePreset === 'subtle'} onClick={() => setNoisePreset('subtle')}>
              Noise: subtelny
            </button>
            <button data-active={noisePreset === 'heavy'} onClick={() => setNoisePreset('heavy')}>
              Noise: mocny
            </button>
          </>
        )}
        {demo === 'explosion' && <button onClick={triggerExplosion}>💥 Wybuch!</button>}
        {demo === 'orbital' && (
          <>
            <button data-active={orbitalActiveCamera === 'orbital'} onClick={() => setOrbitalActiveCamera('orbital')}>
              Kamera: Orbital
            </button>
            <button data-active={orbitalActiveCamera === 'overview'} onClick={() => setOrbitalActiveCamera('overview')}>
              Kamera: Overview
            </button>
          </>
        )}
      </div>
      <Canvas camera={{ position: [0, 5, 10], fov: 50 }}>
        {demo === 'offset' && <TargetOffsetScene offsetEnabled={offsetEnabled} />}
        {demo === 'hardLimit' && <HardLimitScene hardLimitEnabled={hardLimitEnabled} />}
        {demo === 'noise' && <NoiseScene preset={noisePreset} />}
        {demo === 'explosion' && <ExplosionScene />}
        {demo === 'orbital' && <OrbitalScene activeCamera={orbitalActiveCamera} />}
      </Canvas>
    </>
  );
}

export default App;
