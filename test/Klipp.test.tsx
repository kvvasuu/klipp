import { renderHook } from '@testing-library/react';
import { create } from '@react-three/test-renderer';
import { useThree } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { Klipp, useKlippCore } from '../src/Klipp';
import { KlippCore } from '../src/KlippCore';
import { VirtualCamera } from '../src/VirtualCamera';
import { HardLockToTarget } from '../src/body/HardLockToTarget';
import { useRef } from 'react';
import type { Object3D } from 'three';

describe('Klipp / useKlippCore', () => {
  it('throws when used outside a <Klipp> provider', () => {
    // no Canvas/renderer needed: this throws before touching anything r3f-specific
    expect(() => renderHook(() => useKlippCore())).toThrow(/within a <Klipp> provider/);
  });

  it('provides a KlippCore instance to consumers', async () => {
    let core: KlippCore | undefined;
    function Reader() {
      core = useKlippCore();
      return null;
    }

    await create(
      <Klipp>
        <Reader />
      </Klipp>,
    );

    expect(core).toBeInstanceOf(KlippCore);
  });

  it('the instance is stable across re-renders', async () => {
    const seen: KlippCore[] = [];
    function Reader() {
      seen.push(useKlippCore());
      return null;
    }

    const renderer = await create(
      <Klipp>
        <Reader />
      </Klipp>,
    );
    await renderer.update(
      <Klipp>
        <Reader />
      </Klipp>,
    );

    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
  });

  it('two separate <Klipp> trees get independent instances', async () => {
    let coreA: KlippCore | undefined;
    let coreB: KlippCore | undefined;

    await create(
      <Klipp>
        <Reader onRead={(c) => (coreA = c)} />
      </Klipp>,
    );
    await create(
      <Klipp>
        <Reader onRead={(c) => (coreB = c)} />
      </Klipp>,
    );

    expect(coreA).toBeInstanceOf(KlippCore);
    expect(coreB).toBeInstanceOf(KlippCore);
    expect(coreA).not.toBe(coreB);
  });

  it('copies the composited CameraState onto the real r3f camera — the actual end of the chain', async () => {
    let camera: PerspectiveCamera | undefined;
    function CameraReader() {
      camera = useThree((state) => state.camera as PerspectiveCamera);
      return null;
    }

    function Scene() {
      const targetRef = useRef<Object3D>(null);
      return (
        <Klipp>
          <CameraReader />
          <object3D ref={targetRef} position={[3, 4, 5]} />
          <VirtualCamera name="a" priority={10}>
            <HardLockToTarget target={targetRef} />
          </VirtualCamera>
        </Klipp>
      );
    }

    const renderer = await create(<Scene />);
    await renderer.advanceFrames(1, 0.1);

    expect(camera!.position.x).toBeCloseTo(3, 10);
    expect(camera!.position.y).toBeCloseTo(4, 10);
    expect(camera!.position.z).toBeCloseTo(5, 10);
  });
});

function Reader({ onRead }: { onRead: (core: KlippCore) => void }) {
  onRead(useKlippCore());
  return null;
}
