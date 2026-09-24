import { BindingModes, BlendCurves as Curves, Damper, type Ease } from '@kvvasuu/klipp';
import { Aim, Body, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { button, useControls } from 'leva';
import { useRef, useState } from 'react';
import { CanvasOverlay } from '../../scene/CanvasOverlay';
import { GroundClutter } from '../../scene/GroundClutter';
import { addOffset, lookAtQuaternion } from '../../scene/lookAtQuaternion';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';
import { SpinningSubject } from '../../scene/SpinningSubject';

const subjectPosition: [number, number, number] = [0, 1.5, 0];

const wideOffset: [number, number, number] = [0, 3, 9];
const widePosition = addOffset(subjectPosition, wideOffset);
const wideQuaternion = lookAtQuaternion(widePosition, subjectPosition);

const closeOffset: [number, number, number] = [3, 1, 3];
const closePosition = addOffset(subjectPosition, closeOffset);
const closeQuaternion = lookAtQuaternion(closePosition, subjectPosition);

const curveOptions = ['cut', 'linear', 'easeInOut', 'easeIn', 'easeOut', 'hardIn', 'hardOut'] as const;
type CurveName = (typeof curveOptions)[number];

type BlendMode = 'curve' | 'damping';

/** Runs a real `Damper` the same way a damped blend does, so the bar matches the actual pacing. */
function BlendProgressOverlay({
  mode,
  curve,
  curveName,
  time,
  damping,
  maxSpeed,
}: {
  mode: BlendMode;
  curve: Ease;
  curveName: CurveName;
  time: number;
  damping: number;
  maxSpeed: number;
}) {
  const fillRef = useRef<HTMLDivElement>(null);
  const blendStart = useRef<number | null>(null);
  const damper = useRef(new Damper());
  const progress = useRef(0);

  useFrame((_, dt) => {
    if (blendStart.current === null || !fillRef.current) return;
    let weight: number;
    if (mode === 'curve') {
      const elapsed = performance.now() / 1000 - blendStart.current;
      const raw = time > 0 ? Math.min(1, elapsed / time) : 1;
      weight = Math.min(1, Math.max(0, curve(raw)));
      if (raw >= 1) blendStart.current = null;
    } else {
      weight = damper.current.update(progress.current, 1, damping, dt, maxSpeed);
      progress.current = weight;
      if (weight > 0.999) blendStart.current = null;
    }
    fillRef.current.style.width = `${weight * 100}%`;
  });

  return (
    <>
      <Klipp.Events
        onBlendCreated={() => {
          blendStart.current = performance.now() / 1000;
          damper.current = new Damper();
          damper.current.update(0, 0, damping, 0);
          progress.current = 0;
        }}
      />
      <CanvasOverlay>
        <div className="blend-progress">
          <div className="blend-progress-label">
            {mode === 'curve' ? `${curveName} · ${time.toFixed(1)}s` : `damping · ${damping.toFixed(2)}`}
          </div>
          <div className="blend-progress-track">
            <div ref={fillRef} className="blend-progress-fill" />
          </div>
        </div>
      </CanvasOverlay>
    </>
  );
}

export function BlendCurvesDamping() {
  const [camera, setCamera] = useState<'wide' | 'close'>('wide');

  const {
    mode: rawMode,
    curveName: rawCurveName,
    time,
    damping,
    maxSpeed,
  } = useControls('BlendCurves: Damping', {
    mode: { value: 'curve' as BlendMode, options: ['curve', 'damping'] },
    curveName: {
      value: 'easeInOut' as CurveName,
      options: curveOptions,
      render: (get) => get('BlendCurves: Damping.mode') === 'curve',
    },
    time: {
      value: 1.5,
      min: 0.2,
      max: 4,
      step: 0.1,
      render: (get) => get('BlendCurves: Damping.mode') === 'curve',
    },
    damping: {
      value: 0.6,
      min: 0.05,
      max: 2,
      step: 0.05,
      render: (get) => get('BlendCurves: Damping.mode') === 'damping',
    },
    maxSpeed: {
      value: 3,
      min: 0.1,
      max: 5,
      step: 0.1,
      render: (get) => get('BlendCurves: Damping.mode') === 'damping',
    },
    'Switch Camera': button(() => setCamera((c) => (c === 'wide' ? 'close' : 'wide'))),
  });

  const mode = rawMode as BlendMode;
  const curveName = rawCurveName as CurveName;
  const curve = Curves[curveName];
  const defaultBlend = mode === 'curve' ? { curve, time } : { damping, maxSpeed };

  return (
    <>
      <SpinningSubject position={subjectPosition} />
      <GroundClutter layout="singleSubject" />

      <Klipp defaultBlend={defaultBlend}>
        <BlendProgressOverlay
          mode={mode}
          curve={curve}
          curveName={curveName}
          time={time}
          damping={damping}
          maxSpeed={maxSpeed}
        />

        <VirtualCamera
          name="wide"
          priority={10}
          active={camera === 'wide'}
          initialState={{ position: widePosition, quaternion: wideQuaternion }}>
          <Body.Follow target={subjectPosition} offset={wideOffset} bindingMode={BindingModes.worldSpace} />
          <Aim.HardLookAt target={subjectPosition} />
          <SpectatorFrustum color="#21a9e0" />
        </VirtualCamera>

        <VirtualCamera
          name="close"
          priority={10}
          active={camera === 'close'}
          initialState={{ position: closePosition, quaternion: closeQuaternion }}>
          <Body.Follow target={subjectPosition} offset={closeOffset} bindingMode={BindingModes.worldSpace} />
          <Aim.HardLookAt target={subjectPosition} />
          <SpectatorFrustum color="#ff6b4a" />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
