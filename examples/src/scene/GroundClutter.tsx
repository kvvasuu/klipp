import { Instance, Instances } from '@react-three/drei';

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

/** Fixed, hand-placed boxes as a ground-level depth/parallax reference - `BaseScene`'s grid alone is often
 *  too faint, or seen edge-on from a level camera, to read motion against. Each scene picks its own
 *  positions/heights so nothing ever sits in the way of what's actually moving through it. One shared unit
 *  box, scaled per instance, so the whole set is a single draw call. */
export function GroundClutter({ boxes }: { boxes: GroundBox[] }) {
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
