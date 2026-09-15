import test from "node:test";
import assert from "node:assert/strict";
import { createKartImpactEffects } from "../src/kart-impact-effects.js";
import { createKartTestApp } from "./helpers/kart-assets.js";

test("impact sparks have a fixed cap and release their scene resources", () => {
  const app = createKartTestApp();
  const effects = createKartImpactEffects(app);
  const sparks = app.root.children.filter((entity) => entity.name === "Impact spark");
  try {
    for (let i = 0; i < 50; i++) effects.burst({ x: 0, y: 0, z: 0 }, { impactSpeed: 8, normal: { x: 1, z: 0 } });
    assert.equal(sparks.length, 48);
    assert.equal(sparks.filter((s) => s.enabled).length, 48);
    assert.ok(sparks[0].render.meshInstances[0].material.emissive.r > 0);
    effects.update(1);
    assert.ok(sparks.every((s) => !s.enabled));
  } finally {
    effects.destroy();
    assert.equal(app.root.findByName("Impact spark"), null);
    app.destroy();
  }
});
