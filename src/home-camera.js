// The home screen's attract reel: a loop of slow broadcast-style shots over
// Corsica GP, cut hard between shots like a race intro package. Every shot is
// a pure function of reel time, so the reel is deterministic and testable.
import { sampleTrack } from "../shared/track-world.js";
import track from "./corsica-track.json" with { type: "json" };

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const smoothstep = (t) => { const s = clamp(t, 0, 1); return s * s * (3 - 2 * s); };
const mix = (a, b, amount) => a + (b - a) * amount;
const mixPoint = (a, b, amount) => ({ x: mix(a.x, b.x, amount), y: mix(a.y, b.y, amount), z: mix(a.z, b.z, amount) });
const degrees = Math.PI / 180;

export const ISLAND_CENTER = Object.freeze(track.points.reduce(
  (sum, point) => ({ x: sum.x + point[0] / track.points.length, z: sum.z + point[2] / track.points.length }),
  { x: 0, z: 0 },
));

// Distances are metres along the lap, angles are degrees, times are seconds.
// Low shots ask for `clearance`, so scenery between the lens and its subject
// moves the camera in rather than letting it clip through a tree or a wall.
export const HOME_SHOTS = Object.freeze([
  // An establishing orbit: high and slow around the whole island.
  { kind: "orbit", duration: 14, radius: 190, height: 78, from: 205, sweep: 34, fov: 44 },
  // A helicopter pass down the start straight and through the first corners.
  { kind: "flyover", duration: 16, start: -30, speed: 11, height: 8, back: 14, ahead: 26, fov: 56, clearance: true },
  // A crane shot: rise from beside the road at the far end of the island.
  { kind: "crane", duration: 12, at: 250, side: -8, ahead: 28, rise: 40, pullBack: 55, fov: 52, clearance: true },
  // A second pass through the back half of the lap.
  { kind: "flyover", duration: 16, start: 300, speed: 11, height: 9, back: 14, ahead: 26, fov: 56, clearance: true },
  // A closing orbit from the far side, a touch lower.
  { kind: "orbit", duration: 14, radius: 170, height: 60, from: 30, sweep: 30, fov: 48 },
]);

export const HOME_REEL_DURATION = HOME_SHOTS.reduce((sum, shot) => sum + shot.duration, 0);

/** Which shot plays at `time`, with the seconds elapsed inside it. */
export function homeShotAt(time) {
  let elapsed = ((time % HOME_REEL_DURATION) + HOME_REEL_DURATION) % HOME_REEL_DURATION;
  for (let index = 0; index < HOME_SHOTS.length; index++) {
    const shot = HOME_SHOTS[index];
    if (elapsed < shot.duration) return { shot, index, elapsed, progress: elapsed / shot.duration };
    elapsed -= shot.duration;
  }
  // Floating point can land a hair past the last shot; hold its final frame.
  const index = HOME_SHOTS.length - 1;
  return { shot: HOME_SHOTS[index], index, elapsed: HOME_SHOTS[index].duration, progress: 1 };
}

function orbitShot(shot, progress) {
  const angle = (shot.from + shot.sweep * progress) * degrees;
  return {
    position: { x: ISLAND_CENTER.x + Math.sin(angle) * shot.radius, y: shot.height, z: ISLAND_CENTER.z + Math.cos(angle) * shot.radius },
    target: { x: ISLAND_CENTER.x, y: 4, z: ISLAND_CENTER.z },
  };
}

function flyoverShot(shot, elapsed) {
  const distance = shot.start + shot.speed * elapsed;
  const eye = sampleTrack(distance - shot.back);
  const look = sampleTrack(distance + shot.ahead);
  return {
    position: { x: eye.x, y: eye.y + shot.height, z: eye.z },
    target: { x: look.x, y: look.y + 0.8, z: look.z },
  };
}

function craneShot(shot, progress) {
  const eased = smoothstep(progress);
  const base = sampleTrack(shot.at);
  // Positive `side` is the right-hand verge in the direction of travel.
  const right = { x: -base.forward.z, z: base.forward.x };
  const low = { x: base.x + right.x * shot.side, y: base.y + 2.2, z: base.z + right.z * shot.side };
  const high = {
    x: low.x + right.x * shot.side * 1.5 - base.forward.x * shot.pullBack,
    y: base.y + shot.rise,
    z: low.z + right.z * shot.side * 1.5 - base.forward.z * shot.pullBack,
  };
  const near = sampleTrack(shot.at + shot.ahead);
  const far = sampleTrack(shot.at + shot.ahead * 2.5);
  return {
    position: mixPoint(low, high, eased),
    target: mixPoint({ x: near.x, y: near.y + 0.8, z: near.z }, { x: far.x, y: far.y + 2, z: far.z }, eased),
  };
}

/** The framing at reel `time`: where the camera is, what it looks at, and its lens. */
export function homeCameraShot(time) {
  const { shot, index, elapsed, progress } = homeShotAt(time);
  const frame = shot.kind === "orbit" ? orbitShot(shot, progress)
    : shot.kind === "flyover" ? flyoverShot(shot, elapsed)
    : craneShot(shot, progress);
  return { ...frame, fov: shot.fov, clearance: !!shot.clearance, index, progress };
}

// A frozen frame for viewers who prefer reduced motion: the establishing shot, midway.
export const HOME_STILL_TIME = HOME_SHOTS[0].duration / 2;

// On a wide screen the title card sits on the left, so every shot frames its
// subject this far across the picture instead of behind the card.
export const HOME_SUBJECT_FRAME_X = 0.66;
export const HOME_WIDE_ASPECT = 1.2;

/**
 * How far to turn the camera left, in degrees, after aiming it at the subject
 * so the subject lands `frameX` of the way across a picture with this vertical
 * `fov` and `aspect`. Narrow screens keep the card centred and get no turn.
 */
export function frameOffsetYaw(fov, aspect, frameX = HOME_SUBJECT_FRAME_X) {
  if (!(aspect >= HOME_WIDE_ASPECT)) return 0;
  const halfWidth = Math.tan(fov / 2 * degrees) * aspect;
  return Math.atan((2 * frameX - 1) * halfWidth) / degrees;
}

/**
 * Advance the reel by `dt` seconds. `raycast(start, end)` answers with
 * `{ hitFraction }` when static scenery blocks the view from the subject to
 * the lens; low shots then move the camera in front of the obstruction.
 * `still` holds the establishing frame instead of moving.
 */
export function updateHomeCamera(previous, dt, { raycast, still = false } = {}) {
  const time = still ? HOME_STILL_TIME : (previous?.time ?? 0) + Math.max(0, dt);
  const frame = homeCameraShot(time);
  const { target } = frame;
  let { position } = frame;
  const hit = frame.clearance ? raycast?.(target, position) : null;
  if (hit) position = mixPoint(target, position, clamp(hit.hitFraction - 0.04, 0.05, 1));
  position = { ...position, y: Math.max(position.y, 1.2) };
  return {
    time, position, target, fov: frame.fov, index: frame.index, progress: frame.progress,
    cut: !previous || frame.index !== previous.index,
  };
}
