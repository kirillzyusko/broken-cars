import { updateRaceInputs, resolveRaceStart, mechanicFeedback } from "../shared/race-extras.js";
import { applyKartTuning } from "../shared/kart-tuning.js";
import { stepKart, DRIVING_STEP } from "../shared/kart-driving.js";
import { resetDriving, updateLapProgress, circuitTransform } from "../shared/track-world.js";
import { getDrivingWorld } from "./driving-world.js";
import { randomBytes } from "node:crypto";
import {
  CAR_SIZE_WORLD,
  TRACK_LENGTH_METERS,
  MAX_RACE_ROUNDS,
  TRACK_OBSTACLES,
  carPositionToWorld,
  obstaclePositionToWorld,
  obstacleSizeToWorld,
} from "../shared/race-config.js";
import { DEFECTS } from "./defects.js";

export { TRACK_LENGTH_METERS };
export const BUILD_DURATION_MS = 15_000;
export const TUNING_DURATION_MS = 30_000;
export const START_COUNTDOWN_MS = 5_000;
// A round ends as soon as the first kart finishes, or after three minutes.
export const MAX_RACE_DURATION_MS = 180_000;
export { STANDARD_MAX_SPEED_MPS } from "../shared/kart-driving.js";
export const CAR_MASS_KG = 1_000;

export function allCarPromptsSubmitted(room) {
  const players = [...room.players.values()];
  return players.length > 0 && players.every((player) => !!player.prompt);
}

const CAR_RESTITUTION = 0.2;
const CAR_CONTACT_FRICTION = 0.42;
const OBSTACLE_RESTITUTION = 0.1;
const OBSTACLE_CONTACT_FRICTION = 0.55;

const COLORS = [
  "#ff5a36",
  "#48c9b0",
  "#f7c948",
  "#a78bfa",
  "#5da9ff",
  "#ff78b7",
  "#a4d65e",
  "#ff9966",
];
export const PLAYER_COLORS = Object.freeze(["blue", "yellow", "red", "green"]);
const MAX_NAME_LENGTH = 16;
const EMPTY_CONTROLS = Object.freeze({
  accelerate: false,
  brake: false,
  left: false,
  right: false,
  stop: false,
  drift: false,
});
const DEFECT_MAP = new Map(DEFECTS.map((defect) => [defect.id, defect]));
const DEFECT_SEVERITY_ORDER = new Map([
  ["fatal", 0],
  ["critical", 1],
  ["annoying", 2],
]);

function token(bytes = 18) {
  return randomBytes(bytes).toString("base64url");
}

function roomCode() {
  return randomBytes(3).toString("hex").toUpperCase();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cleanName(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\p{C}/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
}

function carColor(index) {
  return COLORS[index % COLORS.length];
}

function createCar(player, index, defectIds) {
  const driving = {};
  resetDriving(driving, index);
  const orderedDefectIds = [...defectIds].sort((left, right) => (
    (DEFECT_SEVERITY_ORDER.get(DEFECT_MAP.get(left)?.severity) ?? Number.MAX_SAFE_INTEGER)
    - (DEFECT_SEVERITY_ORDER.get(DEFECT_MAP.get(right)?.severity) ?? Number.MAX_SAFE_INTEGER)
  ));
  return {
    ...driving,
    name: player.prompt,
    color: carColor(index),
    defectIds: orderedDefectIds,
    distance: 0,
    speed: 0,
    velocityX: 0,
    velocityZ: 0,
    lane: 0,
    heading: 0,
    steeringAngle: 0,
    angularVelocity: 0,
    massKg: CAR_MASS_KG,
    heat: 0,
    acceleratorStuck: false,
    oneWayTurn: orderedDefectIds.includes("one_way_steering")
      ? (index % 2 === 0 ? "left" : "right")
      : null,
    enginePowerIssue: orderedDefectIds.includes("bad_engine_power")
      ? (index % 2 === 0 ? "weak" : "overpowered")
      : null,
    collisionCount: 0,
    lastCollision: null,
    _lastCollisionKey: null,
    _collisionCooldownUntilMs: 0,
    finishedAtMs: null,
    rank: null,
  };
}

function resetCarForRace(car) {
  resetDriving(car, car.spawnIndex);
  car.distance = 0;
  car.speed = 0;
  car.velocityX = 0;
  car.velocityZ = 0;
  car.lane = 0;
  car.heading = 0;
  car.steeringAngle = 0;
  car.angularVelocity = 0;
  car.heat = 0;
  car.acceleratorStuck = false;
  car.collisionCount = 0;
  car.lastCollision = null;
  car._lastCollisionKey = null;
  car._collisionCooldownUntilMs = 0;
  car.finishedAtMs = null;
  car.rank = null;
  if (!car.defectIds.includes("one_way_steering")) car.oneWayTurn = null;
  if (!car.defectIds.includes("bad_engine_power")) car.enginePowerIssue = null;
}

function publicDefect(car, id) {
  const defect = DEFECT_MAP.get(id);
  if (id === "one_way_steering") {
    return {
      ...defect,
      label: `Can only turn ${car.oneWayTurn}`,
      description: `The car ignores every attempt to turn ${car.oneWayTurn === "left" ? "right" : "left"}.`,
    };
  }
  if (id === "bad_engine_power") {
    return car.enginePowerIssue === "weak"
      ? {
          ...defect,
          label: "Engine is too weak",
          description: "The engine struggles to build speed.",
        }
      : {
          ...defect,
          label: "Engine is too powerful",
          description: "Acceleration is violent and makes the car unstable.",
        };
  }
  return defect;
}

function updateCarSpeed(car) {
  car.speed = Math.hypot(car.velocityX, car.velocityZ);
}

function advanceCar(player, dt, raceElapsedMs, world) {
  if (!player.car || player.car.finishedAtMs !== null) return;
  const hit = stepKart(player.car, player.controls, dt, raceElapsedMs, world);
  if (hit?.impactSpeed > 0) registerCollision(player.car, "map", {
    type: "obstacle", targetId: "map", label: "Scenery", normal: hit.normal,
    impactSpeed: hit.impactSpeed, impulseNs: Math.round(hit.impactSpeed * player.car.massKg),
    velocityAfter: collisionSnapshot(player.car),
  }, raceElapsedMs);
}

const COLLISION_EPSILON_WORLD = 0.015;
const COLLISION_COOLDOWN_MS = 450;

function pointInsideBounds(point, bounds) {
  return point.x >= bounds.minX
    && point.x <= bounds.maxX
    && point.z >= bounds.minZ
    && point.z <= bounds.maxZ;
}

function nearestExit(point, bounds) {
  const exits = [
    { distance: Math.abs(point.x - bounds.minX), normalX: -1, normalZ: 0 },
    { distance: Math.abs(bounds.maxX - point.x), normalX: 1, normalZ: 0 },
    { distance: Math.abs(point.z - bounds.minZ), normalX: 0, normalZ: -1 },
    { distance: Math.abs(bounds.maxZ - point.z), normalX: 0, normalZ: 1 },
  ];
  return exits.reduce((nearest, exit) =>
    exit.distance < nearest.distance ? exit : nearest);
}

function sweepPointAgainstBounds(start, end, bounds) {
  if (pointInsideBounds(start, bounds)) {
    if (!pointInsideBounds(end, bounds)) return null;
    const exit = nearestExit(end, bounds);
    const contact = { ...end };
    if (exit.normalX < 0) contact.x = bounds.minX;
    if (exit.normalX > 0) contact.x = bounds.maxX;
    if (exit.normalZ < 0) contact.z = bounds.minZ;
    if (exit.normalZ > 0) contact.z = bounds.maxZ;
    return { t: 1, ...exit, contact };
  }

  let entry = 0;
  let exit = 1;
  let normalX = 0;
  let normalZ = 0;

  for (const axis of ["x", "z"]) {
    const delta = end[axis] - start[axis];
    const min = axis === "x" ? bounds.minX : bounds.minZ;
    const max = axis === "x" ? bounds.maxX : bounds.maxZ;
    if (Math.abs(delta) < 1e-9) {
      if (start[axis] < min || start[axis] > max) return null;
      continue;
    }

    let near = (min - start[axis]) / delta;
    let far = (max - start[axis]) / delta;
    const nearNormal = delta > 0 ? -1 : 1;
    if (near > far) [near, far] = [far, near];
    if (near > entry) {
      entry = near;
      normalX = axis === "x" ? nearNormal : 0;
      normalZ = axis === "z" ? nearNormal : 0;
    }
    exit = Math.min(exit, far);
    if (entry > exit) return null;
  }

  if (entry < 0 || entry > 1) return null;
  return {
    t: entry,
    normalX,
    normalZ,
    contact: {
      x: start.x + (end.x - start.x) * entry,
      z: start.z + (end.z - start.z) * entry,
    },
  };
}

function applyWorldPosition(car, index, carCount, position) {
  car.worldPosition = { x: position.x, y: car.worldPosition.y, z: position.z };
}

function registerCollision(car, key, collision, raceElapsedMs) {
  if (
    car._lastCollisionKey !== key
    || raceElapsedMs >= car._collisionCooldownUntilMs
  ) {
    car.collisionCount += 1;
    car.lastCollision = { ...collision, atMs: raceElapsedMs };
  }
  car._lastCollisionKey = key;
  car._collisionCooldownUntilMs = raceElapsedMs + COLLISION_COOLDOWN_MS;
}

function contactNormalToTrack(hit) {
  return { x: hit.normalX || 0, z: hit.normalZ || 0 };
}

function applyImpulse(car, impulseX, impulseZ) {
  car.velocityX += impulseX / car.massKg;
  car.velocityZ += impulseZ / car.massKg;
}

function collisionSnapshot(car) {
  return {
    x: Number(car.velocityX.toFixed(3)),
    z: Number(car.velocityZ.toFixed(3)),
  };
}

function resolveEqualMassImpulse(firstCar, secondCar, normal, contactOffsetWorld) {
  const relativeVelocityX = firstCar.velocityX - secondCar.velocityX;
  const relativeVelocityZ = firstCar.velocityZ - secondCar.velocityZ;
  const normalSpeed = relativeVelocityX * normal.x + relativeVelocityZ * normal.z;
  if (normalSpeed >= 0) return null;

  const inverseMassSum = 1 / firstCar.massKg + 1 / secondCar.massKg;
  const normalImpulse = -(1 + CAR_RESTITUTION) * normalSpeed / inverseMassSum;
  const tangent = { x: -normal.z, z: normal.x };
  const tangentSpeed = relativeVelocityX * tangent.x + relativeVelocityZ * tangent.z;
  const unconstrainedTangentImpulse = -tangentSpeed / inverseMassSum;
  const tangentImpulseLimit = CAR_CONTACT_FRICTION * normalImpulse;
  const tangentImpulse = clamp(
    unconstrainedTangentImpulse,
    -tangentImpulseLimit,
    tangentImpulseLimit,
  );
  const impulseX = normal.x * normalImpulse + tangent.x * tangentImpulse;
  const impulseZ = normal.z * normalImpulse + tangent.z * tangentImpulse;

  applyImpulse(firstCar, impulseX, impulseZ);
  applyImpulse(secondCar, -impulseX, -impulseZ);

  const normalizedOffset = Math.abs(normal.z) > 0.5
    ? clamp(contactOffsetWorld.x / CAR_SIZE_WORLD.x, -1, 1)
    : clamp(contactOffsetWorld.z / CAR_SIZE_WORLD.z, -1, 1);
  const spinDelta = clamp(
    normalizedOffset * normalImpulse / CAR_MASS_KG * 5,
    -120,
    120,
  );
  firstCar.angularVelocity = clamp(firstCar.angularVelocity + spinDelta, -140, 140);
  secondCar.angularVelocity = clamp(secondCar.angularVelocity - spinDelta, -140, 140);
  updateCarSpeed(firstCar);
  updateCarSpeed(secondCar);

  return {
    impactSpeed: Number((-normalSpeed).toFixed(3)),
    impulseNs: Math.round(normalImpulse),
  };
}

function resolveStaticImpulse(car, normal, normalizedOffset) {
  const normalSpeed = car.velocityX * normal.x + car.velocityZ * normal.z;
  if (normalSpeed >= 0) return null;

  const normalImpulse = -(1 + OBSTACLE_RESTITUTION) * normalSpeed * car.massKg;
  const tangent = { x: -normal.z, z: normal.x };
  const tangentSpeed = car.velocityX * tangent.x + car.velocityZ * tangent.z;
  const unconstrainedTangentImpulse = -tangentSpeed * car.massKg;
  const tangentImpulseLimit = OBSTACLE_CONTACT_FRICTION * normalImpulse;
  const tangentImpulse = clamp(
    unconstrainedTangentImpulse,
    -tangentImpulseLimit,
    tangentImpulseLimit,
  );
  applyImpulse(
    car,
    normal.x * normalImpulse + tangent.x * tangentImpulse,
    normal.z * normalImpulse + tangent.z * tangentImpulse,
  );
  car.angularVelocity = clamp(
    car.angularVelocity + normalizedOffset * normalImpulse / car.massKg * 5,
    -140,
    140,
  );
  updateCarSpeed(car);
  return {
    impactSpeed: Number((-normalSpeed).toFixed(3)),
    impulseNs: Math.round(normalImpulse),
  };
}

function expandedObstacleBounds(obstacle, car) {
  const size = obstacleSizeToWorld(obstacle);
  const yaw = circuitTransform(obstaclePositionToWorld(obstacle)).yaw;
  const angle = (car.heading + yaw) * Math.PI / 180;
  const width = Math.abs(Math.cos(angle)) * CAR_SIZE_WORLD.x + Math.abs(Math.sin(angle)) * CAR_SIZE_WORLD.z;
  const length = Math.abs(Math.sin(angle)) * CAR_SIZE_WORLD.x + Math.abs(Math.cos(angle)) * CAR_SIZE_WORLD.z;
  return { minX: -(size.x + width) / 2, maxX: (size.x + width) / 2,
    minZ: -(size.z + length) / 2, maxZ: (size.z + length) / 2 };
}
function obstacleLocal(position, obstaclePose) {
  const angle = obstaclePose.yaw * Math.PI / 180;
  const dx = position.x - obstaclePose.x, dz = position.z - obstaclePose.z;
  return { x: Math.cos(angle) * dx - Math.sin(angle) * dz, z: Math.sin(angle) * dx + Math.cos(angle) * dz };
}

function resolveObstacleCollisions(racers, previousPositions, raceElapsedMs) {
  const carCount = racers.length;
  racers.forEach((player, index) => {
    const previous = previousPositions.get(player.id);
    let current = carPositionToWorld(player.car, index, carCount);
    for (const obstacle of TRACK_OBSTACLES) {
      const obstaclePose = circuitTransform(obstaclePositionToWorld(obstacle));
      const hit = sweepPointAgainstBounds(obstacleLocal(previous, obstaclePose), obstacleLocal(current, obstaclePose), expandedObstacleBounds(obstacle, player.car));
      if (!hit) continue;
      const angle = obstaclePose.yaw * Math.PI / 180;
      const { x, z } = hit.contact;
      hit.contact = { x: obstaclePose.x + Math.cos(angle) * x + Math.sin(angle) * z,
        z: obstaclePose.z - Math.sin(angle) * x + Math.cos(angle) * z };
      const nx = hit.normalX, nz = hit.normalZ;
      hit.normalX = Math.cos(angle) * nx + Math.sin(angle) * nz;
      hit.normalZ = -Math.sin(angle) * nx + Math.cos(angle) * nz;

      const resolved = {
        x: hit.contact.x + hit.normalX * COLLISION_EPSILON_WORLD,
        z: hit.contact.z + hit.normalZ * COLLISION_EPSILON_WORLD,
      };
      applyWorldPosition(player.car, index, carCount, resolved);
      const obstaclePosition = circuitTransform(obstaclePositionToWorld(obstacle));
      const obstacleSize = obstacleSizeToWorld(obstacle);
      const normalizedOffset = Math.abs(hit.normalZ) > 0.5
        ? clamp(
            (hit.contact.x - obstaclePosition.x)
              / ((obstacleSize.x + CAR_SIZE_WORLD.x) / 2),
            -1,
            1,
          )
        : clamp(
            (hit.contact.z - obstaclePosition.z)
              / ((obstacleSize.z + CAR_SIZE_WORLD.z) / 2),
            -1,
            1,
          );
      const normal = contactNormalToTrack(hit);
      const impact = resolveStaticImpulse(player.car, normal, normalizedOffset);
      if (!impact) {
        current = carPositionToWorld(player.car, index, carCount);
        continue;
      }
      registerCollision(
        player.car,
        `obstacle:${obstacle.id}`,
        {
          type: "obstacle",
          targetId: obstacle.id,
          label: obstacle.label,
          normal,
          ...impact,
          velocityAfter: collisionSnapshot(player.car),
        },
        raceElapsedMs,
      );
      current = carPositionToWorld(player.car, index, carCount);
    }
  });
}

function resolveCarCollisions(racers, previousPositions, raceElapsedMs) {
  const carCount = racers.length;


  for (let firstIndex = 0; firstIndex < racers.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < racers.length; secondIndex += 1) {
      const first = racers[firstIndex];
      const second = racers[secondIndex];
      const firstPrevious = previousPositions.get(first.id);
      const secondPrevious = previousPositions.get(second.id);
      const firstCurrent = carPositionToWorld(first.car, firstIndex, carCount);
      const secondCurrent = carPositionToWorld(second.car, secondIndex, carCount);
      const relativeStart = {
        x: firstPrevious.x - secondPrevious.x,
        z: firstPrevious.z - secondPrevious.z,
      };
      const relativeEnd = {
        x: firstCurrent.x - secondCurrent.x,
        z: firstCurrent.z - secondCurrent.z,
      };
      const extent = (car) => {
        const a = car.heading * Math.PI / 180;
        return { x: (Math.abs(Math.cos(a)) * CAR_SIZE_WORLD.x + Math.abs(Math.sin(a)) * CAR_SIZE_WORLD.z) / 2,
          z: (Math.abs(Math.sin(a)) * CAR_SIZE_WORLD.x + Math.abs(Math.cos(a)) * CAR_SIZE_WORLD.z) / 2 };
      };
      const firstExtent = extent(first.car), secondExtent = extent(second.car);
      const pairBounds = { minX: -firstExtent.x - secondExtent.x, maxX: firstExtent.x + secondExtent.x,
        minZ: -firstExtent.z - secondExtent.z, maxZ: firstExtent.z + secondExtent.z };
      const hit = sweepPointAgainstBounds(relativeStart, relativeEnd, pairBounds);
      if (!hit) continue;

      const firstContact = {
        x: firstPrevious.x + (firstCurrent.x - firstPrevious.x) * hit.t,
        z: firstPrevious.z + (firstCurrent.z - firstPrevious.z) * hit.t,
      };
      const secondContact = {
        x: secondPrevious.x + (secondCurrent.x - secondPrevious.x) * hit.t,
        z: secondPrevious.z + (secondCurrent.z - secondPrevious.z) * hit.t,
      };
      const contactOffsetWorld = {
        x: firstContact.x - secondContact.x,
        z: firstContact.z - secondContact.z,
      };
      firstContact.x += hit.normalX * COLLISION_EPSILON_WORLD;
      firstContact.z += hit.normalZ * COLLISION_EPSILON_WORLD;
      secondContact.x -= hit.normalX * COLLISION_EPSILON_WORLD;
      secondContact.z -= hit.normalZ * COLLISION_EPSILON_WORLD;
      applyWorldPosition(first.car, firstIndex, carCount, firstContact);
      applyWorldPosition(second.car, secondIndex, carCount, secondContact);
      const firstNormal = contactNormalToTrack(hit);
      const impact = resolveEqualMassImpulse(
        first.car,
        second.car,
        firstNormal,
        contactOffsetWorld,
      );
      if (!impact) continue;

      const pairKey = [first.id, second.id].sort().join(":");
      registerCollision(
        first.car,
        `car:${pairKey}`,
        {
          type: "car",
          targetId: second.id,
          label: second.name,
          normal: firstNormal,
          ...impact,
          velocityAfter: collisionSnapshot(first.car),
        },
        raceElapsedMs,
      );
      registerCollision(
        second.car,
        `car:${pairKey}`,
        {
          type: "car",
          targetId: first.id,
          label: first.name,
          normal: { x: -firstNormal.x || 0, z: -firstNormal.z || 0 },
          ...impact,
          velocityAfter: collisionSnapshot(second.car),
        },
        raceElapsedMs,
      );
    }
  }
}

function resolveTrackCollisions(racers, previousPositions, raceElapsedMs) {
  resolveObstacleCollisions(racers, previousPositions, raceElapsedMs);
  resolveCarCollisions(racers, previousPositions, raceElapsedMs);
}

function publicPlayer(player, viewerPlayerId) {
  const isOwner = player.id === viewerPlayerId;
  const {
    _lastCollisionKey: _ignoredCollisionKey,
    _collisionCooldownUntilMs: _ignoredCollisionCooldown,
    ...publicCar
  } = player.car ?? {};
  const snapshot = {
    id: player.id,
    name: player.name,
    named: player.named,
    color: player.color,
    connected: player.connected,
    hasPrompt: Boolean(player.prompt),
    hasTuningPrompt: Boolean(player.tuningPrompt),
    lastRepair: player.lastRepairId ? DEFECT_MAP.get(player.lastRepairId) : null,
    lastRepairs: (player.lastRepairIds ?? []).map((id) => DEFECT_MAP.get(id)),
    car: player.car
      ? {
          ...publicCar,
          name: isOwner ? player.car.name : `${player.name}'s car`,
          defects: player.car.defectIds.map((id) => publicDefect(player.car, id)),
        }
      : null,
  };
  if (isOwner) {
    snapshot.prompt = player.prompt;
    snapshot.tuningPrompt = player.tuningPrompt;
  }
  return snapshot;
}

export class GameEngine {
  constructor({
    buildDurationMs = BUILD_DURATION_MS,
    tuningDurationMs = TUNING_DURATION_MS,
    startCountdownMs = START_COUNTDOWN_MS,
    maxRaceDurationMs = MAX_RACE_DURATION_MS,
    drivingWorld,
  } = {}) {
    this.buildDurationMs = buildDurationMs;
    this.tuningDurationMs = tuningDurationMs;
    this.startCountdownMs = startCountdownMs;
    this.maxRaceDurationMs = maxRaceDurationMs;
    this.rooms = new Map();
    this.drivingWorld = drivingWorld === undefined ? getDrivingWorld() : drivingWorld;
  }

  createRoom(now = Date.now()) {
    let id = roomCode();
    while (this.rooms.has(id)) id = roomCode();

    const room = {
      id,
      hostToken: token(),
      phase: "waiting",
      createdAt: now,
      promptDeadline: null,
      tuningDeadline: null,
      startsAt: null,
      raceEndsAt: null,
      lastTickAt: null,
      roundNumber: 0,
      players: new Map(),
      finishers: [],
    };
    this.rooms.set(id, room);
    return room;
  }

  getRoom(id) {
    return this.rooms.get(String(id).toUpperCase());
  }

  requireRoom(id) {
    const room = this.getRoom(id);
    if (!room) throw new Error("Game room not found.");
    return room;
  }

  assertHost(room, hostToken) {
    if (!hostToken || hostToken !== room.hostToken) {
      throw new Error("Invalid host credentials.");
    }
  }

  joinPlayer(roomId, clientId, now = Date.now()) {
    const room = this.requireRoom(roomId);
    if (!clientId || typeof clientId !== "string" || clientId.length > 80) {
      throw new Error("Invalid player identity.");
    }

    let player = room.players.get(clientId);
    if (!player) {
      if (room.phase !== "waiting") {
        throw new Error("This game is no longer accepting new drivers.");
      }
      player = {
        id: clientId,
        name: `Driver ${room.players.size + 1}`,
        named: false,
        color: null,
        connected: true,
        prompt: "",
        tuningPrompt: "",
        lastRepairId: null,
        lastRepairIds: [],
        controls: { ...EMPTY_CONTROLS },
        car: null,
      };
      room.players.set(clientId, player);
    } else {
      player.connected = true;
    }
    return player;
  }

  disconnectPlayer(roomId, clientId) {
    const room = this.getRoom(roomId);
    const player = room?.players.get(clientId);
    if (!player) return;
    player.connected = false;
    player.controls = { ...EMPTY_CONTROLS };
  }

  setProfile(roomId, clientId, { name, color } = {}) {
    const room = this.requireRoom(roomId);
    const player = room.players.get(clientId);
    if (!player) throw new Error("Join the game before choosing a name.");
    if (room.phase !== "waiting") {
      throw new Error("Names and colours lock once the build starts.");
    }
    const cleaned = cleanName(name);
    if (!cleaned) throw new Error("Enter a name first.");

    let chosen = null;
    if (color !== null && color !== undefined && color !== "") {
      if (!PLAYER_COLORS.includes(color)) {
        throw new Error("Pick one of the four colours.");
      }
      const taken = [...room.players.values()].some(
        (other) => other.id !== player.id && other.color === color,
      );
      if (taken) throw new Error("That colour is already taken.");
      chosen = color;
    }

    player.name = cleaned;
    player.named = true;
    player.color = chosen;
    return player;
  }

  startPrompting(roomId, hostToken, now = Date.now()) {
    const room = this.requireRoom(roomId);
    this.assertHost(room, hostToken);
    if (room.phase !== "waiting") {
      throw new Error("The car build has already started.");
    }
    const hasConnectedDriver = [...room.players.values()].some(
      (player) => player.connected,
    );
    if (!hasConnectedDriver) {
      throw new Error("At least one connected driver is required to start the build.");
    }

    room.phase = "prompting";
    room.promptDeadline = now + this.buildDurationMs;
    return room;
  }

  submitPrompt(roomId, clientId, prompt, now = Date.now()) {
    const room = this.requireRoom(roomId);
    const player = room.players.get(clientId);
    if (!player) throw new Error("Join the game before submitting a car.");
    if (room.phase !== "prompting" || now >= room.promptDeadline) {
      throw new Error("The car prompt window is closed.");
    }
    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("Describe the car you want first.");
    }
    player.prompt = prompt.trim().slice(0, 160);
    return player;
  }

  async startRoom(roomId, hostToken, selector, now) {
    const liveClock = now === undefined;
    now ??= Date.now();
    const room = this.requireRoom(roomId);
    this.assertHost(room, hostToken);
    if (room.phase !== "prompting") throw new Error("The car build is not active.");
    if (now < room.promptDeadline && !allCarPromptsSubmitted(room)) throw new Error("The prompt minute is not over yet.");

    const racers = [...room.players.values()].filter((player) => player.prompt);
    if (racers.length === 0) throw new Error("At least one driver must submit a car.");

    room.phase = "assigning";
    let assignments;
    try {
      assignments = await selector(racers);
    } catch (error) {
      room.phase = "prompting";
      throw error;
    }

    racers.forEach((player, index) => {
      const assignment = assignments[player.id];
      const defectIds = Array.isArray(assignment) ? assignment : assignment?.defectIds;
      if (!Array.isArray(defectIds) || defectIds.length !== 4) {
        throw new Error(`Exactly four broken parts must be assigned to ${player.name}.`);
      }
      player.car = createCar(player, index, defectIds);
      player.car.tuning = applyKartTuning({}, assignment?.tuning);
      if (assignment?.tuning) player.car.mechanicNote = mechanicFeedback({}, player.car.tuning, [], player.car.defectIds.length);
      player.controls = { ...EMPTY_CONTROLS };
      player.tuningPrompt = "";
      player.lastRepairId = null;
      player.lastRepairIds = [];
    });

    room.roundNumber = 1;
    room.finishers = [];
    // Garage requests can outlast the countdown; start it only when cars are ready.
    room.startsAt = (liveClock ? Date.now() : now) + this.startCountdownMs;
    room.raceEndsAt = room.startsAt + this.maxRaceDurationMs;
    room.lastTickAt = room.startsAt;
    room.drivingAccumulator = 0;
    room.phase = "countdown";
    return room;
  }

  startTuning(roomId, hostToken, now = Date.now()) {
    const room = this.requireRoom(roomId);
    this.assertHost(room, hostToken);
    if (room.phase !== "finished") throw new Error("Finish the current ride first.");
    if (room.roundNumber >= MAX_RACE_ROUNDS) throw new Error("The five-round session is over.");
    const racers = [...room.players.values()].filter((player) => player.car);
    if (racers.every((player) => player.car.defectIds.length === 0)) {
      throw new Error("Every car is already fully tuned.");
    }

    room.phase = "tuning";
    room.tuningDeadline = now + this.tuningDurationMs;
    for (const player of racers) {
      player.tuningPrompt = "";
      player.lastRepairId = null;
      player.lastRepairIds = [];
    }
    return room;
  }

  submitTuningPrompt(roomId, clientId, prompt, now = Date.now()) {
    const room = this.requireRoom(roomId);
    const player = room.players.get(clientId);
    if (!player?.car) throw new Error("Join a race before tuning a car.");
    if (room.phase !== "tuning" || now >= room.tuningDeadline) {
      throw new Error("The tuning window is closed.");
    }
    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("Describe the specific drawbacks you noticed.");
    }
    player.tuningPrompt = prompt.trim().slice(0, 160);
    return player;
  }

  async startNextRace(roomId, hostToken, repairSelector, now) {
    const liveClock = now === undefined;
    now ??= Date.now();
    const room = this.requireRoom(roomId);
    this.assertHost(room, hostToken);
    if (room.phase !== "tuning") throw new Error("The tuning round is not active.");
    if (room.roundNumber >= MAX_RACE_ROUNDS) throw new Error("The five-round session is over.");
    if (now < room.tuningDeadline) throw new Error("The tuning minute is not over yet.");

    const racers = [...room.players.values()].filter((player) => player.car);
    room.phase = "repairing";
    let repairs;
    try {
      repairs = await repairSelector(racers.map((player) => ({
        id: player.id,
        tuningPrompt: player.tuningPrompt,
        tuning: player.car.tuning,
        defectIds: [...player.car.defectIds],
      })));
    } catch (error) {
      room.phase = "tuning";
      throw error;
    }

    for (const player of racers) {
      const decision = repairs[player.id];
      const suggested = Array.isArray(decision) ? decision
        : typeof decision === "string" ? [decision] : decision?.defectIds ?? [];
      const previousTuning = player.car.tuning;
      player.car.tuning = applyKartTuning(player.car.tuning, decision?.tuning);
      const current = new Set(player.car.defectIds);
      player.lastRepairIds = [...new Set(suggested.filter((id) => current.has(id)))];
      player.lastRepairId = player.lastRepairIds[0] ?? null;
      const repaired = new Set(player.lastRepairIds);
      player.car.defectIds = player.car.defectIds.filter((id) => !repaired.has(id));
      player.controls = { ...EMPTY_CONTROLS };
      resetCarForRace(player.car);
      player.car.mechanicNote = mechanicFeedback(previousTuning, player.car.tuning, player.lastRepairIds.map((id) => DEFECT_MAP.get(id)?.label ?? id), player.car.defectIds.length);
    }

    room.finalRace = room.roundNumber + 1 >= MAX_RACE_ROUNDS
      || (racers.length > 0 && racers.every((player) => player.car.defectIds.length === 0));
    room.roundNumber += 1;
    room.finishers = [];
    // Garage requests can outlast the countdown; start it only when cars are ready.
    room.startsAt = (liveClock ? Date.now() : now) + this.startCountdownMs;
    room.raceEndsAt = room.startsAt + this.maxRaceDurationMs;
    room.lastTickAt = room.startsAt;
    room.drivingAccumulator = 0;
    room.phase = "countdown";
    return room;
  }

  setControls(roomId, clientId, controls, now = Date.now()) {
    const room = this.requireRoom(roomId);
    const player = room.players.get(clientId);
    if (!player?.car) return;
    if (room.phase !== "countdown" && room.phase !== "racing") return;

    player.controls = {
      accelerate: controls.accelerate === true,
      brake: controls.brake === true,
      left: controls.left === true,
      right: controls.right === true,
      stop: controls.stop === true,
      drift: controls.drift === true,
      horn: controls.horn === true,
    };
    const previousHorn = player.car.hornSerial;
    updateRaceInputs(player.car, player.controls, now, room.startsAt);
    if (room.phase === "countdown" && previousHorn !== player.car.hornSerial) room.countdownInputChanged = true;
  }

  tick(now = Date.now()) {
    const changedRooms = [];

    for (const room of this.rooms.values()) {
      if (room.phase === "countdown") {
        let revsChanged = !!room.countdownInputChanged;
        room.countdownInputChanged = false;
        for (const player of room.players.values()) if (player.car) {
          revsChanged ||= player.car.throttle !== Number(player.controls.accelerate);
          player.car.throttle = player.controls.accelerate ? 1 : 0;
          player.car.braking = false;
        }
        if (revsChanged && now < room.startsAt) changedRooms.push(room.id);
      }
      if (room.phase === "countdown" && now >= room.startsAt) {
        for (const player of room.players.values()) if (player.car) resolveRaceStart(player.car, player.controls, room.startsAt);
        room.phase = "racing";
        room.stationarySince = now;
        room.stationaryPositions = new Map([...room.players.values()].filter((player) => player.car)
          .map((player) => [player.id, { ...player.car.worldPosition }]));
        room.lastTickAt = now;
        changedRooms.push(room.id);
        continue;
      }
      if (room.phase !== "racing") continue;

      const dt = clamp((now - room.lastTickAt) / 1000, 0, 0.1);
      room.lastTickAt = now;
      const elapsed = now - room.startsAt;
      const racers = [...room.players.values()].filter((player) => player.car);
      room.drivingAccumulator = (room.drivingAccumulator ?? 0) + dt;
      while (room.drivingAccumulator + 1e-9 >= DRIVING_STEP) {
        const previousPositions = new Map(racers.map((player) => [player.id, { ...player.car.worldPosition, resetVersion: player.car.resetVersion }]));
        racers.forEach((player) => advanceCar(player, DRIVING_STEP, elapsed, this.drivingWorld));
        for (const player of racers) {
          if (player.car.resetVersion !== previousPositions.get(player.id).resetVersion) {
            previousPositions.set(player.id, { ...player.car.worldPosition });
          }
        }
        resolveTrackCollisions(racers, previousPositions, elapsed);
        racers.forEach((player) => {
          if (player.car.finishedAtMs === null && player.car.resetVersion === previousPositions.get(player.id).resetVersion) {
            const fraction = updateLapProgress(player.car, previousPositions.get(player.id));
            if (Number.isFinite(fraction)) player.car.finishCrossingAtMs = elapsed - room.drivingAccumulator * 1000 + fraction * DRIVING_STEP * 1000;
          }
        });
        room.drivingAccumulator -= DRIVING_STEP;
        if (racers.some((player) => player.car.distance >= TRACK_LENGTH_METERS)) break;
      }

      const newlyFinished = [...room.players.values()]
        .filter(
          (player) =>
            player.car &&
            player.car.distance >= TRACK_LENGTH_METERS &&
            player.car.finishedAtMs === null,
        )
        .sort((a, b) => (a.car.finishCrossingAtMs ?? elapsed) - (b.car.finishCrossingAtMs ?? elapsed));

      for (const player of newlyFinished) {
        player.car.finishedAtMs = player.car.finishCrossingAtMs ?? elapsed;
        player.car.rank = room.finishers.length + 1;
        player.controls = { ...EMPTY_CONTROLS };
        room.finishers.push(player.id);
      }

      const moved = !room.stationaryPositions || racers.some((player) => {
        const anchor = room.stationaryPositions.get(player.id);
        const position = player.car.worldPosition;
        return !anchor || Math.hypot(position.x - anchor.x, position.z - anchor.z) > 1;
      });
      if (moved) {
        room.stationarySince = now;
        room.stationaryPositions = new Map(racers.map((player) => [player.id, { ...player.car.worldPosition }]));
      }
      const allStuck = racers.length > 0 && now - room.stationarySince >= 10_000;

      // End on a finisher, time limit, or ten seconds with all karts stuck. Everyone
      // still on track is placed by how far they got, so the standings and the
      // points separate them instead of sharing one DNF.
      if (room.finishers.length > 0 || now >= room.raceEndsAt || allStuck) {
        room.phase = "finished";
        const onTrack = racers
          .filter((player) => player.car.finishedAtMs === null)
          .sort((a, b) => b.car.distance - a.car.distance);
        onTrack.forEach((player, index) => {
          player.car.rank = room.finishers.length + index + 1;
        });
        for (const player of racers) player.controls = { ...EMPTY_CONTROLS };
      }
      changedRooms.push(room.id);
    }

    return changedRooms;
  }

  serialize(
    room,
    now = Date.now(),
    selectorName = "Local randomizer",
    viewerPlayerId = null,
  ) {
    return {
      protocolVersion: 6,
      id: room.id,
      phase: room.phase,
      serverNow: now,
      promptDeadline: room.promptDeadline,
      tuningDeadline: room.tuningDeadline,
      startsAt: room.startsAt,
      raceEndsAt: room.raceEndsAt,
      trackLength: TRACK_LENGTH_METERS,
      obstacles: TRACK_OBSTACLES,
      buildDurationMs: this.buildDurationMs,
      tuningDurationMs: this.tuningDurationMs,
      selectorName,
      finalRace: !!room.finalRace,
      roundNumber: room.roundNumber,
      finishers: [...room.finishers],
      players: [...room.players.values()].map((player) =>
        publicPlayer(player, viewerPlayerId)),
    };
  }

  removeStaleRooms(now = Date.now()) {
    for (const [id, room] of this.rooms) {
      if (now - room.createdAt > 6 * 60 * 60 * 1000) this.rooms.delete(id);
    }
  }
}
