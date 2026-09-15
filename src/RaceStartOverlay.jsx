import { raceStartSignal } from "../shared/race-start.js";

export default function RaceStartOverlay({ startsAt, now }) {
  const signal = raceStartSignal(startsAt, now);
  if (!signal.label) return null;
  return <div className={`race-start-overlay ${signal.step === 4 ? "race-start-go" : ""}`} role="status" aria-live="polite">
    <span key={signal.label}>{signal.label}</span>
    {signal.step === 0 && <small>Get ready</small>}
  </div>;
}
