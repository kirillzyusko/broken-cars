import { useEffect, useRef, useState } from "react";

export default function BackgroundMusic({ racing = false }) {
  const audioRef = useRef(null);
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem("broken-cars-music-muted") === "true"; }
    catch { return false; }
  });

  const source = racing ? "/audio/retro-roundabout.mp3" : "/audio/choose-your-racer.mp3";

  useEffect(() => {
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    if (audio.getAttribute("src") !== source) audio.src = source;
    audio.loop = true;
    audio.volume = 0.35;
    audio.preload = "auto";
    try { localStorage.setItem("broken-cars-music-muted", String(muted)); }
    catch { /* Music still works when storage is unavailable. */ }
    if (muted) {
      audio.pause();
      return;
    }
    const play = () => {
      if (audio.paused) {
        // Retry on a gesture if the browser blocks autoplay.
        audio.play().catch(() => {});
      }
    };
    play();
    window.addEventListener("pointerdown", play);
    window.addEventListener("keydown", play);
    return () => {
      window.removeEventListener("pointerdown", play);
      window.removeEventListener("keydown", play);
      audio.pause();
    };
  }, [muted, source]);

  return (
    <button className="music-toggle" type="button" aria-label={muted ? "Enable background music" : "Mute background music"}
      aria-pressed={!muted} onClick={() => setMuted((value) => !value)}>
      Music {muted ? "off" : "on"}
    </button>
  );
}
