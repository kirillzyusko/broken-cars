export const DISTANCE_TO_WORLD = 0.12;
export const ROAD_HALF_WIDTH = 6;
export const ROAD_WORLD_LENGTH = 500 * DISTANCE_TO_WORLD;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function carWorldTransform(car, index, carCount) {
  const hasStartingGrid = carCount > 1;
  const columnOffset = hasStartingGrid ? (index % 2 === 0 ? -1.35 : 1.35) : 0;
  const rowOffset = hasStartingGrid ? Math.floor(index / 2) * 2.6 : 0;

  return {
    x: clamp(columnOffset + car.lane * 3.3, -4.75, 4.75),
    y: 0.55,
    z: -car.distance * DISTANCE_TO_WORLD + rowOffset,
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
    speed: player.car.speed,
    rank: player.car.rank,
    isCurrent: player.id === currentPlayerId,
    position: carWorldTransform(player.car, index, racers.length),
  }));
}

export function smoothingFactor(deltaSeconds, responsiveness = 12) {
  return 1 - Math.exp(-Math.max(0, deltaSeconds) * responsiveness);
}
