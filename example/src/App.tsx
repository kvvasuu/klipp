import { BindingModes, BlendCurves, BlendHints, impulseManager, type BindingMode } from '@kvvasuu/klipp';
import { Aim, Body, CameraFrustumHelper, Extension, Klipp, Noise, VirtualCamera } from '@kvvasuu/klipp/react';
import { CameraControls } from '@kvvasuu/klipp/react/camera-controls';
import { Stats } from '@react-three/drei';
import { Canvas, invalidate, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Group, Matrix4, Mesh, Quaternion, Vector3, type Object3D } from 'three';
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

function TargetExtentZigzag({ targetRef }: { targetRef: RefObject<Mesh | null> }) {
  useFrame((state) => {
    const target = targetRef.current;
    if (!target) return;
    const t = state.clock.elapsedTime;
    target.position.set(Math.sin(t * 1.2) * 15, 2, -6);
    target.rotation.y = t * 0.6; // tumbles, so "size" mode exercises the rotated-box math, not just axis-aligned
    state.invalidate();
  });
  return (
    <mesh ref={targetRef}>
      <boxGeometry args={[3, 3, 3]} />
      <meshStandardMaterial color="tomato" />
    </mesh>
  );
}

type TargetExtentMode = 'point' | 'radius' | 'size';

/** Same box mesh in every mode - only how PositionComposer measures its extent changes. "Point" passes
 *  radius={0} to force the old center-only behavior for comparison (otherwise a Mesh target auto-detects
 *  its own size); "Size" leaves radius/size unset, letting that auto-detection take over.
 */
function TargetExtentScene({ mode }: { mode: TargetExtentMode }) {
  const targetRef = useRef<Mesh>(null);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} />
      <gridHelper args={[24, 24, '#444', '#222']} position={[0, 0.01, 0]} />

      <TargetExtentZigzag targetRef={targetRef} />

      <Klipp>
        <VirtualCamera name="targetExtent-demo" active={true} priority={10}>
          <Body.PositionComposer
            target={targetRef}
            deadZone={[0.4, 0.4]}
            damping={0.2}
            radius={mode === 'point' ? 0 : mode === 'radius' ? 2 : undefined}
          />
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
    invalidate();
  });
  return (
    <mesh ref={targetRef}>
      <sphereGeometry args={[0.4, 16, 16]} />
      <meshStandardMaterial color="tomato" />
    </mesh>
  );
}

type OrbitalActiveCamera = 'orbital' | 'overview';

/** Stress-tests `CameraControls`: a moving target, priority-switching to a second camera and back,
 *  and `freeMode` dropping `target` for full free `camera-controls`. */
function OrbitalScene({ activeCamera, freeMode }: { activeCamera: OrbitalActiveCamera; freeMode: boolean }) {
  const targetRef = useRef<Object3D>(null);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} />
      <gridHelper args={[24, 24, '#444', '#222']} position={[0, 0.01, 0]} />

      <OrbitingBall targetRef={targetRef} />

      <Klipp defaultBlend={{ damping: 0.8 }}>
        <VirtualCamera
          name="orbital-cam"
          active={true}
          priority={activeCamera === 'orbital' ? 20 : 10}
          hints={BlendHints.cylindricalPosition}>
          <CameraControls
            target={freeMode ? undefined : targetRef}
            initialPosition={[6, 4, 6]}
            enableTransition={true}
          />
          <CameraFrustumHelper color="lime" />
        </VirtualCamera>
        <VirtualCamera
          name="overview-cam"
          active={true}
          priority={activeCamera === 'overview' ? 20 : 10}
          hints={BlendHints.cylindricalPosition}>
          <Body.HardLockToTarget target={[10, 8, 10]} />
          <Aim.HardLookAt target={targetRef} />
          <CameraFrustumHelper color="lime" />
        </VirtualCamera>
      </Klipp>
    </>
  );
}

const orbitalTakeoverPlayerStart: [number, number, number] = [0, 1, 0];
const orbitalTakeoverIntroPosition: [number, number, number] = [-2, 2, -3];

function OrbitalTakeoverPlayer({ playerRef }: { playerRef: RefObject<Object3D | null> }) {
  useFrame(({ clock }) => {
    const player = playerRef.current;
    if (!player) return;
    const t = clock.elapsedTime;
    player.position.set(Math.sin(t * 0.3) * 4, 1, Math.cos(t * 0.3) * 4);
    invalidate();
  });
  return (
    <mesh ref={playerRef} position={orbitalTakeoverPlayerStart}>
      <capsuleGeometry args={[0.4, 1, 4, 8]} />
      <meshStandardMaterial color="steelblue" />
    </mesh>
  );
}

type OrbitalTakeoverMode = 'intro' | 'follow' | 'free';

/** Fixed intro shot -> `CameraControls` takeover via the `active`-prop toggle. "Free Control" reuses
 *  the same `<VirtualCamera>`, just dropping `target` to `undefined` instead of spawning a third one.
 */
function OrbitalTakeoverScene({ mode, enableTransition }: { mode: OrbitalTakeoverMode; enableTransition: boolean }) {
  const playerRef = useRef<Object3D>(null);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} />
      <gridHelper args={[24, 24, '#444', '#222']} position={[0, 0.01, 0]} />

      <OrbitalTakeoverPlayer playerRef={playerRef} />

      <Klipp defaultBlend={{ damping: 0.5 }}>
        <VirtualCamera name="intro" active={mode === 'intro'} priority={2} hints={BlendHints.cylindricalPosition}>
          <Body.HardLockToTarget target={orbitalTakeoverIntroPosition} />
          <Aim.HardLookAt target={orbitalTakeoverPlayerStart} />
          <CameraFrustumHelper color="lime" />
        </VirtualCamera>
        <VirtualCamera name="follow" active={mode !== 'intro'} priority={3} hints={BlendHints.cylindricalPosition}>
          <CameraControls
            target={mode === 'follow' ? playerRef : undefined}
            initialPosition={orbitalTakeoverIntroPosition}
            enableTransition={enableTransition}
          />
          <CameraFrustumHelper color="orange" />
        </VirtualCamera>
        <VirtualCamera name="free" active={mode === 'free'} priority={4} hints={BlendHints.cylindricalPosition}>
          <CameraControls
            target={undefined}
            initialPosition={orbitalTakeoverIntroPosition}
            enableTransition={enableTransition}
            waitForBlend={false}
          />
          <CameraFrustumHelper color="red" />
        </VirtualCamera>
      </Klipp>
    </>
  );
}

type BlendHintsActiveCamera = 'a' | 'b';
type BlendHintsPositionMode = 'none' | 'spherical' | 'cylindrical';

/**
 * Two cameras `HardLookAt`-ing DIFFERENT points, blending between them. Rotation tracks the smoothly-
 * interpolating look-at target exactly, unconditionally - unless `ignoreTarget` opts out, falling back to
 * a plain slerp between the two cameras' own rotations instead. The position mode is independent: it only
 * shapes the POSITION path, arcing around Body's (shared) tracking target instead of cutting straight
 * through - `spherical` and `cylindrical` differ once the two offsets sit at different heights: cylindrical
 * lerps that height linearly, spherical folds it into the arc's own radius/polar angle instead.
 */
function BlendHintsScene({
  activeCamera,
  positionMode,
  useIgnoreTargetHint,
}: {
  activeCamera: BlendHintsActiveCamera;
  positionMode: BlendHintsPositionMode;
  useIgnoreTargetHint: boolean;
}) {
  const hints =
    (positionMode === 'spherical' ? BlendHints.sphericalPosition : BlendHints.none) |
    (positionMode === 'cylindrical' ? BlendHints.cylindricalPosition : BlendHints.none) |
    (useIgnoreTargetHint ? BlendHints.ignoreTarget : BlendHints.none);

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
 * outranks "manual-orbit" (`CameraControls`, the default view). Esc returns to "manual-orbit",
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
        <VirtualCamera name="manual-orbit" active={!focusActive} priority={5} hints={BlendHints.cylindricalPosition}>
          <CameraControls target={focusBoxCenter} initialPosition={[6, 3, 6]} />
        </VirtualCamera>
        <VirtualCamera name="focus" active={focusActive} priority={20} hints={BlendHints.cylindricalPosition}>
          <Body.HardLockToTarget target={focusPosition} damping={0.5} />
          <Aim.RotationComposer target={focusLookAt} damping={0.5} />
        </VirtualCamera>
      </Klipp>
    </>
  );
}

type LookAtPopTarget = 'A' | 'B';

/** A and B differ in both position and look-at on purpose — the bigger the gap, the more obvious any pop. */
const lookAtPopConfigs: Record<
  LookAtPopTarget,
  { position: [number, number, number]; lookAt: [number, number, number] }
> = {
  A: { position: [-6, 3, 7], lookAt: [-6, 1, 0] },
  B: { position: [6, 1, -4], lookAt: [6, 5, 1] },
};

function LookAtPopMarker({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.4, 16, 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
    </mesh>
  );
}

/** Reports the running max of the real camera's frame-to-frame rotation, turning "looks like it pops" into
 *  degrees. `resetToken` clears it WITHOUT remounting — resetting by `key` would tear down `<Klipp>`'s core
 *  and every camera's state too, which mid-blend is itself a snap, and looks just like the bug. */
function LookAtJumpMeter({ onJump, resetToken }: { onJump: (deg: number) => void; resetToken: number }) {
  const { camera } = useThree();
  const prevQuaternion = useRef(new Quaternion());
  const hasPrev = useRef(false);
  const maxJumpDeg = useRef(0);

  useEffect(() => {
    maxJumpDeg.current = 0;
    hasPrev.current = false; // whatever gap the reset itself spans isn't a frame-to-frame delta
  }, [resetToken]);

  useFrame(() => {
    if (hasPrev.current) {
      const deg = (prevQuaternion.current.angleTo(camera.quaternion) * 180) / Math.PI;
      if (deg > maxJumpDeg.current) {
        maxJumpDeg.current = deg;
        onJump(deg);
      }
    }
    prevQuaternion.current.copy(camera.quaternion);
    hasPrev.current = true;
  });

  return null;
}

/**
 * Retargeting a damped `RotationComposer` camera mid-blend. `default`'s `Aim.HardLookAt` sets
 * `hasLookAtTarget`, so this blend goes through `lerpLookAtRotation`.
 *
 * Every path here (focus A alone, retarget after the blend settles, retarget DURING it, reverse back to
 * `default` mid-blend) should move the camera continuously; any sudden step on the meter is a bug.
 */
function LookAtBlendPopScene({
  focusTarget,
  onJump,
  meterResetToken,
}: {
  focusTarget: LookAtPopTarget | null;
  onJump: (deg: number) => void;
  meterResetToken: number;
}) {
  const focusPosition = useRef(new Vector3()).current;
  const focusLookAt = useRef(new Vector3()).current;

  useEffect(() => {
    if (!focusTarget) return;
    const config = lookAtPopConfigs[focusTarget];
    focusPosition.set(...config.position);
    focusLookAt.set(...config.lookAt);
    // same rule as FocusReproScene's handleBoxClick — a retarget while already active mutates these in
    // place, with no prop change for VirtualCamera to react to
    invalidate();
  }, [focusTarget, focusPosition, focusLookAt]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} />
      <gridHelper args={[30, 30, '#444', '#222']} position={[0, 0.01, 0]} />

      <LookAtPopMarker position={lookAtPopConfigs.A.lookAt} color="#3399ff" />
      <LookAtPopMarker position={lookAtPopConfigs.B.lookAt} color="#ff6633" />

      <LookAtJumpMeter onJump={onJump} resetToken={meterResetToken} />

      {/* mirrors the real app: defaultBlend only, no customBlends */}
      <Klipp defaultBlend={{ damping: 0.5 }}>
        <VirtualCamera name="default" active={!focusTarget} priority={10}>
          <Body.Follow target={[0, 0, 0]} offset={[0, 4, 16]} damping={0} />
          <Aim.HardLookAt target={[0, 0, 0]} />
        </VirtualCamera>
        <VirtualCamera name="focused" active={!!focusTarget} priority={100}>
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

const initialStateTopdownEye = new Vector3(0, 15, 0);
const initialStateTopdownLookAt = new Vector3(0, 0, 0);
// straight down is parallel to the usual (0,1,0) world-up reference — needs a horizontal one instead
const initialStateTopdownUp = new Vector3(0, 0, -1);
const initialStateTopdownQuaternion = new Quaternion().setFromRotationMatrix(
  new Matrix4().lookAt(initialStateTopdownEye, initialStateTopdownLookAt, initialStateTopdownUp),
);

function InitialStatePlayer({ playerRef }: { playerRef: RefObject<Object3D | null> }) {
  useFrame(({ clock }) => {
    const player = playerRef.current;
    if (!player) return;
    const t = clock.elapsedTime;
    player.position.set(Math.sin(t * 0.4) * 5, 1, Math.cos(t * 0.4) * 5);
    invalidate();
  });
  return (
    <mesh ref={playerRef}>
      <capsuleGeometry args={[0.4, 1, 4, 8]} />
      <meshStandardMaterial color="steelblue" />
    </mesh>
  );
}

type InitialStateMode = 'follow' | 'topdown';

/**
 * "topdown" starts out mounted but inactive — without `initialState` its `PositionComposer` inherits
 * whatever rotation the real camera happened to have at `<Canvas>` mount (dead level, facing -Z) and
 * dollies along THAT axis instead of straight down, so its first activation blends into a flat, sideways
 * shot instead of an overhead one. `initialState` seeds a proper top-down pose so the very first frame
 * already dollies the right way. The seeded/unseeded toggle remounts "topdown" (via `key`) to actually
 * re-run that first-activation moment — `initialState` only applies once, at mount.
 */
function InitialStateScene({ mode, seeded }: { mode: InitialStateMode; seeded: boolean }) {
  const playerRef = useRef<Object3D>(null);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} />
      <gridHelper args={[24, 24, '#444', '#222']} position={[0, 0.01, 0]} />

      <InitialStatePlayer playerRef={playerRef} />

      <Klipp defaultBlend={{ curve: BlendCurves.linear, time: 1 }}>
        <VirtualCamera name="initialState-follow" active={mode === 'follow'} priority={10}>
          <Body.Follow target={playerRef} offset={[0, 3, 8]} damping={0} />
          <Aim.HardLookAt target={playerRef} />
        </VirtualCamera>
        <VirtualCamera
          key={seeded ? 'seeded' : 'unseeded'}
          name="initialState-topdown"
          active={mode === 'topdown'}
          priority={20}
          initialState={
            seeded
              ? { position: initialStateTopdownEye, quaternion: initialStateTopdownQuaternion, fov: 80 }
              : undefined
          }>
          <Body.PositionComposer target={playerRef} cameraDistance={15} deadZone={[0.4, 0.4]} />
          <Aim.HardLookAt target={playerRef} />
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
  | 'orbitalTakeover'
  | 'blendHints'
  | 'focusRepro'
  | 'lookAtPop'
  | 'groupFraming'
  | 'reactivationSnap'
  | 'initialState'
  | 'targetExtent'
  | 'capstone';

function App() {
  const [demo, setDemo] = useState<Demo>('offset');
  const [bindingMode, setBindingMode] = useState<BindingMode>(BindingModes.lockToTargetWithWorldUp);
  const [aimMode, setAimMode] = useState<AimMode>('lookAt');
  const [hardLimitEnabled, setHardLimitEnabled] = useState(false);
  const [noisePreset, setNoisePreset] = useState<NoisePreset>('subtle');
  const [orbitalActiveCamera, setOrbitalActiveCamera] = useState<OrbitalActiveCamera>('orbital');
  const [orbitalFreeMode, setOrbitalFreeMode] = useState(false);
  const [orbitalTakeoverMode, setOrbitalTakeoverMode] = useState<OrbitalTakeoverMode>('intro');
  const [orbitalTakeoverEnableTransition, setOrbitalTakeoverEnableTransition] = useState(false);
  const [blendHintsActiveCamera, setBlendHintsActiveCamera] = useState<BlendHintsActiveCamera>('a');
  const [blendHintsPositionMode, setBlendHintsPositionMode] = useState<BlendHintsPositionMode>('none');
  const [blendHintsUseIgnoreTargetHint, setBlendHintsUseIgnoreTargetHint] = useState(false);
  const [boxSize, setBoxSize] = useState(2);
  const [padding, setPadding] = useState(0.5);
  const [reactivationTarget, setReactivationTarget] = useState<'A' | 'B'>('A');
  const [reactivationCameraActive, setReactivationCameraActive] = useState(true);
  const [initialStateMode, setInitialStateMode] = useState<InitialStateMode>('follow');
  const [initialStateSeeded, setInitialStateSeeded] = useState(false);
  const [targetExtentMode, setTargetExtentMode] = useState<TargetExtentMode>('point');
  const [lookAtPopFocus, setLookAtPopFocus] = useState<LookAtPopTarget | null>(null);
  const [lookAtPopMaxJumpDeg, setLookAtPopMaxJumpDeg] = useState(0);
  const [lookAtPopMeterKey, setLookAtPopMeterKey] = useState(0);

  function resetLookAtPop() {
    setLookAtPopFocus(null);
    setLookAtPopMaxJumpDeg(0);
    setLookAtPopMeterKey((k) => k + 1);
  }

  function runLookAtPopAutoRepro() {
    resetLookAtPop();
    // let the focus clear commit before starting the A→B-mid-blend sequence
    requestAnimationFrame(() => {
      setLookAtPopFocus('A');
      window.setTimeout(() => setLookAtPopFocus('B'), 150);
    });
  }

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
        <button data-active={demo === 'orbitalTakeover'} onClick={() => setDemo('orbitalTakeover')}>
          Orbital Takeover
        </button>
        <button data-active={demo === 'blendHints'} onClick={() => setDemo('blendHints')}>
          Blend Hints
        </button>
        <button data-active={demo === 'focusRepro'} onClick={() => setDemo('focusRepro')}>
          Click to Zoom
        </button>
        <button data-active={demo === 'lookAtPop'} onClick={() => setDemo('lookAtPop')}>
          LookAt Blend Pop
        </button>
        <button data-active={demo === 'groupFraming'} onClick={() => setDemo('groupFraming')}>
          Group Framing
        </button>
        <button data-active={demo === 'reactivationSnap'} onClick={() => setDemo('reactivationSnap')}>
          Reactivation Snap
        </button>
        <button data-active={demo === 'initialState'} onClick={() => setDemo('initialState')}>
          Initial State
        </button>
        <button data-active={demo === 'targetExtent'} onClick={() => setDemo('targetExtent')}>
          Target Extent
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
            <button data-active={orbitalFreeMode} onClick={() => setOrbitalFreeMode((v) => !v)}>
              {orbitalFreeMode ? 'target: none - free camera-controls' : 'target: ball - locked orbit/dolly'}
            </button>
          </>
        )}
        {demo === 'orbitalTakeover' && (
          <>
            <button data-active={orbitalTakeoverMode === 'intro'} onClick={() => setOrbitalTakeoverMode('intro')}>
              Back to Intro
            </button>
            <button data-active={orbitalTakeoverMode === 'follow'} onClick={() => setOrbitalTakeoverMode('follow')}>
              Start Game
            </button>
            <button data-active={orbitalTakeoverMode === 'free'} onClick={() => setOrbitalTakeoverMode('free')}>
              Free Control
            </button>
            <button
              data-active={orbitalTakeoverEnableTransition}
              onClick={() => setOrbitalTakeoverEnableTransition((v) => !v)}>
              {orbitalTakeoverEnableTransition
                ? 'enableTransition: on - eased'
                : 'enableTransition: off - instant re-anchor'}
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
            <button data-active={blendHintsPositionMode === 'none'} onClick={() => setBlendHintsPositionMode('none')}>
              position: straight line
            </button>
            <button
              data-active={blendHintsPositionMode === 'spherical'}
              onClick={() => setBlendHintsPositionMode('spherical')}>
              position: sphericalPosition
            </button>
            <button
              data-active={blendHintsPositionMode === 'cylindrical'}
              onClick={() => setBlendHintsPositionMode('cylindrical')}>
              position: cylindricalPosition
            </button>
            <button
              data-active={blendHintsUseIgnoreTargetHint}
              onClick={() => setBlendHintsUseIgnoreTargetHint((v) => !v)}>
              {blendHintsUseIgnoreTargetHint ? 'ignoreTarget: on - plain slerp' : 'ignoreTarget: off - tracks look-at'}
            </button>
          </>
        )}
        {demo === 'lookAtPop' && (
          <>
            <button data-active={lookAtPopFocus === 'A'} onClick={() => setLookAtPopFocus('A')}>
              Focus A
            </button>
            <button data-active={lookAtPopFocus === 'B'} onClick={() => setLookAtPopFocus('B')}>
              Focus B
            </button>
            <button data-active={lookAtPopFocus === null} onClick={() => setLookAtPopFocus(null)}>
              Back to default
            </button>
            <button onClick={runLookAtPopAutoRepro}>⚡ Auto repro: A → B mid-blend</button>
            <button onClick={resetLookAtPop}>Reset meter</button>
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
        {demo === 'initialState' && (
          <>
            <button data-active={initialStateMode === 'follow'} onClick={() => setInitialStateMode('follow')}>
              Camera: Follow
            </button>
            <button data-active={initialStateMode === 'topdown'} onClick={() => setInitialStateMode('topdown')}>
              Camera: Topdown (fresh activation)
            </button>
            <button data-active={initialStateSeeded} onClick={() => setInitialStateSeeded((v) => !v)}>
              {initialStateSeeded ? 'initialState: seeded' : 'initialState: off — wrong axis on activation'}
            </button>
          </>
        )}
        {demo === 'targetExtent' && (
          <>
            <button data-active={targetExtentMode === 'point'} onClick={() => setTargetExtentMode('point')}>
              Point (radius=0, ignores real size)
            </button>
            <button data-active={targetExtentMode === 'radius'} onClick={() => setTargetExtentMode('radius')}>
              Radius (sphere approx.)
            </button>
            <button data-active={targetExtentMode === 'size'} onClick={() => setTargetExtentMode('size')}>
              Size (auto-detected from Mesh)
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
          {demo === 'orbital' && <OrbitalScene activeCamera={orbitalActiveCamera} freeMode={orbitalFreeMode} />}
          {demo === 'orbitalTakeover' && (
            <OrbitalTakeoverScene mode={orbitalTakeoverMode} enableTransition={orbitalTakeoverEnableTransition} />
          )}
          {demo === 'blendHints' && (
            <BlendHintsScene
              activeCamera={blendHintsActiveCamera}
              positionMode={blendHintsPositionMode}
              useIgnoreTargetHint={blendHintsUseIgnoreTargetHint}
            />
          )}
          {demo === 'focusRepro' && <FocusReproScene />}
          {demo === 'lookAtPop' && (
            <LookAtBlendPopScene
              focusTarget={lookAtPopFocus}
              onJump={setLookAtPopMaxJumpDeg}
              meterResetToken={lookAtPopMeterKey}
            />
          )}
          {demo === 'groupFraming' && <GroupFramingScene boxSize={boxSize} padding={padding} />}
          {demo === 'reactivationSnap' && (
            <ReactivationSnapScene targetKey={reactivationTarget} cameraActive={reactivationCameraActive} />
          )}
          {demo === 'initialState' && <InitialStateScene mode={initialStateMode} seeded={initialStateSeeded} />}
          {demo === 'targetExtent' && <TargetExtentScene mode={targetExtentMode} />}
        </Canvas>
      )}
      {demo === 'offset' && (
        <p className="hint-text">
          bindingMode (Body) and Aim are independent: bindingMode only moves the camera's orbit position, never its own
          tilt. Switch Aim to "Glued" to see the camera's ROTATION lock to the target too.
        </p>
      )}
      {demo === 'orbital' && (
        <p className="hint-text">
          Drag/scroll to orbit and dolly. Switch Camera to "Overview" and back - "Orbital" resumes exactly where you
          left it, unaffected by nothing happening while it wasn't showing. Toggle target to drop it entirely - full
          free camera-controls, orbit AND pan AND dolly, nothing locked, same as a bare drei &lt;CameraControls&gt;.
        </p>
      )}
      {demo === 'orbitalTakeover' && (
        <p className="hint-text">
          The real-game pattern: a fixed intro shot ("intro", HardLockToTarget), then "Start Game" activates "follow"
          (CameraControls locked onto the player) via the `active`-prop TOGGLE - "intro" fully unregisters, its Body/Aim
          stop running. `initialPosition` matches "intro"'s own spot, so the handoff cuts smoothly instead of jumping.
          Once live, drag/scroll to orbit/dolly around the player - panning away snaps back, target stays locked. "Free
          Control" doesn't spawn a new camera or blend anything - it just drops `target` to `undefined` on the SAME rig,
          staying exactly where it was: full free camera-controls (orbit AND pan AND dolly) from that spot. "Back to
          Intro" re-activates the fixed shot, blending back from wherever "follow"/"free" left off. Pan away in "Free
          Control", then hit "Start Game" - `enableTransition` (camera-controls' own argument, instant by default)
          toggles whether re-acquiring the player eases in (`smoothTime`) or re-anchors instantly.
        </p>
      )}
      {demo === 'blendHints' && (
        <p className="hint-text">
          Camera A and B look at two DIFFERENT points. With ignoreTarget off (default), rotation tracks the smoothly-
          sliding look-at target throughout the blend, staying framed. Toggle ignoreTarget to fall back to a plain slerp
          between the two cameras' own rotations instead - the subject drifts out of frame mid-blend. The position
          buttons (independent of ignoreTarget) compare the camera's own PATH: straight line cuts through,
          sphericalPosition/cylindricalPosition arc around Body's shared tracking target instead - the two only differ
          once the offsets sit at different heights, since cylindricalPosition lerps that height linearly while
          sphericalPosition folds it into the arc itself.
        </p>
      )}
      {demo === 'focusRepro' && (
        <p className="hint-text">Click the box to zoom in. Esc — back to the orbital camera.</p>
      )}
      {demo === 'lookAtPop' && (
        <p className="hint-text">
          Max single-frame rotation jump this run: <strong>{lookAtPopMaxJumpDeg.toFixed(1)}°</strong>. "Auto repro" (or
          Focus A then Focus B by hand, fast) changes the focus target while the default→focused blend is STILL running
          — the case that used to snap. The number should only ever climb gradually, as the shot accelerates; a sudden
          step means a damped Aim is publishing a look-at target its own rotation hasn't reached yet, and the blend is
          reading that gap as a camera-wide offset.
        </p>
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
      {demo === 'initialState' && (
        <p className="hint-text">
          "Topdown" sits inactive until you switch to it — a fresh runtime activation, not the app's first-ever camera.
          Turn "initialState" off, switch to "Follow", then to "Topdown": PositionComposer dollies along whatever
          rotation the canvas started with (flat, sideways), not straight down. Turn "initialState" on (this remounts
          "Topdown" to re-run its first activation) and switch again — it starts from a proper overhead pose instead.
        </p>
      )}
      {demo === 'targetExtent' && (
        <p className="hint-text">
          Same tumbling box in every mode - only how PositionComposer measures its extent changes. "Point" treats it as
          a dimensionless center (radius=0), so the box visibly leaves the dead zone box before the camera reacts.
          "Radius" and "Size" react to its nearest EDGE instead - "Size" auto-detects the box's own rotated geometry, so
          it tracks tightly no matter how the box is tumbling.
        </p>
      )}
    </>
  );
}

export default App;
