import { raceStartSignal } from "../shared/race-start.js";

export default function RaceStartOverlay({ startsAt, now, startResult }) {
  const signal = raceStartSignal(startsAt, now);
  if (!signal.label) return null;
  return <div className={`race-start-overlay ${signal.step === 4 ? "race-start-go" : ""}`} role="status" aria-live="polite">
    <span key={signal.label}>{signal.label}</span>
    {signal.step === 0 && <small>Press gas just before GO for a fast start</small>}
    {signal.step === 4 && startResult && <small>{startResult === "boost" ? "Perfect start!" : "Too early! Engine stalled."}</small>}
  </div>;
}
