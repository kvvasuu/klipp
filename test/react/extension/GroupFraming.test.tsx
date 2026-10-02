import { create } from '@react-three/test-renderer';
import { createRef } from 'react';
import { Vector3 } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { Extension } from '../../../src/react/extension/Extension';
import type { GroupFramingProps } from '../../../src/react/extension/GroupFraming';
import { Klipp } from '../../../src/react/Klipp';
import { VirtualCamera } from '../../../src/react/VirtualCamera';
import type { GroupFramingExtensionThree } from '../../../src/three/extension/GroupFramingExtensionThree';
import { mountInCamera } from '../wiring';

afterEach(() => {
  document.body.replaceChildren();
});

describe('Extension.GroupFraming', () => {
  it('registers an extension that frames the group every frame', async () => {
    const mounted = await mountInCamera(
      <Extension.GroupFraming members={[{ target: new Vector3(0, 0, -10), radius: 1 }]} fitMode="rigid" />,
    );
    await mounted.frame();
    const fovRadians = (mounted.state.fov * Math.PI) / 180;
    // rigid fit of a unit sphere along the view axis, for the default vertical fov
    expect(vec3Distance(mounted.state.position, [0, 0, -10])).toBeCloseTo(1 / Math.sin(fovRadians / 2), 3);
  });

  it('passes every prop to the same extension and its group, on mount and when props change', async () => {
    const ref = createRef<GroupFramingExtensionThree>();
    const scene = (props: GroupFramingProps) => <Extension.GroupFraming ref={ref} {...props} />;
    const first: GroupFramingProps = {
      members: [{ target: new Vector3(), radius: 1 }],
      positionMode: 'groupCenter',
      padding: 1,
      damping: 0.5,
      maxSpeed: 4,
      screenPosition: [0.1, 0],
      fitMode: 'ceiling',
      minDistance: 1,
      maxDistance: 50,
      framingMode: 'horizontal',
    };
    const second: GroupFramingProps = {
      members: [{ target: new Vector3(1, 0, 0), radius: 2 }],
      positionMode: 'groupAverage',
      padding: 2,
      damping: { into: 0.2, from: 1 },
      maxSpeed: 8,
      screenPosition: [0, -0.2],
      fitMode: 'rigid',
      minDistance: 2,
      maxDistance: 20,
      framingMode: 'vertical',
    };
    const check = (props: GroupFramingProps) => {
      const { members, positionMode, ...fields } = props;
      expect(extension.group).toMatchObject({ members, positionMode });
      expect(extension).toMatchObject(fields);
    };

    const mounted = await mountInCamera(scene(first));
    const extension = ref.current!;
    check(first);

    await mounted.update(scene(second));
    expect(ref.current).toBe(extension);
    check(second);
  });

  it('stops moving the camera once unmounted', async () => {
    const target: [number, number, number] = [0, 0, -10];
    const member = { target, radius: 1 };
    const mounted = await mountInCamera(<Extension.GroupFraming members={[member]} fitMode="rigid" />);
    await mounted.frame();
    await mounted.update(null);
    const before = [...mounted.state.position];

    member.radius = 5;
    await mounted.frame();

    expect(mounted.state.position).toEqual(before);
  });

  it('draws the padding box with debug, once a member resolves', async () => {
    const boxes = () => document.querySelector('canvas')?.parentElement?.querySelector('div')?.children.length ?? 0;
    const draw = async (members: GroupFramingProps['members'], debug: boolean) => {
      const renderer = await create(
        <Klipp>
          <VirtualCamera name="a" priority={10}>
            <Extension.GroupFraming members={members} padding={1} debug={debug} />
          </VirtualCamera>
        </Klipp>,
        { beforeReturn: (canvas: HTMLCanvasElement) => document.body.appendChild(canvas) },
      );
      await renderer.advanceFrames(2, 0.1);
      const count = boxes();
      await renderer.unmount();
      document.body.replaceChildren();
      return count;
    };
    const member = [{ target: new Vector3(0, 0, -10), radius: 1 }];

    expect(await draw(member, false)).toBe(0);
    expect(await draw([], true)).toBe(0);
    expect(await draw(member, true)).toBe(1);
  });
});

function vec3Distance(a: readonly number[], b: readonly number[]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
