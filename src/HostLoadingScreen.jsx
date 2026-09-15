import { useCallback, useEffect, useState } from "react";

import "./host-loading-screen.css";

const SEEN_KEY = "broken-cars:host-intro-seen";
let seenInPage = false;

function hasSeenIntro() {
  if (seenInPage) return true;
  try { return sessionStorage.getItem(SEEN_KEY) === "true"; }
  catch { return false; }
}

export default function HostLoadingScreen({ children }) {
  const [visible, setVisible] = useState(() => !hasSeenIntro());
  const [reducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const finish = useCallback(() => {
    seenInPage = true;
    try { sessionStorage.setItem(SEEN_KEY, "true"); }
    catch { /* Keep working when browser storage is unavailable. */ }
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!visible) return;
    // A blocked or stalled video must not keep the host out of the game.
    const timeout = window.setTimeout(finish, reducedMotion ? 6000 : 12000);
    const escape = (event) => { if (event.key === "Escape") finish(); };
    window.addEventListener("keydown", escape);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("keydown", escape);
    };
  }, [visible, reducedMotion, finish]);

  return <>
    <div className="host-loading-content" inert={visible} aria-hidden={visible || undefined}>{children}</div>
    {visible && <div className="host-loading-screen" role="dialog" aria-modal="true" aria-label="Game intro">
      {reducedMotion
        ? <img src="/video/host-loading-poster.jpg" alt="" />
        : <video src="/video/host-loading.mp4" poster="/video/host-loading-poster.jpg"
            autoPlay muted playsInline preload="auto" disablePictureInPicture
            onEnded={finish} onError={finish} aria-hidden="true" />}
      <span className="host-loading-screen__label" role="status">Starting game…</span>
      <button className="host-loading-screen__skip" type="button" onClick={finish} autoFocus>Skip intro</button>
    </div>}
  </>;
}
