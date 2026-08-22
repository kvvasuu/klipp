import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../src/CameraState';
import { BlendCurves } from '../../src/blend/BlendCurves';
import { Sequencer, type SequencerInstruction } from '../../src/groups/Sequencer';

function stateAt(x: number): ReturnType<typeof createCameraState> {
  const state = createCameraState();
  state.position.set(x, 0, 0);
  return state;
}

function instructionAt(
  cameraId: string,
  x: number,
  hold: number,
  blend?: SequencerInstruction['blend'],
): SequencerInstruction {
  return { cameraId, state: stateAt(x), hold, blend };
}

describe('Sequencer', () => {
  it('rejects an empty instruction list', () => {
    expect(() => new Sequencer([])).toThrow();
  });

  it('starts on the first instruction, no blend', () => {
    const sequencer = new Sequencer([instructionAt('a', 1, 1), instructionAt('b', 2, 1)]);
    const out = sequencer.tick(0);

    expect(sequencer.currentCameraId).toBe('a');
    expect(sequencer.currentIndex).toBe(0);
    expect(sequencer.isBlending).toBe(false);
    expect(out.position.x).toBe(1);
  });

  it('holds until its duration elapses, then blends to the next instruction over the configured time', () => {
    const sequencer = new Sequencer(
      [instructionAt('a', 0, 1, { curve: BlendCurves.linear, time: 1 }), instructionAt('b', 10, 1)],
      { defaultBlend: { curve: BlendCurves.linear, time: 1 } },
    );
    sequencer.tick(0);

    sequencer.tick(0.5); // still holding, 0.5s < 1s hold
    expect(sequencer.currentCameraId).toBe('a');
    expect(sequencer.isBlending).toBe(false);

    sequencer.tick(0.5); // hold elapses this tick, blend starts (not yet advanced)
    expect(sequencer.isBlending).toBe(true);
    expect(sequencer.currentCameraId).toBe('a');

    expect(sequencer.tick(0.5).position.x).toBeCloseTo(5, 10);
    const out = sequencer.tick(0.5);
    expect(out.position.x).toBeCloseTo(10, 10);
    expect(sequencer.isBlending).toBe(false);
    expect(sequencer.currentCameraId).toBe('b');
  });

  it("uses the instruction's own blend when given, falling back to defaultBlend otherwise", () => {
    const sequencer = new Sequencer(
      [instructionAt('a', 0, 1, { curve: BlendCurves.cut, time: 0 }), instructionAt('b', 10, 1)],
      {
        defaultBlend: { curve: BlendCurves.linear, time: 1 },
      },
    );
    sequencer.tick(0);
    sequencer.tick(1); // hold elapses, cut blend starts

    const out = sequencer.tick(0.001); // cut resolves within the same tick it advances
    expect(sequencer.isBlending).toBe(false);
    expect(sequencer.currentCameraId).toBe('b');
    expect(out.position.x).toBeCloseTo(10, 10);
  });

  it('the blend target is tracked live — a mock camera that moves mid-blend pulls the output with it', () => {
    const a = instructionAt('a', 0, 1, { curve: BlendCurves.linear, time: 1 });
    const b = instructionAt('b', 10, 1);
    const sequencer = new Sequencer([a, b]);
    sequencer.tick(0);
    sequencer.tick(1); // start blend
    expect(sequencer.tick(0.5).position.x).toBeCloseTo(5, 10);

    b.state.position.x = 50;

    expect(sequencer.tick(0.5).position.x).toBeCloseTo(50, 10);
  });

  it('holds the last instruction forever when not looping', () => {
    const sequencer = new Sequencer([instructionAt('a', 0, 1), instructionAt('b', 10, 1)]);
    sequencer.tick(0);
    sequencer.tick(1);
    sequencer.tick(2); // finish blend into 'b'
    expect(sequencer.currentCameraId).toBe('b');

    sequencer.tick(1000);
    sequencer.tick(1000);
    expect(sequencer.currentCameraId).toBe('b');
    expect(sequencer.currentIndex).toBe(1);
    expect(sequencer.isBlending).toBe(false);
  });

  it("loop: wraps back to the first instruction after the last one's hold elapses", () => {
    const sequencer = new Sequencer(
      [instructionAt('a', 0, 1), instructionAt('b', 10, 1, { curve: BlendCurves.cut, time: 0 })],
      {
        loop: true,
      },
    );
    sequencer.tick(0);
    sequencer.tick(1);
    sequencer.tick(2); // land on 'b'
    expect(sequencer.currentCameraId).toBe('b');

    sequencer.tick(1); // 'b' holds for 1s too, then its own cut blend fires back to 'a'
    const out = sequencer.tick(0.001);

    expect(sequencer.currentCameraId).toBe('a');
    expect(out.position.x).toBeCloseTo(0, 10);
  });
});
