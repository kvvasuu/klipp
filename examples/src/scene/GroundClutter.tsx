import { Instance, Instances } from '@react-three/drei';
import { clutterLayouts, type ClutterLayout } from './clutterLayouts';

export type GroundBox = {
  x: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  rotationY?: number;
  color?: string;
};

const defaultColor = '#b7b7c2';

/** Hand-placed ground boxes that give motion a visible reference, laid out per scene to stay out of the way. */
export function GroundClutter({ layout }: { layout: ClutterLayout }) {
  const boxes: GroundBox[] = clutterLayouts[layout];

  return (
    <Instances limit={boxes.length}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial />
      {boxes.map((box, i) => (
        <Instance
          key={i}
          position={[box.x, box.height / 2, box.z]}
          scale={[box.width, box.height, box.depth]}
          rotation={[0, box.rotationY ?? 0, 0]}
          color={box.color ?? defaultColor}
        />
      ))}
    </Instances>
  );
}
