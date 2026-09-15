import { useCallback, useEffect, useState } from "react";
import LoadingIntro from "./LoadingIntro.jsx";
import { IntroAudioContext } from "./intro-audio-context.js";

import "./host-loading-screen.css";

// Keep client-side navigation quiet, but replay after each full page reload.
let seenInPage = false;

export default function HostLoadingScreen({ children }) {
  const [visible, setVisible] = useState(() => !seenInPage);
  const [reducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const finish = useCallback(() => {
    seenInPage = true;
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
