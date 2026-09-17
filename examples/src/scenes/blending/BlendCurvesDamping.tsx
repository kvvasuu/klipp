import { BindingModes, BlendCurves as Curves, Damper, type Ease } from '@kvvasuu/klipp';
import { Follow, HardLookAt, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { button, useControls } from 'leva';
import { useRef, useState } from 'react';
import { Mesh } from 'three';
import { CanvasOverlay } from '../../scene/CanvasOverlay';
import { GroundClutter, type GroundBox } from '../../scene/GroundClutter';
import { addOffset, lookAtQuaternion } from '../../scene/lookAtQuaternion';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const subjectPosition: [number, number, number] = [0, 1.5, 0];

const wideOffset: [number, number, number] = [0, 3, 9];
const widePosition = addOffset(subjectPosition, wideOffset);
const wideQuaternion = lookAtQuaternion(widePosition, subjectPosition);

const closeOffset: [number, number, number] = [3, 1, 3];
const closePosition = addOffset(subjectPosition, closeOffset);
const closeQuaternion = lookAtQuaternion(closePosition, subjectPosition);

const curveOptions = ['cut', 'linear', 'easeInOut', 'easeIn', 'easeOut', 'hardIn', 'hardOut'] as const;
type CurveName = (typeof curveOptions)[number];

const groundBoxes: GroundBox[] = [
  { x: -8, z: 2, width: 1.5, height: 1.8, depth: 1.5, color: '#9a9aa8' },
  { x: 8, z: -3, width: 1.3, height: 2.4, depth: 1.3 },
  { x: -7, z: -6, width: 1.6, height: 1.4, depth: 1.6, color: '#c7c7cf' },
  { x: 0, z: -8, width: 1.7, height: 2, depth: 1.7 },
];

function Subject() {
  const meshRef = useRef<Mesh>(null);
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

type BlendMode = 'curve' | 'damping';

/** Mirrors `BlendDriver`'s own damping algorithm (a fresh `Damper` warmed the same way) instead of faking
 *  a stand-in shape, so the fill's pacing - no fixed finish, speed tracking remaining distance - is real. */
function BlendProgressOverlay({
  mode,
  curve,
  curveName,
  time,
  damping,
}: {
  mode: BlendMode;
  curve: Ease;
  curveName: CurveName;
  time: number;
  damping: number;
}) {
  const fillRef = useRef<HTMLDivElement>(null);
  const blendStart = useRef<number | null>(null);
  const damper = useRef(new Damper());
  const progress = useRef(0);
  const paramsRef = useRef({ mode, curve, time, damping });
  paramsRef.current = { mode, curve, time, damping };

  useFrame((_, dt) => {
    if (blendStart.current === null || !fillRef.current) return;
    const p = paramsRef.current;
    let weight: number;
    if (p.mode === 'curve') {
      const elapsed = performance.now() / 1000 - blendStart.current;
      const raw = p.time > 0 ? Math.min(1, elapsed / p.time) : 1;
      weight = Math.min(1, Math.max(0, p.curve(raw)));
      if (raw >= 1) blendStart.current = null;
    } else {
      weight = damper.current.update(progress.current, 1, p.damping, dt);
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
          damper.current.update(0, 0, paramsRef.current.damping, 0);
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

/** One transition, replayed under two different `BlendDefinition` shapes via `mode` - `{ curve, time }`
 *  always finishes at exactly `time` seconds; `{ damping }` has no fixed finish, easing forever closer
 *  until it's near enough to snap (same spring as `Damper`). The fill bar makes that contrast legible:
 *  curve mode always caps out right at its own label's time, damping mode trails off instead of stopping. */
export function BlendCurvesDamping() {
  const [camera, setCamera] = useState<'wide' | 'close'>('wide');

  const {
    mode: rawMode,
    curveName: rawCurveName,
    time,
    damping,
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
    'Switch Camera': button(() => setCamera((c) => (c === 'wide' ? 'close' : 'wide'))),
  });

  const mode = rawMode as BlendMode;
  const curveName = rawCurveName as CurveName;
  const curve = Curves[curveName];
  const defaultBlend = mode === 'curve' ? { curve, time } : { damping };

  return (
    <>
      <Subject />
      <GroundClutter boxes={groundBoxes} />

      <Klipp defaultBlend={defaultBlend}>
        <BlendProgressOverlay mode={mode} curve={curve} curveName={curveName} time={time} damping={damping} />

        <VirtualCamera
          name="wide"
          priority={10}
          active={camera === 'wide'}
          initialState={{ position: widePosition, quaternion: wideQuaternion }}>
          <Follow target={subjectPosition} offset={wideOffset} bindingMode={BindingModes.worldSpace} />
          <HardLookAt target={subjectPosition} />
          <SpectatorFrustum color="#21a9e0" />
        </VirtualCamera>

        <VirtualCamera
          name="close"
          priority={10}
          active={camera === 'close'}
          initialState={{ position: closePosition, quaternion: closeQuaternion }}>
          <Follow target={subjectPosition} offset={closeOffset} bindingMode={BindingModes.worldSpace} />
          <HardLookAt target={subjectPosition} />
          <SpectatorFrustum color="#ff6b4a" />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
