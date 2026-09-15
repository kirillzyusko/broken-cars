import track from "./corsica-track.json" with { type: "json" };

export const ROAD_HALF_WIDTH = track.roadHalfWidth;
export const ROAD_WORLD_LENGTH = track.lapLength;
export const DISTANCE_TO_WORLD = track.lapLength / track.serverRaceDistance;
export const CAR_HEIGHT = 0.7;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Distances are measured along the closed centerline, including behind the grid.
export function sampleTrack(distance) {
  const s = ((distance % ROAD_WORLD_LENGTH) + ROAD_WORLD_LENGTH) % ROAD_WORLD_LENGTH;
  let low = 0;
  let high = track.distances.length - 1;
  while (low + 1 < high) {
    const mid = (low + high) >>> 1;
    if (track.distances[mid] <= s) low = mid;
    else high = mid;
  }
  const a = track.points[low];
  const b = track.points[high];
  const t = (s - track.distances[low]) / (track.distances[high] - track.distances[low]);
  const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const forward = { x: (b[0] - a[0]) / length, z: (b[2] - a[2]) / length };
  return {
    x: a[0] + (b[0] - a[0]) * t,
    y: a[1] + (b[1] - a[1]) * t,
    z: a[2] + (b[2] - a[2]) * t,
    forward,
    yaw: Math.atan2(-forward.x, -forward.z) * 180 / Math.PI,
  };
}

export function carWorldTransform(car, index = 0, carCount = 1) {
  // Ease the stagger out early so all racers cross the line at server distance 500.
  const gridOffset = (4 + Math.floor(index / 2) * 3) * Math.max(0, 1 - car.distance / 40);
  const pose = sampleTrack(car.distance * DISTANCE_TO_WORLD - gridOffset);
  const column = carCount > 1 ? (index % 2 === 0 ? -0.9 : 0.9) : 0;
  const lane = clamp(column + (car.lane ?? 0) * 1.35, -ROAD_HALF_WIDTH + 0.8, ROAD_HALF_WIDTH - 0.8);
  return {
    x: pose.x - pose.forward.z * lane,
    y: pose.y + CAR_HEIGHT / 2 + 0.04,
    z: pose.z + pose.forward.x * lane,
    yaw: pose.yaw,
    forward: pose.forward,
  };
}

export function raceCarsFromRoom(room, currentPlayerId = null) {
  if (!room?.players) return [];
  const racers = room.players.filter((player) => player.car);
  return racers.map((player, index) => ({
    id: player.id,
    name: player.name,
    color: player.car.color,
    distance: player.car.distance,
    lane: player.car.lane ?? 0,
    speed: player.car.speed,
    rank: player.car.rank,
    index,
    carCount: racers.length,
    isCurrent: player.id === currentPlayerId,
    position: carWorldTransform(player.car, index, racers.length),
  }));
}

export function smoothingFactor(deltaSeconds, responsiveness = 12) {
  return 1 - Math.exp(-Math.max(0, deltaSeconds) * responsiveness);
}
