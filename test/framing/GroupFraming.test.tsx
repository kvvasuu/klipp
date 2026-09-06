import { create } from '@react-three/test-renderer';
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { GroupFraming } from '../../src/framing/GroupFraming';
import { Klipp } from '../../src/Klipp';
import { VirtualCamera } from '../../src/VirtualCamera';

function readBoxColors(): string[] {
  const canvas = document.querySelector('canvas');
  const root = canvas?.parentElement?.querySelector('div');
  return root ? Array.from(root.children).map((el) => (el as HTMLDivElement).style.borderColor) : [];
}

describe('GroupFraming (React wrapper)', () => {
  describe('debug', () => {
    it('draws nothing (default false)', async () => {
      const renderer = await create(
        <Klipp>
          <VirtualCamera name="a" priority={10}>
            <GroupFraming members={[{ target: new Vector3(0, 0, -10), radius: 1 }]} padding={1} />
          </VirtualCamera>
        </Klipp>,
        { beforeReturn: (canvas: HTMLCanvasElement) => document.body.appendChild(canvas) },
      );
      await renderer.advanceFrames(1, 0.1);
      await renderer.advanceFrames(1, 0.1); // padding box needs a settled camera position to measure distance from

      expect(readBoxColors()).toHaveLength(0);
      document.body.replaceChildren();
    });

    it('draws a padding box once true and a member resolves', async () => {
      const renderer = await create(
        <Klipp>
          <VirtualCamera name="a" priority={10}>
            <GroupFraming members={[{ target: new Vector3(0, 0, -10), radius: 1 }]} padding={1} debug />
          </VirtualCamera>
        </Klipp>,
        { beforeReturn: (canvas: HTMLCanvasElement) => document.body.appendChild(canvas) },
      );
      await renderer.advanceFrames(1, 0.1);
      await renderer.advanceFrames(1, 0.1);

      expect(readBoxColors()).toHaveLength(1);
      document.body.replaceChildren();
    });

    it('draws nothing when no member resolves, even with debug on', async () => {
      const renderer = await create(
        <Klipp>
          <VirtualCamera name="a" priority={10}>
            <GroupFraming members={[]} padding={1} debug />
          </VirtualCamera>
        </Klipp>,
        { beforeReturn: (canvas: HTMLCanvasElement) => document.body.appendChild(canvas) },
      );
      await renderer.advanceFrames(1, 0.1);
      await renderer.advanceFrames(1, 0.1);

      expect(readBoxColors()).toHaveLength(0);
      document.body.replaceChildren();
    });
  });
});
