import { useContext, useEffect, useRef } from "react";
import { IntroAudioContext } from "./intro-audio-context.js";

export default function BackgroundMusic({ racing = false, results = false }) {
  const introPlaying = useContext(IntroAudioContext);
  const audioRef = useRef(null);

  const source = results ? "/audio/you-won.mp3" : racing ? "/audio/retro-roundabout.mp3" : "/audio/choose-your-racer.mp3";

  useEffect(() => {
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    if (audio.getAttribute("src") !== source) audio.src = source;
    audio.loop = true;
    audio.volume = 0.35;
    audio.preload = "auto";
    if (introPlaying) {
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
  }, [source, introPlaying]);

  return null;
}
