import { raceStartSignal } from "../../shared/race-start.js";

/**
 * READY · 3 · 2 · 1 · GO! in the sticker style, driven by the same server
 * clock as the gantry lights and start beeps inside the 3D scene.
 */
export function StartSignal({ startsAt, now, className = "" }) {
  const signal = raceStartSignal(startsAt, now);
  if (!signal.label) return null;
  return (
    <div className={`start-signal ${signal.step === 4 ? "start-signal--go" : ""} ${className}`} role="status" aria-live="polite">
      <span className="start-signal__label" key={signal.label}>{signal.label}</span>
    </div>
  );
}
