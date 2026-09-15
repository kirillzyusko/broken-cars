import { sampleTrack } from "../shared/track-world.js";
import { ROAD_WORLD_LENGTH } from "../shared/race-config.js";

export const MENU_TOUR_SECONDS = 160;
const POINT_COUNT = 160;
const points = Array.from({ length: POINT_COUNT }, (_, i) => sampleTrack(i / POINT_COUNT * ROAD_WORLD_LENGTH));

function pointAt(progress) {
  const value = ((progress % 1) + 1) % 1 * POINT_COUNT;
  const index = Math.floor(value), t = value - index;
  const p = [-1, 0, 1, 2].map((offset) => points[(index + offset + POINT_COUNT) % POINT_COUNT]);
  return Object.fromEntries(["x", "y", "z"].map((axis) => {
    const [a, b, c, d] = p.map((point) => point[axis]);
    return [axis, 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t)];
  }));
}

export function menuCameraPose(seconds) {
  const progress = seconds / MENU_TOUR_SECONDS;
  const position = pointAt(progress);
  const target = pointAt(progress + 18 / ROAD_WORLD_LENGTH);
  position.y += 12 + 2 * Math.sin(progress * Math.PI * 2);
  target.y += 2;
  return { position, target };
}
