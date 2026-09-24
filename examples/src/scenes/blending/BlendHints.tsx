import { BindingModes, BlendCurves, BlendHints as Hints, createCameraState, lerpCameraState } from '@kvvasuu/klipp';
import { Aim, Body, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { Line } from '@react-three/drei';
import { button, useControls } from 'leva';
import { useMemo, useState } from 'react';
import { GroundClutter } from '../../scene/GroundClutter';
import { addOffset, lookAtQuaternion } from '../../scene/lookAtQuaternion';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';
import { SpinningSubject } from '../../scene/SpinningSubject';

const subjectPosition: [number, number, number] = [0, 1.5, 0];
const secondSubjectPosition: [number, number, number] = [5, 1.3, -5];

// opposing radius/angle trends make spherical's height rise above both endpoints mid-blend, not just arc
// wider; ~140° apart in azimuth (not ~180°) keeps forward/reverse transitions on the same side.
const highOffset: [number, number, number] = [1, 10, 3];
const highPosition = addOffset(secondSubjectPosition, highOffset);
const highQuaternion = lookAtQuaternion(highPosition, secondSubjectPosition);

const lowOffset: [number, number, number] = [-10, 2.7, -7];
const lowPosition = addOffset(subjectPosition, lowOffset);
const lowQuaternion = lookAtQuaternion(lowPosition, subjectPosition);

const pathA = createCameraState();
pathA.position.set(...highPosition);
pathA.target.set(...secondSubjectPosition);
pathA.hasTarget = true;

const pathB = createCameraState();
pathB.position.set(...lowPosition);
pathB.target.set(...subjectPosition);
pathB.hasTarget = true;

const PATH_SAMPLES = 40;
const scratchPathState = createCameraState();

// Samples the actual library interpolation, not a lookalike - toggling a hint reshapes this curve exactly
// like it reshapes the real blend, just all at once instead of over `time` seconds.
function samplePath(hints: number): [number, number, number][] {
  const points: [number, number, number][] = [];
  for (let i = 0; i <= PATH_SAMPLES; i++) {
    lerpCameraState(scratchPathState, pathA, pathB, i / PATH_SAMPLES, hints);
    points.push([scratchPathState.position.x, scratchPathState.position.y, scratchPathState.position.z]);
  }
  return points;
}

const straightLinePoints = samplePath(Hints.none);

function PathCurve({ hints }: { hints: number }) {
  const points = useMemo(() => samplePath(hints), [hints]);
  return (
    <>
      <Line points={straightLinePoints} color="#666666" lineWidth={1} dashed dashSize={0.3} gapSize={0.2} />
      <Line points={points} color="#4fc3c7" lineWidth={2.5} />
    </>
  );
}

export function BlendHints() {
  const [camera, setCamera] = useState<'shot-high' | 'shot-low'>('shot-low');

  const { cylindrical, spherical, ignoreTarget } = useControls('BlendHints', {
    ignoreTarget: false,
    cylindrical: false,
    spherical: false,
    'Switch Camera': button(() => setCamera((c) => (c === 'shot-high' ? 'shot-low' : 'shot-high'))),
  });

  const hints =
    (spherical ? Hints.sphericalPosition : Hints.none) |
    (cylindrical ? Hints.cylindricalPosition : Hints.none) |
    (ignoreTarget ? Hints.ignoreTarget : Hints.none);

  return (
    <>
      <SpinningSubject position={subjectPosition} />
      <SpinningSubject position={secondSubjectPosition} color="#c77dff">
        <octahedronGeometry args={[1, 0]} />
      </SpinningSubject>
      <GroundClutter layout="blendHints" />
      <PathCurve hints={hints} />

      <Klipp defaultBlend={{ curve: BlendCurves.easeInOut, time: 2.5 }}>
        <VirtualCamera
          name="shot-high"
          priority={10}
          active={camera === 'shot-high'}
          hints={hints}
          initialState={{ position: highPosition, quaternion: highQuaternion }}>
          <Body.Follow target={secondSubjectPosition} offset={highOffset} bindingMode={BindingModes.worldSpace} />
          <Aim.HardLookAt target={secondSubjectPosition} />
          <SpectatorFrustum color="#21a9e0" />
        </VirtualCamera>

        <VirtualCamera
          name="shot-low"
          priority={10}
          active={camera === 'shot-low'}
          hints={hints}
          initialState={{ position: lowPosition, quaternion: lowQuaternion }}>
          <Body.Follow target={subjectPosition} offset={lowOffset} bindingMode={BindingModes.worldSpace} />
          <Aim.HardLookAt target={subjectPosition} />
          <SpectatorFrustum color="#ff6b4a" />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
