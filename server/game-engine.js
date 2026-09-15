import { randomBytes } from "node:crypto";
import { DEFECTS } from "./defects.js";

export const TRACK_LENGTH_METERS = 500;
export const BUILD_DURATION_MS = 60_000;
export const START_COUNTDOWN_MS = 3_000;
export const MAX_RACE_DURATION_MS = 90_000;

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
const EMPTY_CONTROLS = Object.freeze({
  accelerate: false,
  brake: false,
  left: false,
  right: false,
});
const DEFECT_MAP = new Map(DEFECTS.map((defect) => [defect.id, defect]));

function token(bytes = 18) {
  return randomBytes(bytes).toString("base64url");
}

function roomCode() {
  return randomBytes(3).toString("hex").toUpperCase();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function carColor(index) {
  return COLORS[index % COLORS.length];
}

function createCar(player, index, defectIds) {
  return {
    name: player.prompt,
    color: carColor(index),
    defectIds,
    distance: 0,
    speed: 0,
    lane: 0,
    heat: 0,
    finishedAtMs: null,
    rank: null,
  };
}

function advanceCar(player, dt, raceElapsedMs) {
  const { car, controls } = player;
  if (!car || car.finishedAtMs !== null) return;

  const defects = new Set(car.defectIds);
  const steerInput = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
  const canSteer = !defects.has("no_steering");
  const steering = canSteer ? steerInput : 0;

  let acceleration = controls.accelerate ? 14 : 0;
  let maxSpeed = 44;
  let rollingDrag = 2.4;

  if (defects.has("no_engine")) acceleration = 0;
  if (defects.has("no_wheels")) {
    acceleration *= 0.22;
    maxSpeed = 8;
    rollingDrag = 5.5;
  }
  if (defects.has("square_wheels")) {
    acceleration *= 0.72;
    maxSpeed = Math.min(maxSpeed, 25);
    rollingDrag += 1.8 + Math.abs(Math.sin(raceElapsedMs / 115)) * 2.2;
  }
  if (defects.has("loose_wheel")) {
    maxSpeed *= 0.86;
  }
  if (defects.has("no_seatbelt") && steering !== 0 && car.speed > 18) {
    acceleration *= 0.28;
  }

  if (defects.has("no_cooling")) {
    const heatDelta = controls.accelerate ? 0.17 * dt : -0.1 * dt;
    car.heat = clamp(car.heat + heatDelta, 0, 1);
    if (car.heat > 0.65) {
      acceleration *= Math.max(0.08, 1 - (car.heat - 0.65) * 2.4);
    }
  } else {
    car.heat = Math.max(0, car.heat - 0.25 * dt);
  }

  const braking = controls.brake && !defects.has("no_brakes") ? 22 : 0;
  const drag = car.speed > 0 ? rollingDrag : 0;
  car.speed = clamp(car.speed + (acceleration - braking - drag) * dt, 0, maxSpeed);

  let laneVelocity = steering * (0.5 + car.speed / 55);
  if (defects.has("loose_wheel") && car.speed > 4) {
    laneVelocity += Math.sin(raceElapsedMs / 180) * (car.speed / 80);
  }
  car.lane = clamp(car.lane + laneVelocity * dt, -1, 1);
  car.distance = Math.min(TRACK_LENGTH_METERS, car.distance + car.speed * dt);
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    connected: player.connected,
    hasPrompt: Boolean(player.prompt),
    prompt: player.prompt,
    car: player.car
      ? {
          ...player.car,
          defects: player.car.defectIds.map((id) => DEFECT_MAP.get(id)),
        }
      : null,
  };
}

export class GameEngine {
  constructor({ buildDurationMs = BUILD_DURATION_MS } = {}) {
    this.buildDurationMs = buildDurationMs;
    this.rooms = new Map();
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
      startsAt: null,
      raceEndsAt: null,
      lastTickAt: null,
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
        connected: true,
        prompt: "",
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

  startPrompting(roomId, hostToken, now = Date.now()) {
    const room = this.requireRoom(roomId);
    this.assertHost(room, hostToken);
    if (room.phase !== "waiting") {
      throw new Error("The car build has already started.");
    }
    if (room.players.size === 0) {
      throw new Error("At least one driver must join before starting the build.");
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

  async startRoom(roomId, hostToken, selector, now = Date.now()) {
    const room = this.requireRoom(roomId);
    this.assertHost(room, hostToken);
    if (room.phase !== "prompting") throw new Error("The car build is not active.");
    if (now < room.promptDeadline) throw new Error("The prompt minute is not over yet.");

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
      const defectIds = assignments[player.id];
      if (!Array.isArray(defectIds) || defectIds.length === 0) {
        throw new Error(`No broken parts were assigned to ${player.name}.`);
      }
      player.car = createCar(player, index, defectIds);
      player.controls = { ...EMPTY_CONTROLS };
    });

    room.startsAt = Date.now() + START_COUNTDOWN_MS;
    room.raceEndsAt = room.startsAt + MAX_RACE_DURATION_MS;
    room.lastTickAt = room.startsAt;
    room.phase = "countdown";
    return room;
  }

  setControls(roomId, clientId, controls) {
    const room = this.requireRoom(roomId);
    const player = room.players.get(clientId);
    if (!player?.car) return;
    if (room.phase !== "countdown" && room.phase !== "racing") return;

    player.controls = {
      accelerate: controls.accelerate === true,
      brake: controls.brake === true,
      left: controls.left === true,
      right: controls.right === true,
    };
  }

  tick(now = Date.now()) {
    const changedRooms = [];

    for (const room of this.rooms.values()) {
      if (room.phase === "countdown" && now >= room.startsAt) {
        room.phase = "racing";
        room.lastTickAt = now;
        changedRooms.push(room.id);
        continue;
      }
      if (room.phase !== "racing") continue;

      const dt = clamp((now - room.lastTickAt) / 1000, 0, 0.1);
      room.lastTickAt = now;
      const elapsed = now - room.startsAt;
      for (const player of room.players.values()) advanceCar(player, dt, elapsed);

      const newlyFinished = [...room.players.values()]
        .filter(
          (player) =>
            player.car &&
            player.car.distance >= TRACK_LENGTH_METERS &&
            player.car.finishedAtMs === null,
        )
        .sort((a, b) => b.car.speed - a.car.speed);

      for (const player of newlyFinished) {
        player.car.finishedAtMs = elapsed;
        player.car.rank = room.finishers.length + 1;
        player.controls = { ...EMPTY_CONTROLS };
        room.finishers.push(player.id);
      }

      const racers = [...room.players.values()].filter((player) => player.car);
      const allFinished = racers.every((player) => player.car.finishedAtMs !== null);
      if (allFinished || now >= room.raceEndsAt) {
        room.phase = "finished";
        for (const player of racers) player.controls = { ...EMPTY_CONTROLS };
      }
      changedRooms.push(room.id);
    }

    return changedRooms;
  }

  serialize(room, now = Date.now(), selectorName = "Local randomizer") {
    return {
      id: room.id,
      phase: room.phase,
      serverNow: now,
      promptDeadline: room.promptDeadline,
      startsAt: room.startsAt,
      raceEndsAt: room.raceEndsAt,
      trackLength: TRACK_LENGTH_METERS,
      selectorName,
      finishers: [...room.finishers],
      players: [...room.players.values()].map(publicPlayer),
    };
  }

  removeStaleRooms(now = Date.now()) {
    for (const [id, room] of this.rooms) {
      if (now - room.createdAt > 6 * 60 * 60 * 1000) this.rooms.delete(id);
    }
  }
}
