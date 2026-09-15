import { useFitScale } from "../lib/use-fit-scale.js";

export function TvStage({ children }) {
  const scale = useFitScale(1920, 1080);
  return (
    <div className="tv-viewport">
      <div className="tv-stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

export function TvLoading({ label = "CONNECTING TO THE GARAGE…" }) {
  return (
    <div className="tv-screen tv-loading">
      <span className="tv-loading__dot" />
      <span>{label}</span>
    </div>
  );
}
