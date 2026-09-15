import assert from "node:assert/strict";
import test from "node:test";
import { createTireMarks } from "../src/tire-marks.js";
import { createKartTestApp } from "./helpers/kart-assets.js";

test("tire marks reject teleport trails, reuse a bounded mesh, fade and dispose", () => {
  const app = createKartTestApp();
  const marks = createTireMarks(app);
  try {
    const a = { x: 0, y: 0, z: 0 };
    assert.equal(marks.segment(a, { x: 10, y: 0, z: 0 }), false);
    assert.equal(marks.segment(a, { x: 0.1, y: 1, z: 0 }), false);
    for (let i = 0; i < 1500; i++) {
      assert.equal(marks.segment({ x: i * 0.1, y: 0, z: 0 }, { x: i * 0.1 + 0.1, y: 0, z: 0 }), true);
    }
    marks.update(0);
    const mesh = app.root.findByName("Tire marks").render.meshInstances[0].mesh;
    assert.equal(mesh.vertexBuffer.numVertices, 4096);
    const colors = [];
    mesh.getColors(colors);
    assert.ok(colors.some((value) => value > 0));
    marks.update(17);
    const faded = [];
    mesh.getColors(faded);
    assert.ok(faded.every((value) => value === 0));
  } finally {
    marks.destroy();
    assert.equal(app.root.findByName("Tire marks"), null);
    app.destroy();
  }
});
