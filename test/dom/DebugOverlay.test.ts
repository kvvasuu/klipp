import { afterEach, describe, expect, it } from 'vitest';
import { DebugOverlay } from '../../src/dom/DebugOverlay';

afterEach(() => {
  document.body.replaceChildren();
});

function setup() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const overlay = new DebugOverlay();
  overlay.connect(container);
  const root = () => container.firstElementChild as HTMLDivElement | null;
  return { container, overlay, root };
}

describe('DebugOverlay', () => {
  it('adds one non-interactive root to the container on connect', () => {
    const { container, root } = setup();
    expect(container.children).toHaveLength(1);
    expect(root()!.style.pointerEvents).toBe('none');
  });

  it('injects its default stylesheet once', () => {
    setup();
    new DebugOverlay().connect(document.body);
    expect(document.querySelectorAll('#klipp-debug-zone-overlay-styles')).toHaveLength(1);
  });

  it('replaces what is drawn on every render', () => {
    const { overlay, root } = setup();
    overlay.render([{ screenPosition: [0, 0], size: [0.4, 0.4], className: 'klipp-debug-deadzone' }], [0, 0]);
    expect(root()!.children).toHaveLength(3);

    overlay.render([{ screenPosition: [0, 0], size: [0.4, 0.4], className: 'klipp-debug-hardlimit' }]);
    expect(root()!.children).toHaveLength(1);
    expect(root()!.children[0].className).toBe('klipp-debug-hardlimit');

    overlay.render([]);
    expect(root()!.children).toHaveLength(0);
  });

  it('removes its root on disconnect and ignores renders until reconnected', () => {
    const { container, overlay } = setup();
    overlay.disconnect();
    expect(container.children).toHaveLength(0);

    overlay.render([{ screenPosition: [0, 0], size: [0.4, 0.4], className: 'klipp-debug-deadzone' }]);
    expect(container.children).toHaveLength(0);
  });

  it('moves to a new container when connected again', () => {
    const { container, overlay } = setup();
    const other = document.createElement('div');
    overlay.connect(other);
    expect(container.children).toHaveLength(0);
    expect(other.children).toHaveLength(1);
  });
});
