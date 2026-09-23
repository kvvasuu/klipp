/** A small center-screen dot while Pointer Lock is engaged - the OS cursor is hidden then, so there's
 *  otherwise no visual reference for where you're aiming. `mix-blend-mode: difference` keeps it visible
 *  against any background, no color picking needed. */
export function Crosshair() {
  return <div className="pan-tilt-crosshair" />;
}
