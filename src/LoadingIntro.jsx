import { useEffect, useRef, useState } from "react";
import "./host-loading-screen.css";

export default function LoadingIntro({ preview = false, reducedMotion = false, onFinish }) {
  const videoRef = useRef(null);
  const [needsSound, setNeedsSound] = useState(preview);
  const [error, setError] = useState("");

  useEffect(() => {
    const video = videoRef.current;
    if (!video || preview) return;
    let active = true;
    video.play().catch(() => {
      if (!active) return;
      // Keep the intro moving when the browser requires a gesture for sound.
      video.muted = true;
      setNeedsSound(true);
      video.play().catch(() => { if (active) onFinish?.(); });
    });
    return () => { active = false; video.pause(); };
  }, [preview, reducedMotion, onFinish]);

  const replay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    video.muted = false;
    setError("");
    video.play().then(() => setNeedsSound(false)).catch(() => {
      setError("Playback could not start. Please try again.");
    });
  };

  return <div className="host-loading-screen" role={preview ? undefined : "dialog"}
    aria-modal={preview ? undefined : true} aria-label={preview ? "Loading screen preview" : "Game intro"}>
    {reducedMotion
      ? <img src="/video/host-loading-poster.jpg" alt="Game logo" />
      : <video ref={videoRef} src="/video/host-loading-sound.mp4" poster="/video/host-loading-poster.jpg"
          playsInline preload="auto" controls={preview} disablePictureInPicture
          onEnded={preview ? undefined : onFinish}
          onError={() => { setError("The intro video could not load."); if (!preview) onFinish?.(); }}
          aria-label="Game intro with sound" />}
    {preview && <header className="loading-preview-header">
      <div><h1>Loading screen</h1><p>6 seconds · Host intro with sound</p></div>
      <a href="/map/drive">Back to driving</a>
    </header>}
    {preview && <div className="loading-intro-actions loading-intro-actions--preview">
      <span role="status">{error || "Play, pause or scrub to review the timing."}</span>
      <div className="loading-intro-buttons">
        {!reducedMotion && <button type="button" onClick={replay}>
          {needsSound ? "Play with sound" : "Replay with sound"}
        </button>}
      </div>
    </div>}
  </div>;
}
