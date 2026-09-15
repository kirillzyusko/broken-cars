// Keep one context across host screens so a lobby gesture also unlocks races.
let context;
export function kartAudioContext() {
  const AudioContext = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!context || context.state === "closed") context = new AudioContext({ latencyHint: "interactive" });
  return context;
}
export function unlockKartAudio() {
  const audio = kartAudioContext();
  if (audio && audio.state !== "running") audio.resume().catch(() => {});
  return audio;
}
