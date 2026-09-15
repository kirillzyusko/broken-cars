import { sampleTrack } from "../shared/track-world.js";
import { CAR_SIZE_WORLD, DISTANCE_TO_WORLD } from "../shared/race-config.js";

// Presentation only: the server's positions, finishing order and scores stay fixed.
export function resultsLapPose(distance, index, seconds) {
  const pose = sampleTrack(distance * DISTANCE_TO_WORLD - index * 2.8 + seconds * 7);
  const lane = index % 2 === 0 ? -0.6 : 0.6;
  return { ...pose, x: pose.x - pose.forward.z * lane,
    y: pose.y + CAR_SIZE_WORLD.y / 2, z: pose.z + pose.forward.x * lane };
}
