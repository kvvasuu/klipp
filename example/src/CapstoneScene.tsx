import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Aim, Body, Extension, Klipp, VirtualCamera } from '@kvvasuu/klipp';
import { useRef, useState, type RefObject } from 'react';
import { Vector3, type Object3D } from 'three';

type GameState = 'menu' | 'playing';
type Interaction = 'none' | 'chest' | 'npc' | 'pedestal';

// capsuleGeometry(radius=0.4, length=0.8) — its poles sit 0.4 (half the cylindrical length) + 0.4 (the
// cap radius) from center, which IS the capsule's own bounding-sphere radius
const characterBoundingRadius = 0.8;

function Ground({ onGroundClick }: { onGroundClick: (point: Vector3) => void }) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onGroundClick(e.point);
      }}>
      <planeGeometry args={[60, 60]} />
      <meshStandardMaterial color="#60ac60" />
    </mesh>
  );
}

/** Placeholder for the real model the user will drop in later (Sketchfab CC0 / self-modeled). Walks
 *  toward `moveTarget` in a straight line — no pathfinding, this is a camera demo, not a game. */
function Character({
  characterRef,
  moveTarget,
}: {
  characterRef: RefObject<Object3D | null>;
  moveTarget: RefObject<Vector3>;
}) {
  useFrame((_state, dt) => {
    const character = characterRef.current;
    if (!character) return;
    const target = moveTarget.current;
    const dx = target.x - character.position.x;
    const dz = target.z - character.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.05) return;

    const speed = 4;
    const step = Math.min(distance, speed * dt);
    character.position.x += (dx / distance) * step;
    character.position.z += (dz / distance) * step;
    character.rotation.y = Math.atan2(dx, dz);
  });

  return (
    <mesh ref={characterRef} position={[0, 0.6, 0]}>
      <capsuleGeometry args={[0.4, 0.8, 4, 8]} />
      <meshStandardMaterial color="steelblue" />
    </mesh>
  );
}

/**
 * Capstone demo — a Diablo-style top-down scene tying together most of klipp's systems in one flow:
 * a main-menu → gameplay camera hand-off, a dead-zone-based follow camera reacting to click-to-move,
 * and (in later steps) interactive props for Impulse, ambient Noise, and OrbitalControls. Placeholder
 * primitives throughout — real models are a follow-up, this pass is about the camera/interaction logic.
 */
export function CapstoneScene() {
  const characterRef = useRef<Object3D>(null);
  const moveTargetRef = useRef(new Vector3(0, 0, 0));
  const [gameState, setGameState] = useState<GameState>('menu');
  const [interaction] = useState<Interaction>('none'); // grows in later steps (chest/npc/pedestal)

  function handleGroundClick(point: Vector3) {
    if (gameState !== 'playing' || interaction !== 'none') return;
    moveTargetRef.current.set(point.x, 0, point.z);
  }

  return (
    <>
      <Canvas camera={{ position: [0, 5, 10], fov: 50 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 10, 3]} intensity={1.2} />

        <Ground onGroundClick={handleGroundClick} />
        <Character characterRef={characterRef} moveTarget={moveTargetRef} />

        <Klipp>
          <VirtualCamera name="menu-shot" active={gameState === 'menu'} priority={10}>
            <Body.HardLockToTarget target={[0, 1.6, 6]} />
            <Aim.HardLookAt target={characterRef} />
            {/* the fixed [0, 1.6, 6] above only sets the VIEWING ANGLE now — GroupFraming replaces its
                implied distance with one that actually fits the character with padding, robust to
                whatever size window this menu shot happens to render at */}
            <Extension.GroupFraming
              members={[{ target: characterRef, radius: characterBoundingRadius }]}
              paddingPixels={80}
              damping={0.5}
            />
          </VirtualCamera>
          <VirtualCamera
            name="gameplay-topdown"
            active={gameState === 'playing' && interaction === 'none'}
            priority={20}>
            <Body.Follow target={characterRef} offset={[0, 11, 8]} damping={0.4} bindingMode="worldSpace" />
            <Aim.RotationComposer target={characterRef} deadZone={[0.8, 0.8]} damping={0.5} />
          </VirtualCamera>
        </Klipp>
      </Canvas>

      {gameState === 'menu' && (
        <div className="menu-overlay">
          <h1>klipp capstone</h1>
          <p>Click the ground to move once you're in.</p>
          <button onClick={() => setGameState('playing')}>Start</button>
        </div>
      )}
    </>
  );
}
