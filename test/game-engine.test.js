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
    /At least one driver/,
  );
  assert.throws(
    () => engine.startPrompting(room.id, "wrong", 1_010),
    /credentials/,
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
    async () => ({ "player-1": ["no_brakes"] }),
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
    async () => ({ "player-1": ["no_engine"] }),
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
