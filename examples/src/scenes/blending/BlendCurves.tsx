import { BindingModes, BlendHints, BlendCurves as Curves, type Ease } from '@kvvasuu/klipp';
import { Aim, Body, CameraFrustumHelper, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { button, useControls } from 'leva';
import { useRef, type RefObject } from 'react';
import { Mesh } from 'three';
import { CanvasOverlay } from '../../scene/CanvasOverlay';
import { GroundClutter } from '../../scene/GroundClutter';
import { addOffset, lookAtQuaternion } from '../../scene/lookAtQuaternion';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';
import { SpinningSubject } from '../../scene/SpinningSubject';

const subjectPosition: [number, number, number] = [0, 1.5, 0];
const secondSubjectPosition: [number, number, number] = [6, 1.2, 1];

const curveOptions = ['cut', 'linear', 'easeInOut', 'easeIn', 'easeOut', 'hardIn', 'hardOut'] as const;
type CurveName = (typeof curveOptions)[number];

const cameraNames = ['shot-wide', 'shot-close', 'shot-high', 'shot-alt-a', 'shot-alt-b'] as const;
type CameraName = (typeof cameraNames)[number];

// also seeds `initialState`, so each frustum helper shows its camera's real pose before it's first picked
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

function shiftCamera(get: (path: string) => unknown, by: number): CameraName {
  const i = cameraNames.indexOf(get('BlendCurves.camera') as CameraName);
  return cameraNames[(i + by + cameraNames.length) % cameraNames.length];
}

/** `fill` is `curve(t)` and `marker` is the raw linear `t`, so the gap between them shows the curve. */
function BlendProgressOverlay({ curve, time, curveName }: { curve: Ease; time: number; curveName: CurveName }) {
  const fillRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const blendStart = useRef<number | null>(null);
  useFrame(() => {
    if (blendStart.current === null || !fillRef.current || !markerRef.current) return;
    const elapsed = performance.now() / 1000 - blendStart.current;
    const raw = time > 0 ? Math.min(1, Math.max(0, elapsed / time)) : 1;
    const weight = Math.min(1, Math.max(0, curve(raw)));
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
            {curveName} · {time.toFixed(1)}s
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

export function BlendCurves() {
  const subjectRef = useRef<Mesh>(null);
  const secondSubjectRef = useRef<Mesh>(null);

  const [{ curve: rawCurveName, time, camera: rawCamera }, set] = useControls('BlendCurves', () => ({
    curve: { value: 'easeInOut' as CurveName, options: curveOptions },
    time: { value: 1.5, min: 0, max: 4, step: 0.1 },
    camera: { value: cameraNames[0] as CameraName, options: cameraNames },
  }));
  useControls('BlendCurves', {
    '◀ Prev': button((get) => set({ camera: shiftCamera(get, -1) })),
    'Next ▶': button((get) => set({ camera: shiftCamera(get, 1) })),
  });
  const { debug } = useControls('BlendCurves', { debug: true });
  const camera = rawCamera as CameraName;
  const curveName = rawCurveName as CurveName;
  const curve = Curves[curveName];

  return (
    <>
      <SpinningSubject ref={subjectRef} position={subjectPosition} />
      <SecondSubject meshRef={secondSubjectRef} />
      <GroundClutter layout="twoSubjects" />

      <Klipp defaultBlend={{ curve, time }}>
        <BlendProgressOverlay curve={curve} time={time} curveName={curveName} />

        {/* permanently active with a low priority unless picked, so its orbit keeps animating even when not live */}
        <VirtualCamera
          name="shot-close"
          priority={camera === 'shot-close' ? 100 : 5}
          hints={BlendHints.sphericalPosition}
          initialState={{ position: shotClosePosition, quaternion: shotCloseQuaternion }}>
          <Body.Follow target={subjectRef} offset={shotCloseOffset} bindingMode={BindingModes.lockToTarget} />
          <Aim.HardLookAt target={subjectRef} />
          {debug && <CameraFrustumHelper color="#ff6b4a" />}
          <SpectatorFrustum color="#ff6b4a" />
        </VirtualCamera>

        <VirtualCamera
          name="shot-wide"
          priority={20}
          active={camera === 'shot-wide'}
          hints={BlendHints.sphericalPosition}
          initialState={{ position: shotWidePosition, quaternion: shotWideQuaternion }}>
          <Body.Follow target={subjectPosition} offset={shotWideOffset} bindingMode={BindingModes.worldSpace} />
          <Aim.HardLookAt target={subjectPosition} />
          {debug && <CameraFrustumHelper color="#21a9e0" />}
          <SpectatorFrustum color="#21a9e0" />
        </VirtualCamera>

        <VirtualCamera
          name="shot-high"
          priority={30}
          active={camera === 'shot-high'}
          hints={BlendHints.sphericalPosition}
          initialState={{ position: shotHighPosition, quaternion: shotHighQuaternion }}>
          <Body.Follow target={subjectPosition} offset={shotHighOffset} bindingMode={BindingModes.worldSpace} />
          <Aim.HardLookAt target={subjectPosition} />
          {debug && <CameraFrustumHelper color="#7ed957" />}
          <SpectatorFrustum color="#7ed957" />
        </VirtualCamera>

        <VirtualCamera
          name="shot-alt-a"
          priority={camera === 'shot-alt-a' ? 100 : 5}
          hints={BlendHints.sphericalPosition}
          initialState={{ position: shotAltAPosition, quaternion: shotAltAQuaternion }}>
          <Body.Follow target={secondSubjectRef} offset={shotAltAOffset} bindingMode={BindingModes.lockToTarget} />
          <Aim.HardLookAt target={secondSubjectRef} />
          {debug && <CameraFrustumHelper color="#c77dff" />}
          <SpectatorFrustum color="#c77dff" />
        </VirtualCamera>

        <VirtualCamera
          name="shot-alt-b"
          priority={50}
          active={camera === 'shot-alt-b'}
          hints={BlendHints.sphericalPosition}
          initialState={{ position: shotAltBPosition, quaternion: shotAltBQuaternion }}>
          <Body.Follow target={secondSubjectPosition} offset={shotAltBOffset} bindingMode={BindingModes.worldSpace} />
          <Aim.HardLookAt target={secondSubjectPosition} />
          {debug && <CameraFrustumHelper color="#ff4fa3" />}
          <SpectatorFrustum color="#ff4fa3" />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
