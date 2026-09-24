import { Environment, Grid, OrbitControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useState, type ReactNode } from 'react';
import { PerspectiveCamera } from 'three';

/** Frustum helpers on this layer show up only in the spectator inset, never in the main view. */
export const spectatorLayer = 1;

const defaultSpectatorPosition: [number, number, number] = [-6, 5, -9];
const defaultSpectatorTarget: [number, number, number] = [0, 2, 0];

/** Renders the scene again into the spectator inset. Rendering at `useFrame` priority 1 disables
 *  r3f's own render, so the main pass is issued here too. */
function SpectatorInset({
  element,
  position,
  target,
}: {
  element: HTMLDivElement | null;
  position: [number, number, number];
  target: [number, number, number];
}) {
  const [spectatorCamera] = useState(() => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(...position);
    camera.lookAt(...target);
    camera.layers.enable(spectatorLayer);
    return camera;
  });

  useFrame(({ gl, scene, camera, size }) => {
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
    gl.render(scene, camera);

    if (!element) return;
    const canvasRect = gl.domElement.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = rect.left - canvasRect.left;
    const y = canvasRect.height - (rect.top - canvasRect.top) - rect.height;

    // spectatorCamera is a stable held instance (like a ref), not reactive state - direct mutation is the point
    // oxlint-disable-next-line react/immutability
    spectatorCamera.aspect = rect.width / rect.height;
    spectatorCamera.updateProjectionMatrix();

    gl.setScissorTest(true);
    gl.setScissor(x, y, rect.width, rect.height);
    gl.setViewport(x, y, rect.width, rect.height);
    gl.render(scene, spectatorCamera);
    gl.setScissorTest(false);
  }, 1);

  if (!element) return null;
  return <OrbitControls camera={spectatorCamera} domElement={element} target={target} makeDefault={false} />;
}

/** Environment, floor and spectator inset shared by every example. */
export function BaseScene({
  children,
  insetElement,
  spectatorPosition = defaultSpectatorPosition,
  spectatorTarget = defaultSpectatorTarget,
}: {
  children: ReactNode;
  insetElement: HTMLDivElement | null;
  spectatorPosition?: [number, number, number];
  spectatorTarget?: [number, number, number];
}) {
  return (
    <>
      <SpectatorInset element={insetElement} position={spectatorPosition} target={spectatorTarget} />
      <Environment preset="studio" background blur={0.8} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[6, 10, 4]} intensity={0.8} />
      <Grid
        args={[60, 60]}
        cellSize={0.5}
        cellColor="#c7c7cf"
        sectionSize={2.5}
        sectionColor="#9a9aa8"
        fadeDistance={35}
        fadeStrength={1.5}
        infiniteGrid
      />
      {children}
    </>
  );
}
