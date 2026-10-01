import { create } from '@react-three/test-renderer';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { BlendCurves } from '../../src/core/blend/BlendCurves';
import { DebugZoneOverlay } from '../../src/react/DebugZoneOverlay';
import { Klipp } from '../../src/react/Klipp';
import { VirtualCamera } from '../../src/react/VirtualCamera';

// The test renderer's canvas isn't in the document. Attach it, as a real <Canvas> is, so the overlay can portal into its parent.
function createAttached(element: ReactElement) {
  return create(element, { beforeReturn: (canvas: HTMLCanvasElement) => document.body.appendChild(canvas) });
}

afterEach(() => {
  document.body.replaceChildren();
});

// Children of every overlay root: only the active camera's root has any.
function readBoxes(): HTMLDivElement[] {
  const canvas = document.querySelector('canvas');
  const roots = canvas?.parentElement?.querySelectorAll(':scope > div') ?? [];
  return Array.from(roots).flatMap((root) => Array.from(root.children) as HTMLDivElement[]);
}

describe('DebugZoneOverlay', () => {
  it('follows arbitration, not the blend: drawn only for the camera that currently wins', async () => {
    const scene = (bPriority: number) => (
      <Klipp defaultBlend={{ curve: BlendCurves.linear, time: 2 }}>
        <VirtualCamera name="a" priority={10}>
          <DebugZoneOverlay zones={[{ screenPosition: [0, 0], size: [0.4, 0.4], className: 'klipp-debug-deadzone' }]} />
        </VirtualCamera>
        <VirtualCamera name="b" priority={bPriority}>
          <DebugZoneOverlay
            zones={[{ screenPosition: [0, 0], size: [0.4, 0.4], className: 'klipp-debug-hardlimit' }]}
          />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await createAttached(scene(5));
    await renderer.advanceFrames(1, 0.05);
    expect(readBoxes().map((box) => box.className)).toEqual(['klipp-debug-deadzone']);

    await renderer.update(scene(30));
    await renderer.advanceFrames(1, 0.5); // mid-blend
    expect(readBoxes().map((box) => box.className)).toEqual(['klipp-debug-hardlimit']);
  });

  it('draws one box per zone and a full-viewport crosshair, in percent of the canvas', async () => {
    const renderer = await createAttached(
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <DebugZoneOverlay
            zones={[
              { screenPosition: [0, 0], size: [0.4, 0.4], className: 'klipp-debug-deadzone' },
              { screenPosition: [0.5, 0], size: [0.2, 0.6], className: 'klipp-debug-hardlimit' },
            ]}
            crosshair={[0.5, -0.5]}
          />
        </VirtualCamera>
      </Klipp>,
    );
    await renderer.advanceFrames(1, 0.1);

    const [deadZone, hardLimit, vertical, horizontal] = readBoxes();
    expect(readBoxes()).toHaveLength(4);
    expect(deadZone.className).toBe('klipp-debug-deadzone');
    expect(deadZone.style).toMatchObject({ left: '40%', width: '20%', top: '40%', height: '20%' });
    expect(hardLimit.className).toBe('klipp-debug-hardlimit');
    expect(hardLimit.style).toMatchObject({ left: '70%', width: '10%', top: '35%', height: '30%' });
    expect(vertical.className).toBe('klipp-debug-crosshair');
    expect(vertical.style).toMatchObject({ left: '75%', top: '0px', bottom: '0px', width: '1px' });
    expect(horizontal.className).toBe('klipp-debug-crosshair');
    expect(horizontal.style).toMatchObject({ top: '75%', left: '0px', right: '0px', height: '1px' }); // y is inverted
  });

  it('draws nothing without zones or a crosshair', async () => {
    const renderer = await createAttached(
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <DebugZoneOverlay zones={[]} />
        </VirtualCamera>
      </Klipp>,
    );
    await renderer.advanceFrames(1, 0.1);

    expect(readBoxes()).toHaveLength(0);
  });

  it('removes its root element on unmount', async () => {
    const renderer = await createAttached(
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <DebugZoneOverlay zones={[{ screenPosition: [0, 0], size: [0.4, 0.4], className: 'klipp-debug-deadzone' }]} />
        </VirtualCamera>
      </Klipp>,
    );
    await renderer.advanceFrames(1, 0.1);
    expect(readBoxes()).toHaveLength(1);

    await renderer.unmount();

    expect(readBoxes()).toHaveLength(0);
  });
});
