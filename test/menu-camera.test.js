import test from "node:test";
import assert from "node:assert/strict";
import { menuCameraPose, MENU_TOUR_SECONDS } from "../src/menu-camera.js";

test("menu camera loops with matching position, target and velocity", () => {
  const first = menuCameraPose(0);
  const last = menuCameraPose(MENU_TOUR_SECONDS);
  const before = menuCameraPose(MENU_TOUR_SECONDS - 0.001);
  const after = menuCameraPose(0.001);
  for (const part of ["position", "target"]) for (const axis of ["x", "y", "z"]) {
    assert.ok(Math.abs(first[part][axis] - last[part][axis]) < 1e-8);
    const incoming = (last[part][axis] - before[part][axis]) / 0.001;
    const outgoing = (after[part][axis] - first[part][axis]) / 0.001;
    assert.ok(Math.abs(incoming - outgoing) < 0.02, "loop must not snap or reverse direction");
  }
});

test("menu tour keeps a finite forward view throughout the loop", () => {
  for (let t = 0; t < MENU_TOUR_SECONDS; t += 0.25) {
    const { position, target } = menuCameraPose(t);
    assert.ok([...Object.values(position), ...Object.values(target)].every(Number.isFinite));
    assert.ok(Math.hypot(position.x - target.x, position.z - target.z) > 3);
    assert.ok(position.y > target.y, "camera should look down over the circuit");
  }
});
