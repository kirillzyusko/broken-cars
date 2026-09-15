import assert from "node:assert/strict";
import test from "node:test";
import { applyKartTuning } from "../shared/kart-tuning.js";
import { stepKart } from "../shared/kart-driving.js";
import { resetDriving } from "../shared/track-world.js";
import { selectRepairs } from "../server/defects.js";

test("tuning defaults stay stock and unrelated requests preserve each setting", () => {
  assert.deepEqual(applyKartTuning(), { speed: 1, steering: 1 });
  const tuned = applyKartTuning({}, { speed: "extreme" });
  assert.deepEqual(tuned, { speed: 8, steering: 1 });
  assert.deepEqual(applyKartTuning(tuned, { steering: "very_low" }), { speed: 8, steering: 0.12 });
  assert.deepEqual(applyKartTuning(tuned, { speed: null, steering: null }), tuned);
  assert.deepEqual(applyKartTuning(tuned, { speed: "normal" }), { speed: 1, steering: 1 });
});

test("extreme tuning produces much higher speed and too much or too little steering", () => {
  const drive = (tuning, turn = false) => {
    const car = { defectIds: [], heat: 0, tuning };
    resetDriving(car);
    for (let i = 0; i < 240; i++) stepKart(car, { accelerate: true }, 1 / 120);
    if (turn) for (let i = 0; i < 60; i++) stepKart(car, { accelerate: true, right: true }, 1 / 120);
    return car;
  };
  const stock = drive({ speed: 1, steering: 1 });
  assert.deepEqual(drive(undefined), { ...stock, tuning: undefined });
  assert.ok(drive({ speed: 8, steering: 1 }).speed > stock.speed * 5);
  const normal = drive({ speed: 1, steering: 1 }, true);
  assert.ok(drive({ speed: 1, steering: 0.12 }, true).heading < normal.heading * 0.2);
  assert.ok(drive({ speed: 1, steering: 4 }, true).heading > normal.heading * 3);
});

test("mechanic schema separates tuning requests from specific repairs", async () => {
  let request;
  const result = await selectRepairs([{ id: "one", defectIds: ["no_brakes"], tuningPrompt: "Make it ultra fast" }], {
    provider: "openai", apiKey: "test-key", fetchImpl: async (_, options) => {
      request = JSON.parse(options.body);
      return { ok: true, json: async () => ({ output_text: JSON.stringify({ assignments: [{ playerId: "one", repairedDefectIds: [], tuning: { speed: "extreme", steering: null } }] }) }) };
    },
  });
  assert.deepEqual(result.one, { defectIds: [], tuning: { speed: "extreme" } });
  assert.ok(request.instructions.includes("Return null for each axis unless"));
  assert.ok(request.instructions.includes("Repair descriptions alone"));
});

test("small relative requests give fine control without resetting other settings", () => {
  const slightly = applyKartTuning({}, { speed: "increase_5" });
  assert.deepEqual(slightly, { speed: 1.05, steering: 1 });
  assert.deepEqual(applyKartTuning(slightly, { speed: "increase_5" }), { speed: 1.1025, steering: 1 });
  assert.deepEqual(applyKartTuning({ speed: 2, steering: 1.3 }, { steering: "decrease_10" }), { speed: 2, steering: 1.17 });
  assert.deepEqual(applyKartTuning({ speed: 8, steering: 0.12 }, { speed: "increase_5", steering: "decrease_20" }), { speed: 8, steering: 0.12 });
});

test("the mechanic accepts small prompt adjustments as relative changes", async () => {
  let request;
  const result = await selectRepairs([{ id: "one", defectIds: ["no_brakes"], tuning: { speed: 1.3, steering: 1 }, tuningPrompt: "Make the car a little bit faster" }], {
    provider: "openai", apiKey: "test-key", fetchImpl: async (_, options) => {
      request = JSON.parse(options.body);
      return { ok: true, json: async () => ({ output_text: JSON.stringify({ assignments: [{ playerId: "one", repairedDefectIds: [], tuning: { speed: "increase_5", steering: null } }] }) }) };
    },
  });
  assert.deepEqual(result.one, { defectIds: [], tuning: { speed: "increase_5" } });
  assert.deepEqual(applyKartTuning({ speed: 1.3, steering: 1 }, result.one.tuning), { speed: 1.365, steering: 1 });
  assert.ok(request.instructions.includes("'A little bit faster' MUST use increase_5"));
  assert.equal(JSON.parse(request.input).cars[0].currentTuning.speed, 1.3);
});
