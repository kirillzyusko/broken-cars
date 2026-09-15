import assert from "node:assert/strict";
import test from "node:test";
import { DEFECTS, defectTestUtils, selectDefects } from "../server/defects.js";
import { GameEngine, TRACK_LENGTH_METERS } from "../server/game-engine.js";

test("players wait for the host before the shared prompt minute starts", () => {
  const engine = new GameEngine({ buildDurationMs: 100 });
  const room = engine.createRoom(1_000);
  const player = engine.joinPlayer(room.id, "player-1", 1_010);

  assert.equal(room.phase, "waiting");
  assert.equal(room.promptDeadline, null);
  assert.throws(
    () => engine.submitPrompt(room.id, player.id, "Too early", 1_015),
    /closed/,
  );

  engine.startPrompting(room.id, room.hostToken, 1_020);
  assert.equal(room.phase, "prompting");
  assert.equal(room.promptDeadline, 1_120);
  engine.submitPrompt(room.id, player.id, "  Rocket shopping cart  ", 1_020);
  assert.equal(player.prompt, "Rocket shopping cart");
  assert.throws(
    () => engine.submitPrompt(room.id, player.id, "Too late", 1_121),
    /closed/,
  );
  assert.throws(() => engine.joinPlayer(room.id, "player-2", 1_021), /no longer/);
});

test("host cannot start the build before a driver joins", () => {
  const engine = new GameEngine({ buildDurationMs: 100 });
  const room = engine.createRoom(1_000);

  assert.throws(
    () => engine.startPrompting(room.id, room.hostToken, 1_010),
    /connected driver/,
  );
  assert.throws(
    () => engine.startPrompting(room.id, "wrong", 1_010),
    /credentials/,
  );
  engine.joinPlayer(room.id, "player-1", 1_020);
  engine.disconnectPlayer(room.id, "player-1");
  assert.throws(
    () => engine.startPrompting(room.id, room.hostToken, 1_030),
    /connected driver/,
  );
});

test("host cannot start early and invalid host credentials are rejected", async () => {
  const engine = new GameEngine({ buildDurationMs: 100 });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "player-1", 1_010);
  engine.startPrompting(room.id, room.hostToken, 1_020);
  engine.submitPrompt(room.id, "player-1", "Moon buggy", 1_020);

  await assert.rejects(
    engine.startRoom(room.id, room.hostToken, selectDefects, 1_100),
    /not over/,
  );
  await assert.rejects(
    engine.startRoom(room.id, "wrong", selectDefects, 1_121),
    /credentials/,
  );
});

test("race assignment and server-authoritative controls move a working car", async () => {
  const engine = new GameEngine({ buildDurationMs: 1 });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "player-1", 1_000);
  engine.startPrompting(room.id, room.hostToken, 1_000);
  engine.submitPrompt(room.id, "player-1", "Fast banana", 1_000);
  await engine.startRoom(
    room.id,
    room.hostToken,
    async () => ({ "player-1": ["no_brakes", "no_seatbelt", "loose_wheel"] }),
    1_002,
  );

  room.startsAt = 2_000;
  room.lastTickAt = 2_000;
  room.raceEndsAt = 100_000;
  engine.tick(2_000);
  engine.setControls(room.id, "player-1", { accelerate: true });
  for (let now = 2_050; now <= 5_000; now += 50) engine.tick(now);

  const car = room.players.get("player-1").car;
  assert.ok(car.speed > 0);
  assert.ok(car.distance > 0);
  assert.ok(car.distance < TRACK_LENGTH_METERS);
});

test("a car with no engine cannot accelerate", async () => {
  const engine = new GameEngine({ buildDurationMs: 1 });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "player-1", 1_000);
  engine.startPrompting(room.id, room.hostToken, 1_000);
  engine.submitPrompt(room.id, "player-1", "Engine-free supercar", 1_000);
  await engine.startRoom(
    room.id,
    room.hostToken,
    async () => ({ "player-1": ["no_engine", "no_brakes", "no_steering"] }),
    1_002,
  );
  room.startsAt = 2_000;
  room.lastTickAt = 2_000;
  room.raceEndsAt = 100_000;
  engine.tick(2_000);
  engine.setControls(room.id, "player-1", { accelerate: true });
  engine.tick(2_100);

  assert.equal(room.players.get("player-1").car.speed, 0);
});

test("swapped pedals, reversed steering, stuck acceleration, and backwards engines affect driving", async () => {
  const engine = new GameEngine({ buildDurationMs: 1 });
  const room = engine.createRoom(1_000);
  const defectIds = [
    "swapped_pedals",
    "reversed_steering",
    "stuck_accelerator",
    "backwards_engine",
  ];

  defectIds.forEach((_, index) => {
    const id = `player-${index}`;
    engine.joinPlayer(room.id, id, 1_000);
  });
  engine.startPrompting(room.id, room.hostToken, 1_000);
  defectIds.forEach((_, index) => {
    engine.submitPrompt(room.id, `player-${index}`, `Car ${index}`, 1_000);
  });
  await engine.startRoom(
    room.id,
    room.hostToken,
    async () => Object.fromEntries(defectIds.map((defectId, index) => [
      `player-${index}`,
      [defectId, "no_seatbelt", index === 0 ? "no_steering" : "no_brakes"],
    ])),
    1_002,
  );

  room.startsAt = 2_000;
  room.lastTickAt = 2_000;
  room.raceEndsAt = 100_000;
  engine.tick(2_000);
  engine.setControls(room.id, "player-0", { brake: true });
  engine.setControls(room.id, "player-1", { accelerate: true, right: true });
  engine.setControls(room.id, "player-2", { accelerate: true });
  engine.setControls(room.id, "player-3", { accelerate: true });
  engine.tick(2_100);

  assert.ok(room.players.get("player-0").car.speed > 0);
  assert.ok(room.players.get("player-1").car.lane < 0);
  assert.equal(room.players.get("player-2").car.acceleratorStuck, true);
  assert.equal(room.players.get("player-3").car.distance, 0);

  const stuckSpeed = room.players.get("player-2").car.speed;
  engine.setControls(room.id, "player-2", {});
  engine.tick(2_200);
  assert.ok(room.players.get("player-2").car.speed > stuckSpeed);
});

test("local selector always returns allowed compatible defects", async () => {
  const originalProvider = process.env.LLM_PROVIDER;
  delete process.env.LLM_PROVIDER;
  const players = Array.from({ length: 30 }, (_, index) => ({
    id: `player-${index}`,
    prompt: `Car ${index}`,
  }));
  const assignments = await selectDefects(players);
  const allowedIds = new Set(DEFECTS.map((defect) => defect.id));

  for (const ids of Object.values(assignments)) {
    assert.ok(defectTestUtils.validSelection(ids));
    assert.ok(ids.every((id) => allowedIds.has(id)));
  }
  if (originalProvider) process.env.LLM_PROVIDER = originalProvider;
});

test("room snapshots advertise the current client protocol", () => {
  const engine = new GameEngine();
  const room = engine.createRoom();
  const state = engine.serialize(room);
  assert.equal(state.protocolVersion, 3);
  assert.equal(state.buildDurationMs, 60_000);
  assert.equal(state.tuningDurationMs, 60_000);
});

test("room snapshots keep car prompts private from the host and other players", async () => {
  const engine = new GameEngine({ buildDurationMs: 1 });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "player-1", 1_000);
  engine.joinPlayer(room.id, "player-2", 1_000);
  engine.startPrompting(room.id, room.hostToken, 1_000);
  engine.submitPrompt(room.id, "player-1", "Secret banana car", 1_000);
  engine.submitPrompt(room.id, "player-2", "Secret moon buggy", 1_000);

  const hostSnapshot = engine.serialize(room);
  const playerSnapshot = engine.serialize(room, 1_001, "Local randomizer", "player-1");

  assert.equal("prompt" in hostSnapshot.players[0], false);
  assert.equal("prompt" in hostSnapshot.players[1], false);
  assert.equal(playerSnapshot.players[0].prompt, "Secret banana car");
  assert.equal("prompt" in playerSnapshot.players[1], false);

  await engine.startRoom(
    room.id,
    room.hostToken,
    async () => ({
      "player-1": ["no_brakes", "no_seatbelt", "loose_wheel"],
      "player-2": ["no_engine", "no_brakes", "no_steering"],
    }),
    1_002,
  );

  const racingHostSnapshot = engine.serialize(room);
  assert.equal(racingHostSnapshot.players[0].car.name, "Driver 1's car");
  assert.equal(racingHostSnapshot.players[1].car.name, "Driver 2's car");
});

test("each tuning round repairs at most one specifically reported defect", async () => {
  const engine = new GameEngine({
    buildDurationMs: 1,
    tuningDurationMs: 10,
    startCountdownMs: 5,
    maxRaceDurationMs: 100,
  });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "player-1", 1_000);
  engine.startPrompting(room.id, room.hostToken, 1_000);
  engine.submitPrompt(room.id, "player-1", "Rally car", 1_000);
  await engine.startRoom(
    room.id,
    room.hostToken,
    async () => ({
      "player-1": ["no_brakes", "reversed_steering", "no_grip"],
    }),
    1_002,
  );

  room.phase = "finished";
  room.players.get("player-1").car.distance = 250;
  room.players.get("player-1").car.speed = 20;
  engine.startTuning(room.id, room.hostToken, 2_000);
  engine.submitTuningPrompt(
    room.id,
    "player-1",
    "The steering is reversed",
    2_001,
  );
  await engine.startNextRace(
    room.id,
    room.hostToken,
    async () => ({ "player-1": "reversed_steering" }),
    2_011,
  );

  const player = room.players.get("player-1");
  assert.deepEqual(player.car.defectIds, ["no_brakes", "no_grip"]);
  assert.equal(player.lastRepairId, "reversed_steering");
  assert.equal(player.car.distance, 0);
  assert.equal(player.car.speed, 0);
  assert.equal(room.roundNumber, 2);
  assert.equal(room.phase, "countdown");
});

test("generic requests cannot repair defects even if a selector suggests one", async () => {
  const engine = new GameEngine({ buildDurationMs: 1, tuningDurationMs: 10 });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "player-1", 1_000);
  engine.startPrompting(room.id, room.hostToken, 1_000);
  engine.submitPrompt(room.id, "player-1", "Demo car", 1_000);
  await engine.startRoom(
    room.id,
    room.hostToken,
    async () => ({
      "player-1": ["no_brakes", "reversed_steering", "no_grip"],
    }),
    1_002,
  );
  room.phase = "finished";
  engine.startTuning(room.id, room.hostToken, 2_000);
  engine.submitTuningPrompt(
    room.id,
    "player-1",
    "Машина должна быть полностью рабочей",
    2_001,
  );
  await engine.startNextRace(
    room.id,
    room.hostToken,
    async () => ({ "player-1": "no_brakes" }),
    2_011,
  );

  const player = room.players.get("player-1");
  assert.deepEqual(
    player.car.defectIds,
    ["no_brakes", "reversed_steering", "no_grip"],
  );
  assert.equal(player.lastRepairId, null);
});

test("host snapshots never reveal private tuning prompts", async () => {
  const engine = new GameEngine({ buildDurationMs: 1, tuningDurationMs: 10 });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "player-1", 1_000);
  engine.startPrompting(room.id, room.hostToken, 1_000);
  engine.submitPrompt(room.id, "player-1", "Secret car", 1_000);
  await engine.startRoom(
    room.id,
    room.hostToken,
    async () => ({
      "player-1": ["no_brakes", "reversed_steering", "no_grip"],
    }),
    1_002,
  );
  room.phase = "finished";
  engine.startTuning(room.id, room.hostToken, 2_000);
  engine.submitTuningPrompt(room.id, "player-1", "Secret brake report", 2_001);

  const hostPlayer = engine.serialize(room).players[0];
  const ownerPlayer = engine.serialize(room, 2_002, "Local", "player-1").players[0];
  assert.equal("tuningPrompt" in hostPlayer, false);
  assert.equal(hostPlayer.hasTuningPrompt, true);
  assert.equal(ownerPlayer.tuningPrompt, "Secret brake report");
});
