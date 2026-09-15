import {
  CAR_FRONT_AXLE_OFFSET_WORLD,
  DISTANCE_TO_WORLD,
  ROAD_HALF_WIDTH,
  ROAD_WORLD_LENGTH,
  carPositionToWorld,
  obstaclePositionToWorld,
  obstacleSizeToWorld,
} from "../shared/race-config.js";

export { DISTANCE_TO_WORLD, ROAD_HALF_WIDTH, ROAD_WORLD_LENGTH };

export function carWorldTransform(car, index, carCount) {
  return carPositionToWorld(car, index, carCount);
}

export function frontAxleWorldPosition(position, yawDegrees) {
  const yawRadians = yawDegrees * Math.PI / 180;
  return {
    x: position.x - Math.sin(yawRadians) * CAR_FRONT_AXLE_OFFSET_WORLD,
    y: position.y,
    z: position.z - Math.cos(yawRadians) * CAR_FRONT_AXLE_OFFSET_WORLD,
  };
}

export function raceObstaclesFromRoom(room) {
  return (room?.obstacles ?? []).map((obstacle) => ({
    ...obstacle,
    position: obstaclePositionToWorld(obstacle),
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
    distance: player.car.distance,
    speed: player.car.speed,
    velocityX: player.car.velocityX ?? 0,
    velocityZ: player.car.velocityZ ?? player.car.speed,
    heading: player.car.heading ?? 0,
    steeringAngle: player.car.steeringAngle ?? 0,
    angularVelocity: player.car.angularVelocity ?? 0,
    massKg: player.car.massKg ?? 1_000,
    rank: player.car.rank,
    collisionCount: player.car.collisionCount ?? 0,
    lastCollision: player.car.lastCollision ?? null,
    isCurrent: player.id === currentPlayerId,
    position: carWorldTransform(player.car, index, racers.length),
  }));
}

export function smoothingFactor(deltaSeconds, responsiveness = 12) {
  return 1 - Math.exp(-Math.max(0, deltaSeconds) * responsiveness);
}
