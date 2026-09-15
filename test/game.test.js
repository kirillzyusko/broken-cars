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
