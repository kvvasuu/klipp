import { useThree } from '@react-three/fiber';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/** Mounts `children` as a separate DOM React root on the canvas's own parent element */
export function CanvasOverlay({ children }: { children: ReactNode }) {
  const container = useThree((state) => state.gl.domElement.parentElement);
  const [el] = useState(() => document.createElement('div'));
  const root = useRef<Root | null>(null);

  useEffect(() => {
    if (!container) return;
    container.appendChild(el);
    root.current = createRoot(el);
    return () => {
      root.current?.unmount();
      container.removeChild(el);
    };
  }, [container, el]);

  useEffect(() => {
    root.current?.render(children);
  });

  return null;
}
