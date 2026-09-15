import { useCallback, useEffect, useState } from "react";
import LoadingIntro from "./LoadingIntro.jsx";
import { IntroAudioContext } from "./intro-audio-context.js";

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
    return () => window.clearTimeout(timeout);
  }, [visible, reducedMotion, finish]);

  return <>
    <IntroAudioContext.Provider value={visible}>
      <div className="host-loading-content" inert={visible} aria-hidden={visible || undefined}>{children}</div>
    </IntroAudioContext.Provider>
    {visible && <LoadingIntro reducedMotion={reducedMotion} onFinish={finish} />}
  </>;
}
