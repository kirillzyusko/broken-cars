import { carWorldTransform, circuitTransform } from "../shared/track-world.js";
export { carWorldTransform, sampleTrack } from "../shared/track-world.js";

import {
  CAR_SIZE_WORLD, CAR_FRONT_AXLE_OFFSET_WORLD, DISTANCE_TO_WORLD,
  ROAD_HALF_WIDTH, ROAD_WORLD_LENGTH, carPositionToWorld,
  obstaclePositionToWorld, obstacleSizeToWorld,
} from "../shared/race-config.js";

export { DISTANCE_TO_WORLD, ROAD_HALF_WIDTH, ROAD_WORLD_LENGTH };
export const CAR_HEIGHT = CAR_SIZE_WORLD.y;

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
    worldPosition: player.car.worldPosition ? { ...player.car.worldPosition } : null,
    resetVersion: player.car.resetVersion ?? 0,
    distance: player.car.distance,
    lane: player.car.lane ?? 0,
    speed: player.car.speed,
    throttle: player.car.throttle,
    braking: player.car.braking ?? false,
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
