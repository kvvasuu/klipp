import { BindingModes, BlendCurves as Curves, resolveBlendDefinition, type CustomBlend } from '@kvvasuu/klipp';
import { Follow, HardLookAt, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import { useRef, useState } from 'react';
import { Mesh } from 'three';
import { CanvasOverlay } from '../../scene/CanvasOverlay';
import { GroundClutter, type GroundBox } from '../../scene/GroundClutter';
import { addOffset, lookAtQuaternion } from '../../scene/lookAtQuaternion';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const subjectPosition: [number, number, number] = [0, 1.5, 0];

const cameraNames = ['wide', 'intro', 'gameplay', 'closeup'] as const;
type CameraName = (typeof cameraNames)[number];

const offsets: Record<CameraName, [number, number, number]> = {
  wide: [0, 5, 11],
  intro: [-6, 3, 6],
  gameplay: [4, 2, 6],
  closeup: [1, 0.5, 2],
};

const colors: Record<CameraName, string> = {
  wide: '#21a9e0',
  intro: '#7ed957',
  gameplay: '#ff6b4a',
  closeup: '#c77dff',
};

const positions = Object.fromEntries(
  cameraNames.map((name) => [name, addOffset(subjectPosition, offsets[name])]),
) as Record<CameraName, [number, number, number]>;

const quaternions = Object.fromEntries(
  cameraNames.map((name) => [name, lookAtQuaternion(positions[name], subjectPosition)]),
) as Record<CameraName, ReturnType<typeof lookAtQuaternion>>;

const groundBoxes: GroundBox[] = [
  { x: -8, z: 2, width: 1.5, height: 1.8, depth: 1.5, color: '#9a9aa8' },
  { x: 8, z: -3, width: 1.3, height: 2.4, depth: 1.3 },
  { x: -7, z: -6, width: 1.6, height: 1.4, depth: 1.6, color: '#c7c7cf' },
  { x: 0, z: -8, width: 1.7, height: 2, depth: 1.7 },
];

const defaultBlend = { curve: Curves.easeInOut, time: 1.5 };

type LabeledCustomBlend = CustomBlend & { label: string };

const customBlends: LabeledCustomBlend[] = [
  { from: 'intro', to: 'gameplay', blend: { damping: 0.8 }, label: 'exact intro to gameplay: damping 0.8' },
  { to: 'closeup', blend: { curve: Curves.cut, time: 0 }, label: 'to-only: always cut into closeup' },
  { from: 'wide', blend: { curve: Curves.easeOut, time: 3 }, label: 'from-only: always ease 3s leaving wide' },
];

// Reads which entry actually won off the real resolver's own output, instead of re-deriving specificity
// by hand - guarantees the label can never drift from what the blend itself does.
function pickLabel(from: string | null, to: string): string {
  const resolved = resolveBlendDefinition(customBlends, from, to, defaultBlend);
  return customBlends.find((entry) => entry.blend === resolved)?.label ?? 'default: easeInOut 1.5s';
}

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

function MatchLabel({ label }: { label: string }) {
  return (
    <CanvasOverlay>
      <div className="blend-progress">
        <div className="blend-progress-label">{label}</div>
      </div>
    </CanvasOverlay>
  );
}

/** Four fixed shots - picking one from `pick` triggers a real from→to transition, resolved by the same
 *  `resolveBlendDefinition` the library uses, against a fixed `customBlends` list covering all three
 *  specificity levels (exact, to-only, from-only) plus the `defaultBlend` fallback. The label shows which
 *  one actually won, so the matching rules read off real transitions instead of the docs table alone. */
export function CustomBlends() {
  const [camera, setCamera] = useState<CameraName>('wide');
  const [label, setLabel] = useState('start - pick a camera to trigger a transition');
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  useControls('CustomBlends', {
    pick: {
      value: 'wide' as CameraName,
      options: cameraNames,
      onChange: (value: CameraName, _path, { initial }) => {
        if (initial || value === cameraRef.current) return;
        setLabel(pickLabel(cameraRef.current, value));
        setCamera(value);
      },
    },
  });

  return (
    <>
      <Subject />
      <GroundClutter boxes={groundBoxes} />

      <Klipp defaultBlend={defaultBlend} customBlends={customBlends}>
        <MatchLabel label={label} />

        <VirtualCamera
          name="wide"
          priority={10}
          active={camera === 'wide'}
          initialState={{ position: positions.wide, quaternion: quaternions.wide }}>
          <Follow target={subjectPosition} offset={offsets.wide} bindingMode={BindingModes.worldSpace} />
          <HardLookAt target={subjectPosition} />
          <SpectatorFrustum color={colors.wide} />
        </VirtualCamera>

        <VirtualCamera
          name="intro"
          priority={10}
          active={camera === 'intro'}
          initialState={{ position: positions.intro, quaternion: quaternions.intro }}>
          <Follow target={subjectPosition} offset={offsets.intro} bindingMode={BindingModes.worldSpace} />
          <HardLookAt target={subjectPosition} />
          <SpectatorFrustum color={colors.intro} />
        </VirtualCamera>

        <VirtualCamera
          name="gameplay"
          priority={10}
          active={camera === 'gameplay'}
          initialState={{ position: positions.gameplay, quaternion: quaternions.gameplay }}>
          <Follow target={subjectPosition} offset={offsets.gameplay} bindingMode={BindingModes.worldSpace} />
          <HardLookAt target={subjectPosition} />
          <SpectatorFrustum color={colors.gameplay} />
        </VirtualCamera>

        <VirtualCamera
          name="closeup"
          priority={10}
          active={camera === 'closeup'}
          initialState={{ position: positions.closeup, quaternion: quaternions.closeup }}>
          <Follow target={subjectPosition} offset={offsets.closeup} bindingMode={BindingModes.worldSpace} />
          <HardLookAt target={subjectPosition} />
          <SpectatorFrustum color={colors.closeup} />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
