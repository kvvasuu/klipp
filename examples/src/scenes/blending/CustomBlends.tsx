import { BindingModes, BlendCurves as Curves, resolveBlendDefinition, type CustomBlend } from '@kvvasuu/klipp';
import { Aim, Body, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useControls } from 'leva';
import { useState } from 'react';
import { CanvasOverlay } from '../../scene/CanvasOverlay';
import { GroundClutter } from '../../scene/GroundClutter';
import { addOffset, lookAtQuaternion } from '../../scene/lookAtQuaternion';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';
import { SpinningSubject } from '../../scene/SpinningSubject';

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

function MatchLabel({ label }: { label: string }) {
  return (
    <CanvasOverlay>
      <div className="blend-progress">
        <div className="blend-progress-label">{label}</div>
      </div>
    </CanvasOverlay>
  );
}

export function CustomBlends() {
  const [{ camera, label }, setPick] = useState<{ camera: CameraName; label: string }>({
    camera: 'wide',
    label: 'start - pick a camera to trigger a transition',
  });

  useControls('CustomBlends', {
    pick: {
      value: 'wide' as CameraName,
      options: cameraNames,
      onChange: (value: CameraName, _path, { initial }) => {
        if (initial) return;
        setPick((previous) =>
          previous.camera === value ? previous : { camera: value, label: pickLabel(previous.camera, value) },
        );
      },
    },
  });

  return (
    <>
      <SpinningSubject position={subjectPosition} />
      <GroundClutter layout="singleSubject" />

      <Klipp defaultBlend={defaultBlend} customBlends={customBlends}>
        <MatchLabel label={label} />

        <VirtualCamera
          name="wide"
          priority={10}
          active={camera === 'wide'}
          initialState={{ position: positions.wide, quaternion: quaternions.wide }}>
          <Body.Follow target={subjectPosition} offset={offsets.wide} bindingMode={BindingModes.worldSpace} />
          <Aim.HardLookAt target={subjectPosition} />
          <SpectatorFrustum color={colors.wide} />
        </VirtualCamera>

        <VirtualCamera
          name="intro"
          priority={10}
          active={camera === 'intro'}
          initialState={{ position: positions.intro, quaternion: quaternions.intro }}>
          <Body.Follow target={subjectPosition} offset={offsets.intro} bindingMode={BindingModes.worldSpace} />
          <Aim.HardLookAt target={subjectPosition} />
          <SpectatorFrustum color={colors.intro} />
        </VirtualCamera>

        <VirtualCamera
          name="gameplay"
          priority={10}
          active={camera === 'gameplay'}
          initialState={{ position: positions.gameplay, quaternion: quaternions.gameplay }}>
          <Body.Follow target={subjectPosition} offset={offsets.gameplay} bindingMode={BindingModes.worldSpace} />
          <Aim.HardLookAt target={subjectPosition} />
          <SpectatorFrustum color={colors.gameplay} />
        </VirtualCamera>

        <VirtualCamera
          name="closeup"
          priority={10}
          active={camera === 'closeup'}
          initialState={{ position: positions.closeup, quaternion: quaternions.closeup }}>
          <Body.Follow target={subjectPosition} offset={offsets.closeup} bindingMode={BindingModes.worldSpace} />
          <Aim.HardLookAt target={subjectPosition} />
          <SpectatorFrustum color={colors.closeup} />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
