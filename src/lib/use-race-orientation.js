import { useCallback, useEffect, useRef, useState } from "react";

export function useRaceOrientation() {
  const [portrait, setPortrait] = useState(() => window.matchMedia("(orientation: portrait)").matches);
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const session = useRef(null);

  useEffect(() => {
    const state = { active: true, ownsFullscreen: false, locked: false };
    session.current = state;
    const media = window.matchMedia("(orientation: portrait)");
    const changed = () => setPortrait(media.matches);
    const fullscreenChanged = () => setFullscreen(Boolean(document.fullscreenElement));
    media.addEventListener("change", changed);
    document.addEventListener("fullscreenchange", fullscreenChanged);
    return () => {
      state.active = false;
      media.removeEventListener("change", changed);
      document.removeEventListener("fullscreenchange", fullscreenChanged);
      if (state.locked) { try { window.screen.orientation.unlock(); } catch {} }
      if (state.ownsFullscreen && document.fullscreenElement === document.documentElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  const enterLandscape = useCallback(async () => {
    const state = session.current;
    if (!state?.active) return;
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        if (!state.active) { await document.exitFullscreen(); return; }
        state.ownsFullscreen = true;
      }
      if (window.screen.orientation?.lock) {
        await window.screen.orientation.lock("landscape");
        if (!state.active) { window.screen.orientation.unlock(); return; }
        state.locked = true;
      }
    } catch {
      // Browsers without orientation locking use the rotate-phone gate.
    }
  }, []);

  return { portrait, fullscreen, enterLandscape };
}
