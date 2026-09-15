import test from "node:test";
import assert from "node:assert/strict";
import { sessionOver, tally, resultsFromRoom } from "../src/lib/standings.js";

test("the final leaderboard includes round five immediately and counts it only once", () => {
  const history = {};
  for (let round = 1; round <= 4; round++) history[round] = {
    a: { rank: round % 2 ? 2 : 1, distance: 500 },
    b: { rank: round % 2 ? 1 : 2, distance: 500 },
  };
  const room = { phase: "finished", roundNumber: 5, players: [
    { id: "a", name: "A", car: { rank: 2, distance: 450, finishedAtMs: null, defects: [{ id: "square_wheels" }] } },
    { id: "b", name: "B", car: { rank: 1, distance: 500, finishedAtMs: 42000, defects: [{ id: "no_brakes" }] } },
  ] };
  assert.equal(sessionOver(room), true, "remaining defects must not send players back to the pit after round five");
  const standings = tally(history, room);
  assert.deepEqual(standings.map((p) => [p.id, p.points]), [["b", 69], ["a", 66]]);
  assert.deepEqual(tally({ ...history, 5: resultsFromRoom(room) }, room), standings);
  assert.equal(Object.keys(history).length, 4, "rendering must not mutate stored history");
});
