import { create } from '@react-three/test-renderer';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { BlendCurves } from '../src/blend/BlendCurves';
import { DebugZoneOverlay } from '../src/DebugZoneOverlay';
import { Klipp } from '../src/Klipp';
import { VirtualCamera } from '../src/VirtualCamera';

// the test renderer's own canvas is never attached to the document by default (so `.parentElement` is
// null) - attach it ourselves, matching what a REAL <Canvas> does, so the overlay has somewhere to portal
// its plain DOM nodes into
function createAttached(element: ReactElement) {
  return create(element, { beforeReturn: (canvas: HTMLCanvasElement) => document.body.appendChild(canvas) });
}

afterEach(() => {
  document.body.replaceChildren();
});

// one root div per mounted DebugZoneOverlay (only the active one's has any children) - collect across all
// of them, not just the first, so a scene with more than one overlay still reads correctly
function readBoxes(): HTMLDivElement[] {
  const canvas = document.querySelector('canvas');
  const roots = canvas?.parentElement?.querySelectorAll(':scope > div') ?? [];
  return Array.from(roots).flatMap((root) => Array.from(root.children) as HTMLDivElement[]);
}

describe('DebugZoneOverlay', () => {
  it('draws nothing while this VirtualCamera is not the active one', async () => {
    await createAttached(
      <Klipp>
        <VirtualCamera name="winner" priority={20} />
        <VirtualCamera name="loser" priority={10}>
          <DebugZoneOverlay zones={[{ screenPosition: [0, 0], size: [0.4, 0.4], className: 'klipp-debug-deadzone' }]} />
        </VirtualCamera>
      </Klipp>,
    );

    expect(readBoxes()).toHaveLength(0);
  });

  it('follows arbitration, not the blend: appears the instant a camera wins, gone the instant it loses', async () => {
    const scene = (bPriority: number) => (
      <Klipp defaultBlend={{ curve: BlendCurves.linear, time: 2 }}>
        <VirtualCamera name="a" priority={10}>
          <DebugZoneOverlay zones={[{ screenPosition: [0, 0], size: [0.4, 0.4], className: 'klipp-debug-deadzone' }]} />
        </VirtualCamera>
        <VirtualCamera name="b" priority={bPriority}>
          <DebugZoneOverlay zones={[{ screenPosition: [0, 0], size: [0.4, 0.4], className: 'klipp-debug-hardlimit' }]} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await createAttached(scene(5));
    await renderer.advanceFrames(1, 0.05); // 'a' is first-ever: wins immediately, no blend
    expect(readBoxes()).toHaveLength(1);
    expect(readBoxes()[0].className).toBe('klipp-debug-deadzone');

    await renderer.update(scene(30)); // 'b' wins priority - 2s blend into it starts
    await renderer.advanceFrames(1, 0.5); // mid-blend: 'b' already on screen, 'a' still visually present too
    expect(readBoxes()).toHaveLength(1); // but the debug gizmo already switched to 'b', not waiting on the blend
    expect(readBoxes()[0].className).toBe('klipp-debug-hardlimit');
  });

  it('draws one box per zone once active, positioned/sized from screenPosition + size, tagged with its className', async () => {
    const renderer = await createAttached(
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <DebugZoneOverlay
            zones={[
              { screenPosition: [0, 0], size: [0.4, 0.4], className: 'klipp-debug-deadzone' },
              { screenPosition: [0.5, 0], size: [0.2, 0.6], className: 'klipp-debug-hardlimit' },
            ]}
          />
        </VirtualCamera>
      </Klipp>,
    );
    await renderer.advanceFrames(1, 0.1);

    const boxes = readBoxes();
    expect(boxes).toHaveLength(2);

    // zone 1: screenPosition [0,0], size [0.4,0.4] -> half-width/height 0.2 NDC = 10% each side of center
    expect(boxes[0].className).toBe('klipp-debug-deadzone');
    expect(boxes[0].style.left).toBe('40%');
    expect(boxes[0].style.width).toBe('20%');
    expect(boxes[0].style.top).toBe('40%');
    expect(boxes[0].style.height).toBe('20%');

    // zone 2: screenPosition [0.5,0], size [0.2,0.6] -> centered at 75% horizontally, 10% wide;
    // vertically centered at 50% (screenPosition[1]=0), 30% tall
    expect(boxes[1].className).toBe('klipp-debug-hardlimit');
    expect(boxes[1].style.left).toBe('70%');
    expect(boxes[1].style.width).toBe('10%');
    expect(boxes[1].style.top).toBe('35%');
    expect(boxes[1].style.height).toBe('30%');
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

  it('draws nothing when zones is empty', async () => {
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

  it('draws no crosshair when omitted', async () => {
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

  it('draws a full-viewport vertical + horizontal line at the crosshair screenPosition', async () => {
    const renderer = await createAttached(
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <DebugZoneOverlay zones={[]} crosshair={[0.5, -0.5]} />
        </VirtualCamera>
      </Klipp>,
    );
    await renderer.advanceFrames(1, 0.1);

    const lines = readBoxes();
    expect(lines).toHaveLength(2);

    // vertical line: fixed X (screenPosition[0]=0.5 -> 75%), full height, 1px wide
    expect(lines[0].className).toBe('klipp-debug-crosshair');
    expect(lines[0].style.left).toBe('75%');
    expect(lines[0].style.top).toBe('0px');
    expect(lines[0].style.bottom).toBe('0px');
    expect(lines[0].style.width).toBe('1px');

    // horizontal line: fixed Y (screenPosition[1]=-0.5, Y-inverted -> 75%), full width, 1px tall
    expect(lines[1].className).toBe('klipp-debug-crosshair');
    expect(lines[1].style.top).toBe('75%');
    expect(lines[1].style.left).toBe('0px');
    expect(lines[1].style.right).toBe('0px');
    expect(lines[1].style.height).toBe('1px');
  });

  it('draws the crosshair alongside zone boxes, not instead of them', async () => {
    const renderer = await createAttached(
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <DebugZoneOverlay
            zones={[{ screenPosition: [0, 0], size: [0.4, 0.4], className: 'klipp-debug-deadzone' }]}
            crosshair={[0, 0]}
          />
        </VirtualCamera>
      </Klipp>,
    );
    await renderer.advanceFrames(1, 0.1);

    expect(readBoxes()).toHaveLength(3); // 1 zone box + 2 crosshair lines
  });
});
