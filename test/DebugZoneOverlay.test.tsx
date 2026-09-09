import { create } from '@react-three/test-renderer';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
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

function readBoxes(): HTMLDivElement[] {
  const canvas = document.querySelector('canvas');
  const root = canvas?.parentElement?.querySelector('div');
  return root ? (Array.from(root.children) as HTMLDivElement[]) : [];
}

describe('DebugZoneOverlay', () => {
  it('draws nothing while this VirtualCamera is not the live one', async () => {
    await createAttached(
      <Klipp>
        <VirtualCamera name="winner" priority={20} />
        <VirtualCamera name="loser" priority={10}>
          <DebugZoneOverlay zones={[{ screenPosition: [0, 0], size: [0.4, 0.4], color: 'lime' }]} />
        </VirtualCamera>
      </Klipp>,
    );

    expect(readBoxes()).toHaveLength(0);
  });

  it('draws one bordered box per zone once live, positioned/sized from screenPosition + size', async () => {
    const renderer = await createAttached(
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <DebugZoneOverlay
            zones={[
              { screenPosition: [0, 0], size: [0.4, 0.4], color: 'lime' },
              { screenPosition: [0.5, 0], size: [0.2, 0.6], color: 'red' },
            ]}
          />
        </VirtualCamera>
      </Klipp>,
    );
    await renderer.advanceFrames(1, 0.1);

    const boxes = readBoxes();
    expect(boxes).toHaveLength(2);

    // zone 1: screenPosition [0,0], size [0.4,0.4] -> half-width/height 0.2 NDC = 10% each side of center
    expect(boxes[0].style.left).toBe('40%');
    expect(boxes[0].style.width).toBe('20%');
    expect(boxes[0].style.top).toBe('40%');
    expect(boxes[0].style.height).toBe('20%');
    expect(boxes[0].style.border).toContain('lime');

    // zone 2: screenPosition [0.5,0], size [0.2,0.6] -> centered at 75% horizontally, 10% wide;
    // vertically centered at 50% (screenPosition[1]=0), 30% tall
    expect(boxes[1].style.left).toBe('70%');
    expect(boxes[1].style.width).toBe('10%');
    expect(boxes[1].style.top).toBe('35%');
    expect(boxes[1].style.height).toBe('30%');
    expect(boxes[1].style.border).toContain('red');
  });

  it('removes its root element on unmount', async () => {
    const renderer = await createAttached(
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <DebugZoneOverlay zones={[{ screenPosition: [0, 0], size: [0.4, 0.4], color: 'lime' }]} />
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

    // vertical line: fixed X (screenPosition[0]=0.5 -> 75%), full height
    expect(lines[0].style.left).toBe('75%');
    expect(lines[0].style.top).toBe('0px');
    expect(lines[0].style.bottom).toBe('0px');
    expect(lines[0].style.width).toBe('1px');

    // horizontal line: fixed Y (screenPosition[1]=-0.5, Y-inverted -> 75%), full width
    expect(lines[1].style.top).toBe('75%');
    expect(lines[1].style.left).toBe('0px');
    expect(lines[1].style.right).toBe('0px');
    expect(lines[1].style.height).toBe('1px');
  });

  it('draws the crosshair alongside zone boxes, not instead of them', async () => {
    const renderer = await createAttached(
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <DebugZoneOverlay zones={[{ screenPosition: [0, 0], size: [0.4, 0.4], color: 'lime' }]} crosshair={[0, 0]} />
        </VirtualCamera>
      </Klipp>,
    );
    await renderer.advanceFrames(1, 0.1);

    expect(readBoxes()).toHaveLength(3); // 1 zone box + 2 crosshair lines
  });
});
