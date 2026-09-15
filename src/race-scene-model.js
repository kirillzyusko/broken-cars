import track from "./corsica-track.json" with { type: "json" };

import {
  CAR_SIZE_WORLD, CAR_FRONT_AXLE_OFFSET_WORLD, DISTANCE_TO_WORLD,
  ROAD_HALF_WIDTH, ROAD_WORLD_LENGTH, carPositionToWorld,
  obstaclePositionToWorld, obstacleSizeToWorld,
} from "../shared/race-config.js";

export { DISTANCE_TO_WORLD, ROAD_HALF_WIDTH, ROAD_WORLD_LENGTH };
export const CAR_HEIGHT = CAR_SIZE_WORLD.y;

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

function circuitTransform(position) {
  const pose = sampleTrack(-position.z);
  return {
    x: pose.x - pose.forward.z * position.x,
    y: pose.y + position.y,
    z: pose.z + pose.forward.x * position.x,
    yaw: pose.yaw,
    forward: pose.forward,
  };
}

export function carWorldTransform(car, index = 0, carCount = 1) {
  const pose = circuitTransform(carPositionToWorld(car, index, carCount));
  return { ...pose, yaw: pose.yaw - (car.heading ?? 0) };
}

export function frontAxleWorldPosition(position, yawDegrees) {
  const radians = yawDegrees * Math.PI / 180;
  return {
    x: position.x - Math.sin(radians) * CAR_FRONT_AXLE_OFFSET_WORLD,
    y: position.y,
    z: position.z - Math.cos(radians) * CAR_FRONT_AXLE_OFFSET_WORLD,
  };
}

export function raceObstaclesFromRoom(room) {
  return (room?.obstacles ?? []).map((obstacle) => ({
    ...obstacle,
    position: circuitTransform(obstaclePositionToWorld(obstacle)),
    size: obstacleSizeToWorld(obstacle),
  }));
}

export function raceCarsFromRoom(room, currentPlayerId = null) {
  if (!room?.players) return [];
  const racers = room.players.filter((player) => player.car);
  return racers.map((player, index) => ({
    id: player.id,
    name: player.name,
    color: player.car.color,
    defectIds: [...(player.car.defectIds ?? player.car.defects?.map((defect) => defect.id) ?? [])],
    distance: player.car.distance,
    lane: player.car.lane ?? 0,
    speed: player.car.speed,
    velocityX: player.car.velocityX ?? 0,
    velocityZ: player.car.velocityZ ?? player.car.speed,
    heading: player.car.heading ?? 0,
    steeringAngle: player.car.steeringAngle ?? 0,
    angularVelocity: player.car.angularVelocity ?? 0,
    massKg: player.car.massKg ?? 1_000,
    collisionCount: player.car.collisionCount ?? 0,
    lastCollision: player.car.lastCollision ?? null,
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
