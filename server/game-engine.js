import { randomBytes } from "node:crypto";
import { DEFECTS, isGenericRepairRequest } from "./defects.js";

export const TRACK_LENGTH_METERS = 500;
export const BUILD_DURATION_MS = 60_000;
export const TUNING_DURATION_MS = 60_000;
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
    acceleratorStuck: false,
    oneWayTurn: defectIds.includes("one_way_steering")
      ? (index % 2 === 0 ? "left" : "right")
      : null,
    enginePowerIssue: defectIds.includes("bad_engine_power")
      ? (index % 2 === 0 ? "weak" : "overpowered")
      : null,
    finishedAtMs: null,
    rank: null,
  };
}

function resetCarForRace(car) {
  car.distance = 0;
  car.speed = 0;
  car.lane = 0;
  car.heat = 0;
  car.acceleratorStuck = false;
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

function advanceCar(player, dt, raceElapsedMs) {
  const { car, controls } = player;
  if (!car || car.finishedAtMs !== null) return;

  const defects = new Set(car.defectIds);
  let acceleratePressed = controls.accelerate;
  let brakePressed = controls.brake;
  if (defects.has("swapped_pedals")) {
    [acceleratePressed, brakePressed] = [brakePressed, acceleratePressed];
  }
  if (defects.has("stuck_accelerator") && acceleratePressed) {
    car.acceleratorStuck = true;
  }
  const wantsAcceleration = acceleratePressed || car.acceleratorStuck;

  let steerInput = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
  if (defects.has("reversed_steering")) steerInput *= -1;
  if (
    defects.has("one_way_steering")
    && ((car.oneWayTurn === "left" && steerInput > 0)
      || (car.oneWayTurn === "right" && steerInput < 0))
  ) {
    steerInput = 0;
  }
  const canSteer = !defects.has("no_steering");
  const steering = canSteer ? steerInput : 0;

  let acceleration = wantsAcceleration ? 14 : 0;
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
  if (defects.has("sideways_wheels")) {
    acceleration *= 0.34;
    maxSpeed = Math.min(maxSpeed, 12);
    rollingDrag += 4.5;
  }
  if (defects.has("bad_engine_power")) {
    if (car.enginePowerIssue === "weak") {
      acceleration *= 0.32;
      maxSpeed = Math.min(maxSpeed, 17);
    } else {
      acceleration *= 2.15;
      maxSpeed = Math.max(maxSpeed, 58);
    }
  }
  if (defects.has("no_grip")) {
    acceleration *= 0.82;
    rollingDrag *= 0.45;
  }
  if (defects.has("no_seatbelt") && steering !== 0 && car.speed > 18) {
    acceleration *= 0.28;
  }

  if (defects.has("no_cooling")) {
    const heatDelta = wantsAcceleration ? 0.17 * dt : -0.1 * dt;
    car.heat = clamp(car.heat + heatDelta, 0, 1);
    if (car.heat > 0.65) {
      acceleration *= Math.max(0.08, 1 - (car.heat - 0.65) * 2.4);
    }
  } else {
    car.heat = Math.max(0, car.heat - 0.25 * dt);
  }

  const braking = brakePressed && !defects.has("no_brakes") ? 22 : 0;
  const drag = car.speed > 0 ? rollingDrag : 0;
  car.speed = clamp(car.speed + (acceleration - braking - drag) * dt, 0, maxSpeed);

  let laneVelocity = steering * (0.5 + car.speed / 55);
  if (defects.has("loose_wheel") && car.speed > 4) {
    laneVelocity += Math.sin(raceElapsedMs / 180) * (car.speed / 80);
  }
  if (defects.has("no_grip") && car.speed > 3) {
    laneVelocity = steering * (1.2 + car.speed / 28)
      + Math.sin(raceElapsedMs / 240) * (car.speed / 38);
  }
  if (
    defects.has("bad_engine_power")
    && car.enginePowerIssue === "overpowered"
    && wantsAcceleration
  ) {
    laneVelocity += Math.sin(raceElapsedMs / 95) * (car.speed / 65);
  }
  car.lane = clamp(car.lane + laneVelocity * dt, -1, 1);
  const driveDirection = defects.has("backwards_engine") ? -1 : 1;
  car.distance = clamp(
    car.distance + car.speed * dt * driveDirection,
    0,
    TRACK_LENGTH_METERS,
  );
}

function publicPlayer(player, viewerPlayerId) {
  const isOwner = player.id === viewerPlayerId;
  const snapshot = {
    id: player.id,
    name: player.name,
    connected: player.connected,
    hasPrompt: Boolean(player.prompt),
    hasTuningPrompt: Boolean(player.tuningPrompt),
    lastRepair: player.lastRepairId ? DEFECT_MAP.get(player.lastRepairId) : null,
    car: player.car
      ? {
          ...player.car,
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
  } = {}) {
    this.buildDurationMs = buildDurationMs;
    this.tuningDurationMs = tuningDurationMs;
    this.startCountdownMs = startCountdownMs;
    this.maxRaceDurationMs = maxRaceDurationMs;
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
        connected: true,
        prompt: "",
        tuningPrompt: "",
        lastRepairId: null,
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
      if (!Array.isArray(defectIds) || defectIds.length < 3 || defectIds.length > 4) {
        throw new Error(`Exactly three or four broken parts must be assigned to ${player.name}.`);
      }
      player.car = createCar(player, index, defectIds);
      player.controls = { ...EMPTY_CONTROLS };
      player.tuningPrompt = "";
      player.lastRepairId = null;
    });

    room.roundNumber = 1;
    room.finishers = [];
    room.startsAt = now + this.startCountdownMs;
    room.raceEndsAt = room.startsAt + this.maxRaceDurationMs;
    room.lastTickAt = room.startsAt;
    room.phase = "countdown";
    return room;
  }

  startTuning(roomId, hostToken, now = Date.now()) {
    const room = this.requireRoom(roomId);
    this.assertHost(room, hostToken);
    if (room.phase !== "finished") throw new Error("Finish the current ride first.");
    const racers = [...room.players.values()].filter((player) => player.car);
    if (racers.every((player) => player.car.defectIds.length === 0)) {
      throw new Error("Every car is already fully tuned.");
    }

    room.phase = "tuning";
    room.tuningDeadline = now + this.tuningDurationMs;
    for (const player of racers) {
      player.tuningPrompt = "";
      player.lastRepairId = null;
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
    if (player.car.defectIds.length === 0) {
      throw new Error("Your car has no defects left to repair.");
    }
    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("Describe one specific defect you noticed.");
    }
    player.tuningPrompt = prompt.trim().slice(0, 160);
    return player;
  }

  async startNextRace(roomId, hostToken, repairSelector, now = Date.now()) {
    const room = this.requireRoom(roomId);
    this.assertHost(room, hostToken);
    if (room.phase !== "tuning") throw new Error("The tuning round is not active.");
    if (now < room.tuningDeadline) throw new Error("The tuning minute is not over yet.");

    const racers = [...room.players.values()].filter((player) => player.car);
    room.phase = "repairing";
    let repairs;
    try {
      repairs = await repairSelector(racers.map((player) => ({
        id: player.id,
        tuningPrompt: player.tuningPrompt,
        defectIds: [...player.car.defectIds],
      })));
    } catch (error) {
      room.phase = "tuning";
      throw error;
    }

    for (const player of racers) {
      const repairedId = repairs[player.id];
      player.lastRepairId = !isGenericRepairRequest(player.tuningPrompt)
        && typeof repairedId === "string"
        && player.car.defectIds.includes(repairedId)
        ? repairedId
        : null;
      if (player.lastRepairId) {
        player.car.defectIds = player.car.defectIds.filter(
          (id) => id !== player.lastRepairId,
        );
      }
      player.controls = { ...EMPTY_CONTROLS };
      resetCarForRace(player.car);
    }

    room.roundNumber += 1;
    room.finishers = [];
    room.startsAt = now + this.startCountdownMs;
    room.raceEndsAt = room.startsAt + this.maxRaceDurationMs;
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

  serialize(
    room,
    now = Date.now(),
    selectorName = "Local randomizer",
    viewerPlayerId = null,
  ) {
    return {
      protocolVersion: 3,
      id: room.id,
      phase: room.phase,
      serverNow: now,
      promptDeadline: room.promptDeadline,
      tuningDeadline: room.tuningDeadline,
      startsAt: room.startsAt,
      raceEndsAt: room.raceEndsAt,
      trackLength: TRACK_LENGTH_METERS,
      selectorName,
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
