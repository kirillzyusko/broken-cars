import assert from "node:assert/strict";
import test from "node:test";
import { raceStartSignal } from "../shared/race-start.js";
import { GameEngine } from "../server/game-engine.js";
import { createStartLights } from "../src/start-lights.js";
import { createKartTestApp, readKartContainer } from "./helpers/kart-assets.js";
import { startRepairedRace } from "./helpers/repaired-race.js";

test("the start clock shows ready, three counts, GO, then clears the overlay", () => {
  const startsAt = 10000;
  for (const [now, step, label] of [[5000, 0, "READY"], [6999, 0, "READY"], [7000, 1, "3"], [8000, 2, "2"], [9000, 3, "1"], [9999, 3, "1"], [10000, 4, "GO!"], [11099, 4, "GO!"], [11100, 4, ""]]) {
    const signal = raceStartSignal(startsAt, now);
    assert.equal(signal.step, step);
    assert.equal(signal.label, label);
    assert.ok(signal.pulse >= 0 && signal.pulse <= 1);
  }
  assert.equal(raceStartSignal(null, 0).label, "");
  assert.equal(raceStartSignal(undefined, 0).step, 0);
});

test("held throttle revs during countdown, but only GO releases the car", async () => {
  const engine = new GameEngine({ buildDurationMs: 1 });
  const room = engine.createRoom(1000);
  const player = engine.joinPlayer(room.id, "driver", 1000);
  engine.startPrompting(room.id, room.hostToken, 1000);
  engine.submitPrompt(room.id, player.id, "Kart", 1000);
  await startRepairedRace(engine, room, 1002);
  assert.equal(room.startsAt, 6002);
  const position = { ...player.car.worldPosition };
  engine.setControls(room.id, player.id, { accelerate: true, left: true });
  assert.ok(engine.tick(3000).includes(room.id), "rev changes reach other clients immediately");
  engine.tick(room.startsAt - 1);
  assert.equal(player.car.throttle, 1);
  assert.equal(player.car.speed, 0);
  assert.deepEqual(player.car.worldPosition, position);
  engine.tick(room.startsAt);
  assert.equal(room.phase, "racing");
  engine.tick(room.startsAt + 50);
  assert.ok(player.car.speed > 0);
  assert.notDeepEqual(player.car.worldPosition, position);
});

test("the shipped gantry has fifteen independently animated lenses in three rows", async () => {
  const app = createKartTestApp();
  const container = await readKartContainer(app, "../../maps/corsica-gp/visual.glb");
  const visual = container.instantiateRenderEntity();
  app.root.addChild(visual);
  const original = visual.findComponents("render").flatMap((r) => r.meshInstances).filter((mi) => mi.material.name === "Start / signal red");
  const lights = createStartLights(visual);
  try {
    const root = visual.findByName("Animated start lights");
    assert.equal(root.children.length, 15);
    assert.ok(original.length > 0 && original.every((mi) => !mi.visible));
    const rows = [1, 2, 3].map((row) => root.findByName(`Start lens row ${row}`).render.meshInstances[0].material);
    for (let step = 0; step <= 3; step++) {
      lights.update({ step, pulse: 0 });
      assert.equal(rows.filter((m) => m.emissive.r > 1).length, step);
    }
    lights.update({ step: 4, pulse: 1 });
    assert.ok(rows.every((m) => m.emissive.g > m.emissive.r * 5));
    lights.update({ step: 0, pulse: 0 });
    assert.ok(rows.every((m) => m.emissive.r === 0 && m.emissive.g === 0));
  } finally {
    lights.destroy();
    visual.destroy();
    container.destroy();
    app.destroy();
  }
});
