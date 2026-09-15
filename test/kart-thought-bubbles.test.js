import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { DEFECTS } from "../server/defects.js";
import { FAULT_ICONS, faultIcon } from "../src/kart-fault-icons.js";
import { thoughtBubbleFrame } from "../src/kart-thought-bubble-model.js";
import { createKartThoughtBubbles } from "../src/kart-thought-bubbles.js";
import { raceCarsFromRoom } from "../src/race-scene-model.js";
import { createKartTestApp } from "./helpers/kart-assets.js";

const car = { defectIds: ["no_engine", "no_brakes", "square_wheels"] };

test("faults appear five seconds after GO, fade, and reset with the race clock", () => {
  for (const time of [null, NaN, -3000, 0, 4999, 14000, 40000]) {
    assert.equal(thoughtBubbleFrame(car, time), null);
  }
  assert.deepEqual(thoughtBubbleFrame(car, 5500).ids, car.defectIds);
  assert.equal(thoughtBubbleFrame(car, 5500).opacity, 1);
  assert.equal(thoughtBubbleFrame(car, 5225).opacity, 0.5);
  assert.equal(thoughtBubbleFrame(car, 13600).opacity, 0.5);
  assert.equal(thoughtBubbleFrame(car, 0), null);
  assert.ok(thoughtBubbleFrame(car, 5500));
});

test("repaired and finished karts stay quiet, and remaining faults reflect repairs", () => {
  assert.equal(thoughtBubbleFrame({ defectIds: [] }, 6000), null);
  assert.equal(thoughtBubbleFrame({ ...car, finishedAtMs: 5700 }, 6000), null);
  assert.deepEqual(thoughtBubbleFrame({ defectIds: ["no_brakes"] }, 6000).ids, ["no_brakes"]);
});

test("extra faults get a full page without duplicate or unknown symbols", () => {
  const many = { defectIds: [...car.defectIds, "no_grip", "no_engine", "unknown"] };
  assert.deepEqual(thoughtBubbleFrame(many, 6000).ids, car.defectIds);
  assert.deepEqual(thoughtBubbleFrame(many, 13999).ids, car.defectIds);
  assert.deepEqual(thoughtBubbleFrame(many, 14000).ids, ["no_grip"]);
  assert.equal(thoughtBubbleFrame(many, 23000), null);
  assert.equal(thoughtBubbleFrame(car, 5100, true).scale, 1);
});

test("every game fault has artwork, with the correct direction and power variant", async () => {
  assert.deepEqual(Object.keys(FAULT_ICONS).sort(), DEFECTS.map(({ id }) => id).sort());
  assert.equal(faultIcon("one_way_steering", { oneWayTurn: "right" }).label[1], "RIGHT");
  assert.equal(faultIcon("one_way_steering", { oneWayTurn: "left" }).label[1], "LEFT");
  assert.equal(faultIcon("bad_engine_power", { enginePowerIssue: "weak" }).label[1], "TOO WEAK");
  assert.equal(faultIcon("bad_engine_power", { enginePowerIssue: "overpowered" }).label[1], "TOO STRONG");
  const paths = new Set([
    ...Object.values(FAULT_ICONS).map((icon) => icon.src),
    faultIcon("one_way_steering", { oneWayTurn: "right" }).src,
    faultIcon("bad_engine_power", { enginePowerIssue: "weak" }).src,
  ]);
  assert.equal(paths.size, 18);
  await Promise.all([...paths].map(async (src) => {
    const png = await readFile(new URL(`../public${src}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), "PNG", src);
    assert.equal(png.readUInt32BE(16), 256, src);
    assert.equal(png.readUInt32BE(20), 256, src);
    assert.equal(png[25], 6, `${src} has RGBA transparency`);
  }));
});

test("race snapshots carry the fault variants and finish state to the world bubble", () => {
  const publicCar = { ...car, distance: 0, speed: 0, oneWayTurn: "right", enginePowerIssue: "weak", finishedAtMs: 7000 };
  const [sceneCar] = raceCarsFromRoom({ players: [{ id: "one", car: publicCar }] });
  assert.equal(sceneCar.oneWayTurn, "right");
  assert.equal(sceneCar.enginePowerIssue, "weak");
  assert.equal(thoughtBubbleFrame(sceneCar, 8000), null);
});

test("repair and rejoin preserve the shared quad, and late image loads cannot revive disposed bubbles", (t) => {
  const pendingImages = [];
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, "Image");
  t.after(() => {
    if (originalImage) Object.defineProperty(globalThis, "Image", originalImage);
    else delete globalThis.Image;
  });
  globalThis.Image = class {
    constructor() { pendingImages.push(this); }
  };
  const app = createKartTestApp();
  const bubbles = createKartThoughtBubbles(app);
  const state = { car: { ...car, name: "One" } };
  const states = new Map([["one", state]]);
  try {
    bubbles.sync(states);
    const first = app.root.findByName("Thought bubble / One");
    const mesh = first.render.meshInstances[0].mesh;
    bubbles.sync(states);
    assert.equal(pendingImages.length, 4);
    state.car = { name: "One", defectIds: [] };
    bubbles.sync(states);
    assert.equal(app.root.findByName("Thought bubble / One"), null);
    assert.ok(mesh.vertexBuffer);
    state.car = { ...car, name: "One" };
    bubbles.sync(states);
    assert.equal(app.root.findByName("Thought bubble / One").render.meshInstances[0].mesh, mesh);
    bubbles.sync(new Map());
    for (const image of pendingImages) assert.doesNotThrow(() => image.onload());
    assert.equal(app.root.findByName("Thought bubble / One"), null);
  } finally {
    bubbles.destroy();
    app.destroy();
  }
});
