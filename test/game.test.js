import assert from "node:assert/strict";
import test from "node:test";
import { BrokenCarsGame } from "../server/game.js";

test("BrokenCarsGame exposes the complete multi-round integration surface", async () => {
  const game = new BrokenCarsGame({
    buildDurationMs: 10,
    tuningDurationMs: 10,
    startCountdownMs: 5,
    maxRaceDurationMs: 100,
    selectorName: () => "Test mechanic",
    defectSelector: async () => ({
      player: ["no_engine", "no_grip", "no_steering", "no_brakes"],
    }),
    repairSelector: async () => ({ player: ["no_engine", "no_brakes"] }),
  });

  const room = game.createRoom(1_000);
  game.joinPlayer(room.id, "player", 1_000);
  game.startBuild(room.id, room.hostToken, 1_001);
  game.submitCarPrompt(room.id, "player", "Round-wheeled rally car", 1_002);
  await game.startRace(room.id, room.hostToken, 1_011);

  assert.equal(game.getState(room).phase, "countdown");
  assert.equal(game.getState(room).selectorName, "Test mechanic");
  assert.equal(game.getState(room, { viewerPlayerId: "player" }).players[0].prompt,
    "Round-wheeled rally car");

  room.phase = "finished";
  game.startTuning(room.id, room.hostToken, 2_000);
  game.submitRepair(room.id, "player", "The engine is missing and the brakes do not work", 2_001);
  await game.startNextRace(room.id, room.hostToken, 2_011);

  const state = game.getState(room, { now: 2_011, viewerPlayerId: "player" });
  assert.equal(state.roundNumber, 2);
  assert.deepEqual(state.players[0].car.defectIds, ["no_grip", "no_steering"]);
  assert.equal(state.players[0].lastRepair.id, "no_engine");
  assert.deepEqual(state.players[0].lastRepairs.map((item) => item.id), ["no_engine", "no_brakes"]);
});

test("the last car prompt starts building immediately and only once", async () => {
  let calls = 0;
  let finishSelection;
  const game = new BrokenCarsGame({
    buildDurationMs: 15000,
    defectSelector: (players) => {
      calls++;
      return new Promise((resolve) => { finishSelection = () => resolve(Object.fromEntries(players.map((p) => [p.id, ["no_engine", "no_grip", "no_steering", "no_brakes"]]))); });
    },
  });
  const room = game.createRoom(1000);
  assert.equal(game.startRaceIfReady(room.id, 1000), null);
  game.joinPlayer(room.id, "a", 1000);
  game.joinPlayer(room.id, "b", 1000);
  game.startBuild(room.id, room.hostToken, 1000);
  game.submitCarPrompt(room.id, "a", "Kart A", 1001);
  game.disconnectPlayer(room.id, "b");
  assert.equal(game.startRaceIfReady(room.id, 1001), null, "a missing driver's prompt still gets the timer");
  assert.equal(room.phase, "prompting");
  game.joinPlayer(room.id, "b", 1002);
  game.submitCarPrompt(room.id, "b", "Kart B", 1002);
  const started = game.startRaceIfReady(room.id, 1002);
  assert.equal(room.phase, "assigning");
  assert.equal(game.startRaceIfReady(room.id, 1002), null);
  assert.equal(calls, 1);
  finishSelection();
  await started;
  assert.equal(room.phase, "countdown");
  assert.ok(room.startsAt < room.promptDeadline);
});

test("the timer still permits a race when a driver never submits", async () => {
  const game = new BrokenCarsGame({ buildDurationMs: 10, defectSelector: async () => ({ a: ["no_engine", "no_grip", "no_steering", "no_brakes"] }) });
  const room = game.createRoom(1000);
  game.joinPlayer(room.id, "a", 1000);
  game.joinPlayer(room.id, "b", 1000);
  game.startBuild(room.id, room.hostToken, 1000);
  game.submitCarPrompt(room.id, "a", "Kart A", 1001);
  assert.equal(game.startRaceIfReady(room.id, 1001), null);
  await game.startRace(room.id, room.hostToken, 1010);
  assert.equal(room.phase, "countdown");
  assert.ok(room.players.get("a").car);
  assert.equal(room.players.get("b").car, null);
});
