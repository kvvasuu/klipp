import { quat, vec3 } from 'math';
import { describe, expect, it, vi } from 'vitest';
import { createCameraState, type CameraState } from '../../src/core/CameraState';
import { BlendCurves } from '../../src/core/blend/BlendCurves';
import { BlendHints } from '../../src/core/blend/BlendHints';
import { KlippCore } from '../../src/core/KlippCore';
import { VirtualCameraCore, type CameraPiece, type CameraStateWriter } from '../../src/core/VirtualCameraCore';
import { register } from '../../src/core/internal';

describe('VirtualCameraCore', () => {
  it('runs Body, Aim, Extension and Noise in that order, with dt, into the same state', () => {
    const controller = new VirtualCameraCore('a');
    const out = createCameraState();
    controller.update(out, 0.1, false); // nothing registered yet

    controller.setBody({
      update: (state, dt) => {
        state.fov = dt * 20;
      },
    });
    controller.setAim({
      update: (state) => {
        state.fov *= 2;
      },
    });
    controller.addExtension({
      update: (state) => {
        state.fov += 100;
      },
    });
    controller.addNoise({
      update: (state) => {
        state.fov += 1;
      },
    });
    controller.update(out, 0.5, false);

    expect(out.fov).toBe(121); // ((10 * 2) + 100) + 1
  });

  it('only a literal `true` counts as still moving, not a truthy value a JavaScript piece leaks', () => {
    const camera = new VirtualCameraCore('a');
    // An expression-bodied arrow returns the assigned number.
    const leaky = (out: CameraState, dt: number) => (out.position[0] = dt);
    camera.setBody({ update: leaky as unknown as CameraStateWriter });
    expect(camera.update(createCameraState(), 0.1, false)).toBe(false);
  });

  it('reports still moving when the Body, the Aim, or any Extension or Noise does', () => {
    const bodyActive = new VirtualCameraCore('body');
    bodyActive.setBody({ update: () => true });
    expect(bodyActive.update(createCameraState(), 0.1, false)).toBe(true);

    const aimActive = new VirtualCameraCore('aim');
    aimActive.setAim({ update: () => true });
    expect(aimActive.update(createCameraState(), 0.1, false)).toBe(true);

    const extensionActive = new VirtualCameraCore('extension');
    extensionActive.addExtension({ update: () => false });
    extensionActive.addExtension({ update: () => true }); // second one active — must not be short-circuited away
    expect(extensionActive.update(createCameraState(), 0.1, false)).toBe(true);

    const noiseActive = new VirtualCameraCore('noise');
    noiseActive.addNoise({ update: () => false });
    noiseActive.addNoise({ update: () => true }); // second one reports active — must not be short-circuited away
    expect(noiseActive.update(createCameraState(), 0.1, false)).toBe(true);
  });

  describe('justActivated', () => {
    it('is forwarded unchanged to every piece', () => {
      const controller = new VirtualCameraCore('a');
      const seen: boolean[] = [];
      controller.setBody({ update: (_out, _dt, justActivated) => void seen.push(justActivated) });
      controller.setAim({ update: (_out, _dt, justActivated) => void seen.push(justActivated) });
      controller.addExtension({ update: (_out, _dt, justActivated) => void seen.push(justActivated) });
      controller.addNoise({ update: (_out, _dt, justActivated) => void seen.push(justActivated) });

      controller.update(createCameraState(), 0.1, true);
      controller.update(createCameraState(), 0.1, false);

      expect(seen).toEqual([true, true, true, true, false, false, false, false]);
    });
  });

  describe('double-registration warning', () => {
    it('warns when a second Body or Aim replaces the first', () => {
      for (const [add, message] of [
        ['setBody', /a second Body replaced the first/],
        ['setAim', /a second Aim replaced the first/],
      ] as const) {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const camera = new VirtualCameraCore('cam');
        camera[add]({ update: () => {} });
        camera[add]({ update: () => {} });

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(message));
        warn.mockRestore();
      }
    });

    it('does NOT warn for a single Body/Aim, or for stacked Extension/Noise', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const controller = new VirtualCameraCore('a');

      controller.setBody({ update: () => {} });
      controller.setAim({ update: () => {} });
      controller.addExtension({ update: () => {} });
      controller.addExtension({ update: () => {} });
      controller.addNoise({ update: () => {} });
      controller.addNoise({ update: () => {} });
      controller.addNoise({ update: () => {} });

      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('the warning message includes the current name, even if it changed after construction', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const controller = new VirtualCameraCore('original');
      controller.name = 'renamed';

      controller.setBody({ update: () => {} });
      controller.setBody({ update: () => {} });

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"renamed"'));
      warn.mockRestore();
    });
  });

  describe('events', () => {
    it('re-dispatches activated only when this camera is the incoming one', () => {
      const klipp = new KlippCore();
      const a = new VirtualCameraCore('a', { priority: 10 });
      const b = new VirtualCameraCore('b', { priority: 20 });
      const onA = vi.fn();
      const onB = vi.fn();
      a.addEventListener('activated', onA);
      b.addEventListener('activated', onB);

      klipp.add(a);
      expect(onA).toHaveBeenCalledTimes(1);
      expect(onA.mock.calls[0][0]).toMatchObject({ incoming: 'a', outgoing: null });
      expect(onB).not.toHaveBeenCalled();

      klipp.add(b);
      expect(onB).toHaveBeenCalledTimes(1);
      expect(onB.mock.calls[0][0]).toMatchObject({ incoming: 'b', outgoing: 'a' });
      expect(onA).toHaveBeenCalledTimes(1); // 'a' losing arbitration isn't its activation
    });

    it('re-dispatches deactivated only for the camera whose blend out just finished', () => {
      const klipp = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 0 } });
      const a = klipp.addCamera('a', { priority: 10 });
      const onDeactivated = vi.fn();
      a.addEventListener('deactivated', onDeactivated);

      klipp.update(0);
      klipp.addCamera('b', { priority: 20 });
      klipp.update(0);

      expect(onDeactivated).toHaveBeenCalledTimes(1);
      expect(onDeactivated.mock.calls[0][0]).toMatchObject({ outgoing: 'a' });
    });

    it('stops re-dispatching once the camera is removed', () => {
      const klipp = new KlippCore();
      const a = klipp.addCamera('a', { active: false });
      const onActivated = vi.fn();
      a.addEventListener('activated', onActivated);

      klipp.remove(a);
      klipp[register]({ id: 'a', priority: 10, state: createCameraState() });
      expect(onActivated).not.toHaveBeenCalled();
    });

    it('filters by the current name', () => {
      const klipp = new KlippCore();
      const camera = klipp.addCamera('original', { active: false });
      const onActivated = vi.fn();
      camera.addEventListener('activated', onActivated);

      camera.name = 'renamed';
      camera.active = true;
      expect(onActivated).toHaveBeenCalledTimes(1);
      expect(onActivated.mock.calls[0][0]).toMatchObject({ incoming: 'renamed' });
    });

    it('re-dispatches blendCreated to both sides of the transition, and blendFinished to the one that settled', () => {
      const klipp = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
      const a = klipp.addCamera('a', { priority: 10 });
      const c = klipp.addCamera('c', { priority: 5 });
      const created = { a: vi.fn(), b: vi.fn(), c: vi.fn() };
      const finished = { a: vi.fn(), b: vi.fn() };
      a.addEventListener('blendCreated', created.a);
      c.addEventListener('blendCreated', created.c);
      a.addEventListener('blendFinished', finished.a);
      klipp.update(0);

      const b = new VirtualCameraCore('b', { priority: 20 });
      b.addEventListener('blendCreated', created.b);
      b.addEventListener('blendFinished', finished.b);
      klipp.add(b);
      klipp.update(0);
      klipp.update(1.1);

      expect([created.a, created.b, created.c].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 0]);
      expect([finished.a, finished.b].map((fn) => fn.mock.calls.length)).toEqual([0, 1]);
    });
  });
});

/** A Body that puts the camera at a fixed point. */
const lock = (x: number): CameraPiece => ({ update: (out) => void vec3.set(out.position, x, 0, 0) });

const setup = () => {
  const klipp = new KlippCore();
  return { klipp, camera: klipp.addCamera('a', { priority: 10 }) };
};

describe('VirtualCameraCore — pieces and registration', () => {
  it('runs its Body, Aim, Extensions and Noise every frame, and stops running a removed one', () => {
    const { klipp, camera } = setup();
    const ran: string[] = [];
    camera.body = { update: () => void ran.push('body') };
    camera.aim = { update: () => void ran.push('aim') };
    const removeExtension = camera.addExtension({ update: () => void ran.push('extension') });
    const removeNoise = camera.addNoise({ update: () => void ran.push('noise') });
    klipp.update(0.1);
    removeExtension();
    removeNoise();
    klipp.update(0.1);

    expect(ran).toEqual(['body', 'aim', 'extension', 'noise', 'body', 'aim']);
  });

  it('replaces its Body through the property, and warns only when a second one is added with setBody', () => {
    const { klipp, camera } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    camera.body = lock(1);
    camera.body = lock(2);
    expect(warn).not.toHaveBeenCalled();

    const removeFirst = camera.setBody(lock(3));
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();

    removeFirst();
    expect(camera.body).toBeNull();
    klipp.update(0.1);
    expect(camera.state.position).toEqual([0, 0, 0]);
  });

  it('setBody(null) stops the current Body (real bug: it kept running)', () => {
    const { klipp, camera } = setup();
    camera.setBody(lock(1));
    camera.setBody(null);
    klipp.update(0.1);
    expect(camera.state.position).toEqual([0, 0, 0]);
  });

  it('removing a Body that was already replaced leaves the new one in place', () => {
    const { klipp, camera } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const removeOld = camera.setBody(lock(1));
    camera.setBody(lock(2));
    warn.mockRestore();

    removeOld();
    klipp.update(0.1);
    expect(camera.state.position).toEqual([2, 0, 0]);
  });

  it("starts from the KlippCore's initial state, or initialState over it, and primes its pieces from there", () => {
    const initialCameraState = createCameraState();
    initialCameraState.fov = 35;
    const klipp = new KlippCore({ initialCameraState });
    expect(klipp.addCamera('plain').state.fov).toBe(35);

    const rotation = quat.setAxisAngle(quat.create(), [0, 1, 0], 1);
    const camera = klipp.addCamera('seeded', { initialState: { position: [0, 0, 100], quaternion: rotation } });
    const primeBody = vi.fn();
    const primeAim = vi.fn();
    camera.body = { update: () => {}, primeFrom: primeBody } as CameraPiece;
    camera.aim = { update: () => {}, primeFrom: primeAim } as CameraPiece;

    expect(camera.state.fov).toBe(35);
    expect(primeBody).toHaveBeenCalledWith([0, 0, 100]);
    expect(primeAim).toHaveBeenCalledWith(rotation, [0, 1, 0]);
  });

  it('primes only pieces set before its first frame (real bug: a later Body skipped the next reactivation reset)', () => {
    const klipp = new KlippCore();
    const camera = klipp.addCamera('a', { initialState: { position: [0, 0, 100] } });
    const early = vi.fn();
    camera.body = { update: () => {}, primeFrom: early } as CameraPiece;
    klipp.update(0.1);
    const late = vi.fn();
    camera.body = { update: () => {}, primeFrom: late } as CameraPiece;

    expect(early).toHaveBeenCalledOnce();
    expect(late).not.toHaveBeenCalled();
  });

  it('turning active back on starts it fresh, like a first activation', () => {
    const { klipp, camera } = setup();
    const activations: boolean[] = [];
    camera.body = { update: (_out, _dt, justActivated) => void activations.push(justActivated) };
    klipp.update(0.1);
    klipp.update(0.1);
    camera.active = false;
    klipp.update(0.1);
    camera.active = true;
    klipp.update(0.1);

    expect(activations).toEqual([true, false, true]);
  });

  it('priority, hints and name reach the arbitration while registered', () => {
    const { klipp, camera } = setup();
    const other = klipp.addCamera('b', { priority: 5 });
    klipp.update(0.1);
    expect(klipp.activeCameraId).toBe('a');

    camera.hints = BlendHints.sphericalPosition;
    expect(klipp.state.cameras.get('a')!.hints).toBe(BlendHints.sphericalPosition);
    other.priority = 20;
    expect(klipp.activeCameraId).toBe('b');
    other.name = 'renamed';
    expect(klipp.activeCameraId).toBe('renamed');
  });

  it('leaves the aspect of its pieces alone until a size is set', () => {
    const { klipp, camera } = setup();
    const composer = { update: () => {}, aspect: 16 / 9 };
    camera.body = composer;
    klipp.update(0.1);
    expect(composer.aspect).toBe(16 / 9);
  });

  it('passes the viewport size on to pieces that frame by it', () => {
    const { klipp, camera } = setup();
    const composer = { update: () => {}, aspect: 1 };
    const framing = { update: () => {}, viewportWidth: 1, viewportHeight: 1 };
    camera.body = composer;
    camera.addExtension(framing);
    klipp.setSize(800, 400);
    klipp.update(0.1);

    expect(composer.aspect).toBe(2);
    expect([framing.viewportWidth, framing.viewportHeight]).toEqual([800, 400]);
  });
});
