import { BindingModes, BlendCurves, BlendHints, impulseManager, type BindingMode } from '@kvvasuu/klipp';
import { Aim, Body, CameraFrustumHelper, Extension, Klipp, Noise, VirtualCamera } from '@kvvasuu/klipp/react';
import { OrbitalControls } from '@kvvasuu/klipp/react/body/orbital-controls';
import { Stats } from '@react-three/drei';
import { Canvas, invalidate, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Group, Mesh, Vector3, type Object3D } from 'three';
import './App.css';
import { CapstoneScene } from './CapstoneScene';

const headOffset = new Vector3(0, 1.3, 0);

function SpinningCharacter({ groupRef }: { groupRef: RefObject<Group | null> }) {
  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const t = clock.elapsedTime;
    group.position.set(Math.sin(t * 0.5) * 6, 2, Math.cos(t * 0.5) * 6);
    // yaw — the axis the roll-stripped bindingModes actually track; a pure roll around the local
    // forward axis alone leaves the forward vector (and so the derived offset rotation) unchanged,
    // which made every mode but lockToTarget look identical to worldSpace
    group.rotation.y = t * 0.5;
    group.rotation.z = Math.sin(t * 1.2) * 1.0; // roll — only lockToTarget (full rotation) follows this
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

type AimMode = 'lookAt' | 'glued';

/**
 * Body and Aim are fully independent — this demo has two orthogonal selectors to make that concrete on
 * the SAME character/offset. `bindingMode` is entirely `Body.Follow`'s concern: which rotation (if any)
 * the position OFFSET is rotated by — it never touches the camera's own orientation.
 *
 * The Aim toggle controls that separately: `HardLookAt` always independently re-aims at the target from
 * wherever the camera currently sits (world-up-referenced, so the camera itself stays dead level no
 * matter what `bindingMode` does to its position). `RotateWithFollowTarget` instead mirrors the target's
 * rotation directly onto the camera — genuinely "glued like a child" (position AND orientation both
 * locked to the target's transform) — it doesn't even look at where the camera IS, so with this offset
 * (in front of the character) the camera ends up facing the SAME way the character faces, i.e. away from
 * it: a first-person-ish view from just ahead of its head, not a chase cam. That mismatch is the point —
 * it's what "Aim never checks Body's result" actually means in practice.
 */
function TargetOffsetScene({ bindingMode, aimMode }: { bindingMode: BindingMode; aimMode: AimMode }) {
  const groupRef = useRef<Group>(null);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} />
      <gridHelper args={[24, 24, '#444', '#222']} position={[0, 0.01, 0]} />

      <SpinningCharacter groupRef={groupRef} />

      <Klipp defaultBlend={{ damping: 0.8 }}>
        <VirtualCamera name="targetOffset-demo" active={true} priority={10}>
          <Body.Follow target={groupRef} offset={[0, 1, 5]} damping={0} bindingMode={bindingMode} />
          {aimMode === 'lookAt' ? (
            <Aim.HardLookAt target={groupRef} />
          ) : (
            <Aim.RotateWithFollowTarget target={groupRef} />
          )}
        </VirtualCamera>
      </Klipp>
    </>
  );
}

function ZigzagTarget({ targetRef }: { targetRef: RefObject<Object3D | null> }) {
  useFrame((state) => {
    const target = targetRef.current;
    if (!target) return;
    const t = state.clock.elapsedTime;
    target.position.set(Math.sin(t * 1.5) * 15, 2, -6);
    // imperative position mutation, not a reactive prop — frameloop="demand" won't schedule the next
    // frame on its own, so this has to ask for it every time it moves
    state.invalidate();
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
          <Body.PositionComposer target={targetRef} deadZone={[0.4, 0.4]} damping={0.2} hardLimit={hardLimit} />
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
    radius: 10,
    dissipationDistance: 10,
    attackTime: 0.1,
    sustainTime: 0.05,
    decayTime: 0.5,
  });
  // impulseManager is a plain, React-agnostic registry (by design) — generate() alone touches no
  // reactive state, so frameloop="demand" would never schedule a frame to sample the shake at all
  invalidate();
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

      <Klipp defaultBlend={{ damping: 0.8 }}>
        <VirtualCamera name="orbital-cam" active={true} priority={activeCamera === 'orbital' ? 20 : 10}>
          <OrbitalControls target={targetRef} initialDistance={8} />
          <CameraFrustumHelper color="lime" />
        </VirtualCamera>
        <VirtualCamera name="overview-cam" active={true} priority={activeCamera === 'overview' ? 20 : 10}>
          <Body.HardLockToTarget target={[10, 8, 10]} />
          <Aim.HardLookAt target={targetRef} />
          <CameraFrustumHelper color="lime" />
        </VirtualCamera>
      </Klipp>
    </>
  );
}

type BlendHintsActiveCamera = 'a' | 'b';

/**
 * Two cameras `HardLookAt`-ing DIFFERENT points, blending between them. Rotation always tracks the
 * smoothly-interpolating look-at target exactly - unconditional whenever both sides have one, not gated
 * behind `sphericalPosition`. The hint only shapes the POSITION path: arcing around Body's tracking
 * target at an interpolated radius instead of cutting straight through.
 */
function BlendHintsScene({
  activeCamera,
  useSphericalHint,
}: {
  activeCamera: BlendHintsActiveCamera;
  useSphericalHint: boolean;
}) {
  const hints = useSphericalHint ? BlendHints.sphericalPosition : BlendHints.none;

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} />
      <gridHelper args={[24, 24, '#444', '#222']} position={[0, 0.01, 0]} />

      <mesh>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial color="tomato" />
      </mesh>

      <Klipp defaultBlend={{ curve: BlendCurves.linear, time: 2 }}>
        <VirtualCamera name="blendHints-a" active={activeCamera === 'a'} priority={10} hints={hints}>
          <Body.Follow target={[5, 5, 5]} offset={[3, 0, 0]} />
          <Aim.HardLookAt target={[0, 0, 0]} />
          <CameraFrustumHelper color="lime" hideWhenLive={false} />
        </VirtualCamera>
        <VirtualCamera name="blendHints-b" active={activeCamera === 'b'} priority={20} hints={hints}>
          <Body.Follow target={[5, 5, 5]} offset={[-10, 0, -5]} />
          <Aim.RotationComposer target={[0, 0, 0]} damping={0.4} />
          <CameraFrustumHelper color="orange" hideWhenLive={false} />
        </VirtualCamera>
      </Klipp>
    </>
  );
}

const focusBoxCenter: [number, number, number] = [0, 1, 0];
const focusBoxSize: [number, number, number] = [2, 2, 2];

function FocusBox({ onBoxClick }: { onBoxClick: (point: Vector3) => void }) {
  return (
    <mesh
      position={focusBoxCenter}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onBoxClick(e.point);
      }}>
      <boxGeometry args={focusBoxSize} />
      <meshStandardMaterial color="steelblue" />
    </mesh>
  );
}

const reactivationTargets: Record<'A' | 'B', [number, number, number]> = {
  A: [-10, 1, -3],
  B: [10, 1, 6],
};

/** Marker for one of ReactivationSnapScene's two candidate targets — brighter/larger when it's the one
 *  currently being tracked, so it's obvious at a glance which target is "live" right now. */
function ReactivationMarker({ position, active }: { position: [number, number, number]; active: boolean }) {
  return (
    <mesh position={position} scale={active ? 1 : 0.6}>
      <sphereGeometry args={[0.6, 16, 16]} />
      <meshStandardMaterial color={active ? '#ffcc33' : '#555'} emissive={active ? '#996600' : '#000000'} />
    </mesh>
  );
}

/**
 * Purpose-built smoke test for `justActivated` (the "snap fresh on active:false→true" fix, see
 * `CameraStateWriter`'s doc comment) — deliberately adversarial: two targets far enough apart that any
 * leftover easing from a stale position is obviously visible, damping slow enough (1.5s) to make a
 * snap-vs-ease difference unmistakable. Position uses `Follow` (a single Vector3Damper end to end) rather
 * than `PositionComposer` on purpose — the latter's stage-1 dolly is always instant/undamped by design,
 * which would read as "jump, then only the lateral part eases" for the active-retarget case below,
 * muddying what this scene is actually testing. `RotationComposer`'s `deadZone` still covers the
 * dead-zone-skip path on the rotation side — `FocusReproScene`'s `RotationComposer` (`deadZone=[0,0]`
 * default) never touches it.
 *
 * Test procedure: with the camera ACTIVE, switch targets — it EASES (damping working normally, the
 * regression case that must keep working). Deactivate, switch targets while INACTIVE (the view freezes —
 * nothing reacts, no wasted work), then reactivate — the camera should SNAP straight onto the new target
 * instantly, never swinging through wherever it was left off.
 */
function ReactivationSnapScene({ targetKey, cameraActive }: { targetKey: 'A' | 'B'; cameraActive: boolean }) {
  const targetPosition = reactivationTargets[targetKey];

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} />
      <gridHelper args={[40, 40, '#444', '#222']} position={[0, 0.01, 0]} />

      <ReactivationMarker position={reactivationTargets.A} active={targetKey === 'A'} />
      <ReactivationMarker position={reactivationTargets.B} active={targetKey === 'B'} />

      <Klipp>
        <VirtualCamera name="reactivation-tester" active={cameraActive} priority={10}>
          {/* Follow, not PositionComposer: a single Vector3Damper end to end, so an active-camera retarget
              (the regression case) reads as one clean ease — PositionComposer's stage-1 dolly is always
              instant/undamped by design, which would show as "jump, then the lateral part eases in",
              muddying what this scene is actually testing (unrelated to justActivated). */}
          <Body.Follow target={targetPosition} offset={[0, 5, 16]} damping={1.5} />
          <Aim.RotationComposer target={targetPosition} deadZone={[0.2, 0.2]} damping={1.5} />
        </VirtualCamera>
      </Klipp>
    </>
  );
}

/**
 * Click-to-zoom repro: clicking the box pulls the camera back 0.5 units from the clicked point along the
 * (current-camera → point) direction and looks straight at that point, as a second `<VirtualCamera>` that
 * outranks "manual-orbit" (`Body.OrbitalControls`, the default view). Esc returns to "manual-orbit",
 * which keeps tracking any drag/scroll input the whole time it wasn't showing.
 */
function FocusReproScene() {
  const { camera, invalidate } = useThree();
  const [focusActive, setFocusActive] = useState(false);
  const focusPosition = useRef(new Vector3()).current;
  const focusLookAt = useRef(new Vector3()).current;
  const dirScratch = useRef(new Vector3()).current;

  function handleBoxClick(point: Vector3) {
    dirScratch.subVectors(camera.position, point).normalize();
    focusPosition.copy(point).addScaledVector(dirScratch, 0.5);
    focusLookAt.copy(point);
    setFocusActive(true);
    // unconditional, not just on the false→true edge: retargeting while ALREADY on "focus" mutates
    // focusPosition/focusLookAt in place with no prop/active change for VirtualCamera to react to, so
    // its own invalidate() (on activation) never fires for this click — same rule as ZigzagTarget/
    // triggerExplosion, just triggered from a click handler instead of useFrame
    invalidate();
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setFocusActive(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} />
      <gridHelper args={[24, 24, '#444', '#222']} position={[0, 0.01, 0]} />

      <FocusBox onBoxClick={handleBoxClick} />

      <Klipp
        customBlends={[
          { from: 'manual-orbit', to: 'focus', blend: { damping: 0.5 } },
          { from: 'focus', to: 'manual-orbit', blend: { curve: BlendCurves.easeInOut, time: 1 } },
        ]}>
        <VirtualCamera name="manual-orbit" active={!focusActive} priority={5}>
          <OrbitalControls target={focusBoxCenter} initialDistance={8} />
        </VirtualCamera>
        <VirtualCamera name="focus" active={focusActive} priority={20}>
          <Body.HardLockToTarget target={focusPosition} damping={0.5} />
          <Aim.RotationComposer target={focusLookAt} damping={0.5} />
        </VirtualCamera>
      </Klipp>
    </>
  );
}

/**
 * A box that never overflows the frame as it grows (slider) or the canvas resizes — `Extension.GroupFraming`
 * dollies back only as far as needed, so shrinking the box doesn't pull the camera back in.
 */
function GroupFramingScene({ boxSize, padding }: { boxSize: number; padding: number }) {
  const boxRef = useRef<Mesh>(null);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} />
      <gridHelper args={[24, 24, '#444', '#222']} position={[0, 0.01, 0]} />

      <mesh ref={boxRef} position={[0, boxSize / 2, 0]}>
        <boxGeometry args={[boxSize, boxSize, boxSize]} />
        <meshStandardMaterial color="steelblue" />
      </mesh>

      <Klipp defaultBlend={{ damping: 0.8 }}>
        <VirtualCamera name="groupFraming-demo" active={true} priority={10}>
          <Body.Follow target={boxRef} offset={[0, 2, 5]} damping={0} />
          <Aim.HardLookAt target={boxRef} />
          <Extension.GroupFraming members={[{ target: boxRef }]} padding={padding} damping={0.5} />
        </VirtualCamera>
      </Klipp>
    </>
  );
}

type Demo =
  | 'offset'
  | 'hardLimit'
  | 'noise'
  | 'explosion'
  | 'orbital'
  | 'blendHints'
  | 'focusRepro'
  | 'groupFraming'
  | 'reactivationSnap'
  | 'capstone';

function App() {
  const [demo, setDemo] = useState<Demo>('offset');
  const [bindingMode, setBindingMode] = useState<BindingMode>(BindingModes.lockToTargetWithWorldUp);
  const [aimMode, setAimMode] = useState<AimMode>('lookAt');
  const [hardLimitEnabled, setHardLimitEnabled] = useState(false);
  const [noisePreset, setNoisePreset] = useState<NoisePreset>('subtle');
  const [orbitalActiveCamera, setOrbitalActiveCamera] = useState<OrbitalActiveCamera>('orbital');
  const [blendHintsActiveCamera, setBlendHintsActiveCamera] = useState<BlendHintsActiveCamera>('a');
  const [blendHintsUseSphericalHint, setBlendHintsUseSphericalHint] = useState(false);
  const [boxSize, setBoxSize] = useState(2);
  const [padding, setPadding] = useState(0.5);
  const [reactivationTarget, setReactivationTarget] = useState<'A' | 'B'>('A');
  const [reactivationCameraActive, setReactivationCameraActive] = useState(true);

  return (
    <>
      <a
        href="vanilla/"
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 10,
          color: '#fff',
          font: '14px sans-serif',
          background: 'rgba(0, 0, 0, 0.5)',
          padding: '6px 10px',
          borderRadius: 4,
        }}>
        Vanilla (no React) example →
      </a>
      <div className="preset-bar">
        <button data-active={demo === 'offset'} onClick={() => setDemo('offset')}>
          Follow Offset
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
          Orbital Controls
        </button>
        <button data-active={demo === 'blendHints'} onClick={() => setDemo('blendHints')}>
          Blend Hints
        </button>
        <button data-active={demo === 'focusRepro'} onClick={() => setDemo('focusRepro')}>
          Click to Zoom
        </button>
        <button data-active={demo === 'groupFraming'} onClick={() => setDemo('groupFraming')}>
          Group Framing
        </button>
        <button data-active={demo === 'reactivationSnap'} onClick={() => setDemo('reactivationSnap')}>
          Reactivation Snap
        </button>
        {demo === 'offset' &&
          (
            [
              [BindingModes.lockToTarget, 'Lock To Target'],
              [BindingModes.lockToTargetWithWorldUp, 'World Up'],
              [BindingModes.worldSpace, 'World Space'],
            ] as const
          ).map(([mode, label]) => (
            <button key={mode} data-active={bindingMode === mode} onClick={() => setBindingMode(mode)}>
              {label}
            </button>
          ))}
        {demo === 'offset' && (
          <>
            <button data-active={aimMode === 'lookAt'} onClick={() => setAimMode('lookAt')}>
              Aim: Look At
            </button>
            <button data-active={aimMode === 'glued'} onClick={() => setAimMode('glued')}>
              Aim: Glued (child-like)
            </button>
          </>
        )}
        {demo === 'hardLimit' && (
          <button data-active={hardLimitEnabled} onClick={() => setHardLimitEnabled((v) => !v)}>
            {hardLimitEnabled ? 'hardLimit: on' : 'hardLimit: off — target drifts out of frame'}
          </button>
        )}
        {demo === 'noise' && (
          <>
            <button data-active={noisePreset === 'off'} onClick={() => setNoisePreset('off')}>
              Noise: off
            </button>
            <button data-active={noisePreset === 'subtle'} onClick={() => setNoisePreset('subtle')}>
              Noise: subtle
            </button>
            <button data-active={noisePreset === 'heavy'} onClick={() => setNoisePreset('heavy')}>
              Noise: heavy
            </button>
          </>
        )}
        {demo === 'explosion' && <button onClick={triggerExplosion}>💥 Explode!</button>}
        {demo === 'orbital' && (
          <>
            <button data-active={orbitalActiveCamera === 'orbital'} onClick={() => setOrbitalActiveCamera('orbital')}>
              Camera: Orbital
            </button>
            <button data-active={orbitalActiveCamera === 'overview'} onClick={() => setOrbitalActiveCamera('overview')}>
              Camera: Overview
            </button>
          </>
        )}
        {demo === 'blendHints' && (
          <>
            <button data-active={blendHintsActiveCamera === 'a'} onClick={() => setBlendHintsActiveCamera('a')}>
              Camera A (5,5,5)
            </button>
            <button data-active={blendHintsActiveCamera === 'b'} onClick={() => setBlendHintsActiveCamera('b')}>
              Camera B (-5,0,2)
            </button>
            <button data-active={blendHintsUseSphericalHint} onClick={() => setBlendHintsUseSphericalHint((v) => !v)}>
              {blendHintsUseSphericalHint ? 'sphericalPosition: on' : 'sphericalPosition: off - straight line'}
            </button>
          </>
        )}
        {demo === 'groupFraming' && (
          <>
            <label>
              Box size: {boxSize.toFixed(1)}
              <input
                type="range"
                min={0.5}
                max={8}
                step={0.01}
                value={boxSize}
                onChange={(e) => setBoxSize(Number(e.target.value))}
              />
            </label>
            <label>
              Padding: {padding.toFixed(2)} units
              <input
                type="range"
                min={0}
                max={4}
                step={0.05}
                value={padding}
                onChange={(e) => setPadding(Number(e.target.value))}
              />
            </label>
          </>
        )}
        {demo === 'reactivationSnap' && (
          <>
            <button data-active={reactivationCameraActive} onClick={() => setReactivationCameraActive((v) => !v)}>
              Camera: {reactivationCameraActive ? 'active' : 'inactive'}
            </button>
            <button data-active={reactivationTarget === 'A'} onClick={() => setReactivationTarget('A')}>
              Target A
            </button>
            <button data-active={reactivationTarget === 'B'} onClick={() => setReactivationTarget('B')}>
              Target B
            </button>
          </>
        )}
      </div>
      {demo === 'capstone' ? (
        <CapstoneScene />
      ) : (
        <Canvas frameloop="demand" camera={{ position: [0, 1, 10], fov: 50 }}>
          <Stats />

          {demo === 'offset' && <TargetOffsetScene bindingMode={bindingMode} aimMode={aimMode} />}
          {demo === 'hardLimit' && <HardLimitScene hardLimitEnabled={hardLimitEnabled} />}
          {demo === 'noise' && <NoiseScene preset={noisePreset} />}
          {demo === 'explosion' && <ExplosionScene />}
          {demo === 'orbital' && <OrbitalScene activeCamera={orbitalActiveCamera} />}
          {demo === 'blendHints' && (
            <BlendHintsScene activeCamera={blendHintsActiveCamera} useSphericalHint={blendHintsUseSphericalHint} />
          )}
          {demo === 'focusRepro' && <FocusReproScene />}
          {demo === 'groupFraming' && <GroupFramingScene boxSize={boxSize} padding={padding} />}
          {demo === 'reactivationSnap' && (
            <ReactivationSnapScene targetKey={reactivationTarget} cameraActive={reactivationCameraActive} />
          )}
        </Canvas>
      )}
      {demo === 'offset' && (
        <p className="hint-text">
          bindingMode (Body) and Aim are independent: bindingMode only moves the camera's orbit position, never its own
          tilt. Switch Aim to "Glued" to see the camera's ROTATION lock to the target too.
        </p>
      )}
      {demo === 'blendHints' && (
        <p className="hint-text">
          Camera A and B look at two DIFFERENT points - the look-at target itself smoothly slides between them during
          the blend, staying framed either way, unconditionally. Toggle sphericalPosition to compare the camera's own
          PATH: off cuts straight through, on arcs around Body's tracking target at an interpolated radius instead.
        </p>
      )}
      {demo === 'focusRepro' && (
        <p className="hint-text">Click the box to zoom in. Esc — back to the orbital camera.</p>
      )}
      {demo === 'groupFraming' && (
        <p className="hint-text">Resize the box with the slider, or resize the browser window.</p>
      )}
      {demo === 'reactivationSnap' && (
        <p className="hint-text">
          Active: change target — the camera blends smoothly. Deactivate, change target, reactivate — the camera should
          snap straight to the new target, with no flythrough of the old spot.
        </p>
      )}
    </>
  );
}

export default App;
