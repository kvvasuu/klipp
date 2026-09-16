import { BindingModes, BlendHints, BlendCurves as Curves, type Ease } from '@kvvasuu/klipp';
import { CameraFrustumHelper, Follow, HardLookAt, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { button, useControls } from 'leva';
import { useRef, type RefObject } from 'react';
import { Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { CanvasOverlay } from '../../scene/CanvasOverlay';
import { GroundClutter, type GroundBox } from '../../scene/GroundClutter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const subjectPosition: [number, number, number] = [0, 1.5, 0];
const secondSubjectPosition: [number, number, number] = [6, 1.2, 1];

const curveOptions = ['cut', 'linear', 'easeInOut', 'easeIn', 'easeOut', 'hardIn', 'hardOut'] as const;
type CurveName = (typeof curveOptions)[number];

const cameraNames = ['shot-wide', 'shot-close', 'shot-high', 'shot-alt-a', 'shot-alt-b'] as const;
type CameraName = (typeof cameraNames)[number];

const lookMatrix = new Matrix4();

/** Matches `HardLookAt`'s own math - a plain `Object3D.lookAt()` would orient a camera 180° backwards. */
function lookAtQuaternion(position: [number, number, number], target: [number, number, number]): Quaternion {
  lookMatrix.lookAt(new Vector3(...position), new Vector3(...target), new Vector3(0, 1, 0));
  return new Quaternion().setFromRotationMatrix(lookMatrix);
}

function addOffset(base: [number, number, number], offset: [number, number, number]): [number, number, number] {
  return [base[0] + offset[0], base[1] + offset[1], base[2] + offset[2]];
}

/** Reused below to seed `initialState`, so a camera's `CameraFrustumHelper` shows its real pose even
 *  before it's ever been picked - `active={false}` means its Follow/HardLookAt haven't ticked yet. */
const shotWideOffset: [number, number, number] = [0, 2.5, 10];
const shotWidePosition = addOffset(subjectPosition, shotWideOffset);
const shotWideQuaternion = lookAtQuaternion(shotWidePosition, subjectPosition);

const shotCloseOffset: [number, number, number] = [3, 0.5, 3];
const shotClosePosition = addOffset(subjectPosition, shotCloseOffset);
const shotCloseQuaternion = lookAtQuaternion(shotClosePosition, subjectPosition);

const shotHighOffset: [number, number, number] = [-4, 4.5, -3];
const shotHighPosition = addOffset(subjectPosition, shotHighOffset);
const shotHighQuaternion = lookAtQuaternion(shotHighPosition, subjectPosition);

const shotAltAOffset: [number, number, number] = [4, 2.3, 4];
const shotAltAPosition = addOffset(secondSubjectPosition, shotAltAOffset);
const shotAltAQuaternion = lookAtQuaternion(shotAltAPosition, secondSubjectPosition);

const shotAltBOffset: [number, number, number] = [-4, 3.3, -3];
const shotAltBPosition = addOffset(secondSubjectPosition, shotAltBOffset);
const shotAltBQuaternion = lookAtQuaternion(shotAltBPosition, secondSubjectPosition);

const groundBoxes: GroundBox[] = [
  { x: -10, z: 0, width: 1.5, height: 1.8, depth: 1.5, color: '#9a9aa8' },
  { x: 10, z: -3, width: 1.3, height: 2.4, depth: 1.3 },
  { x: -9, z: 6, width: 1.6, height: 1.4, depth: 1.6, color: '#c7c7cf' },
  { x: 9, z: 7, width: 1.4, height: 2, depth: 1.4 },
  { x: 0, z: -9, width: 1.8, height: 1.6, depth: 1.8, color: '#9a9aa8' },
  { x: -7, z: -8, width: 1.5, height: 2.2, depth: 1.5 },
  { x: 8, z: -8, width: 1.3, height: 1.5, depth: 1.3, color: '#c7c7cf' },
  { x: 0, z: 9, width: 1.7, height: 2.6, depth: 1.7 },
];

function Subject({ meshRef }: { meshRef: RefObject<Mesh | null> }) {
  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.3;
  });
  return (
    <mesh ref={meshRef} position={subjectPosition}>
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#ffd23f" />
    </mesh>
  );
}

function SecondSubject({ meshRef }: { meshRef: RefObject<Mesh | null> }) {
  useFrame(({ clock }, delta) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.y += delta * 0.4;
    meshRef.current.rotation.x = Math.sin(clock.elapsedTime * 1.2) * 0.25;
  });
  return (
    <mesh ref={meshRef} position={secondSubjectPosition}>
      <torusGeometry args={[0.8, 0.3, 16, 32]} />
      <meshStandardMaterial color="#4fc3c7" />
    </mesh>
  );
}

/** Tracks live blend progress via `Klipp.Events` - `fill` is `curve(t)`, `marker` is raw linear `t`, so
 *  the curve's shape reads directly off how far apart they drift, not just by eye. */
function BlendProgressOverlay({ curve, time, curveName }: { curve: Ease; time: number; curveName: CurveName }) {
  const fillRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const blendStart = useRef<number | null>(null);
  const paramsRef = useRef({ curve, time });
  paramsRef.current = { curve, time };

  useFrame(() => {
    if (blendStart.current === null || !fillRef.current || !markerRef.current) return;
    const { curve: activeCurve, time: activeTime } = paramsRef.current;
    const elapsed = performance.now() / 1000 - blendStart.current;
    const raw = activeTime > 0 ? Math.min(1, Math.max(0, elapsed / activeTime)) : 1;
    const weight = Math.min(1, Math.max(0, activeCurve(raw)));
    fillRef.current.style.width = `${weight * 100}%`;
    markerRef.current.style.left = `${raw * 100}%`;
    if (raw >= 1) blendStart.current = null;
  });

  return (
    <>
      <Klipp.Events onBlendCreated={() => (blendStart.current = performance.now() / 1000)} />
      <CanvasOverlay>
        <div className="blend-progress">
          <div className="blend-progress-label">
            {curveName} Β· {time.toFixed(1)}s
          </div>
          <div className="blend-progress-track">
            <div ref={fillRef} className="blend-progress-fill" />
            <div ref={markerRef} className="blend-progress-marker" />
          </div>
        </div>
      </CanvasOverlay>
    </>
  );
}

/** Five fixed shots switched via the `camera` select or Prev/Next buttons, blended via `curve`/`time`.
 *  `shot-close`/`shot-alt-a` target their own subject's mesh with `BindingModes.lockToTarget`, so they
 *  visibly orbit as it spins; `hints={BlendHints.sphericalPosition}` arcs the position blend around
 *  `out.target`, most obvious swinging between the two subjects. `initialState` seeds each camera's pose
 *  to match its own Follow/HardLookAt, so `debug`'s `CameraFrustumHelper` is accurate before any pick. */
export function BlendCurves() {
  const cameraRef = useRef<CameraName>(cameraNames[0]);
  const subjectRef = useRef<Mesh>(null);
  const secondSubjectRef = useRef<Mesh>(null);

  const [{ curve: rawCurveName, time, camera: rawCamera, debug }, set] = useControls('BlendCurves', () => ({
    curve: { value: 'easeInOut' as CurveName, options: curveOptions },
    time: { value: 1.5, min: 0, max: 4, step: 0.1 },
    camera: { value: cameraNames[0] as CameraName, options: cameraNames },
    '◀ Prev': button(() => {
      const i = cameraNames.indexOf(cameraRef.current);
      set({ camera: cameraNames[(i - 1 + cameraNames.length) % cameraNames.length] });
    }),
    'Next ▶': button(() => {
      const i = cameraNames.indexOf(cameraRef.current);
      set({ camera: cameraNames[(i + 1) % cameraNames.length] });
    }),
    debug: true,
  }));
  const camera = rawCamera as CameraName;
  cameraRef.current = camera;
  const curveName = rawCurveName as CurveName;
  const curve = Curves[curveName];

  return (
    <>
      <Subject meshRef={subjectRef} />
      <SecondSubject meshRef={secondSubjectRef} />
      <GroundClutter boxes={groundBoxes} />

      <Klipp defaultBlend={{ curve, time }}>
        <BlendProgressOverlay curve={curve} time={time} curveName={curveName} />

        {/* permanently active with a low priority unless picked, so its orbit keeps animating even when not live */}
        <VirtualCamera
          name="shot-close"
          priority={camera === 'shot-close' ? 100 : 5}
          hints={BlendHints.sphericalPosition}
          initialState={{ position: shotClosePosition, quaternion: shotCloseQuaternion }}>
          <Follow target={subjectRef} offset={shotCloseOffset} bindingMode={BindingModes.lockToTarget} />
          <HardLookAt target={subjectRef} />
          {debug && <CameraFrustumHelper color="#ff6b4a" />}
          <SpectatorFrustum color="#ff6b4a" />
        </VirtualCamera>

        <VirtualCamera
          name="shot-wide"
          priority={20}
          active={camera === 'shot-wide'}
          hints={BlendHints.sphericalPosition}
          initialState={{ position: shotWidePosition, quaternion: shotWideQuaternion }}>
          <Follow target={subjectPosition} offset={shotWideOffset} bindingMode={BindingModes.worldSpace} />
          <HardLookAt target={subjectPosition} />
          {debug && <CameraFrustumHelper color="#21a9e0" />}
          <SpectatorFrustum color="#21a9e0" />
        </VirtualCamera>

        <VirtualCamera
          name="shot-high"
          priority={30}
          active={camera === 'shot-high'}
          hints={BlendHints.sphericalPosition}
          initialState={{ position: shotHighPosition, quaternion: shotHighQuaternion }}>
          <Follow target={subjectPosition} offset={shotHighOffset} bindingMode={BindingModes.worldSpace} />
          <HardLookAt target={subjectPosition} />
          {debug && <CameraFrustumHelper color="#7ed957" />}
          <SpectatorFrustum color="#7ed957" />
        </VirtualCamera>

        <VirtualCamera
          name="shot-alt-a"
          priority={camera === 'shot-alt-a' ? 100 : 5}
          hints={BlendHints.sphericalPosition}
          initialState={{ position: shotAltAPosition, quaternion: shotAltAQuaternion }}>
          <Follow target={secondSubjectRef} offset={shotAltAOffset} bindingMode={BindingModes.lockToTarget} />
          <HardLookAt target={secondSubjectRef} />
          {debug && <CameraFrustumHelper color="#c77dff" />}
          <SpectatorFrustum color="#c77dff" />
        </VirtualCamera>

        <VirtualCamera
          name="shot-alt-b"
          priority={50}
          active={camera === 'shot-alt-b'}
          hints={BlendHints.sphericalPosition}
          initialState={{ position: shotAltBPosition, quaternion: shotAltBQuaternion }}>
          <Follow target={secondSubjectPosition} offset={shotAltBOffset} bindingMode={BindingModes.worldSpace} />
          <HardLookAt target={secondSubjectPosition} />
          {debug && <CameraFrustumHelper color="#ff4fa3" />}
          <SpectatorFrustum color="#ff4fa3" />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
