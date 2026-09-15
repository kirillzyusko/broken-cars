import assert from "node:assert/strict";
import test from "node:test";
import { updateKartCamera } from "../src/kart-camera.js";

const pose = { x: 0, y: 0.25, z: 0, yaw: 0 };
const near = (a, b, epsilon = 1e-9) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);

test("chase camera follows translation immediately and holds the kart below centre", () => {
  const initial = updateKartCamera(null, pose, 28, 0);
  const moved = { ...pose, x: 20, z: -100 };
  const camera = updateKartCamera(initial, moved, 28, 1 / 60);
  near(camera.position.x - initial.position.x, moved.x);
  near(camera.position.z - initial.position.z, moved.z);
  near(camera.target.x - initial.target.x, moved.x);
  near(camera.target.z - initial.target.z, moved.z);
  // Project the body centre onto the camera's vertical field of view.
  const pitch = Math.atan2(camera.position.y - camera.target.y, Math.hypot(camera.target.x - camera.position.x, camera.target.z - camera.position.z));
  const kartPitch = Math.atan2(camera.position.y - moved.y, camera.position.z - moved.z);
  const screenY = 0.5 + Math.tan(kartPitch - pitch) / (2 * Math.tan(camera.fov * Math.PI / 360));
  assert.ok(screenY > 0.6 && screenY < 0.8);
});

test("turn following is bounded and crosses 180 degrees by the shortest route", () => {
  const initial = updateKartCamera(null, { ...pose, yaw: 179 }, 15, 0);
  const next = updateKartCamera(initial, { ...pose, yaw: -179 }, 15, 1 / 60);
  const turn = ((next.yaw - initial.yaw + 180) % 360 + 360) % 360 - 180;
  assert.ok(turn > 0 && turn < 2);
  const tight = updateKartCamera(next, { ...pose, yaw: -90 }, 15, 1 / 60);
  assert.ok(Math.abs(tight.yaw + 90) <= 12);
});

test("speed framing eases without flipping when reversing; reset snaps to the kart", () => {
  const initial = updateKartCamera(null, pose, 0, 0);
  const accelerating = updateKartCamera(initial, pose, 28, 1 / 60);
  assert.ok(accelerating.fov > 58 && accelerating.fov < 64);
  assert.ok(accelerating.position.z > initial.position.z);
  const reverse = updateKartCamera(initial, pose, -6, 1 / 60);
  assert.equal(reverse.yaw, 0);
  assert.ok(reverse.position.z > pose.z);
  const resetPose = { x: 100, y: 1, z: 30, yaw: 90 };
  const reset = updateKartCamera(accelerating, resetPose, 0, 1 / 60, { reset: true });
  near(reset.yaw, 90);
  near(reset.position.x, resetPose.x + 4.2);
  near(reset.height, resetPose.y);
});

test("wall clearance retracts immediately and returns smoothly without a second position lerp", () => {
  const initial = updateKartCamera(null, pose, 0, 0);
  let probes = 0;
  const blocked = updateKartCamera(initial, pose, 0, 1 / 60, { raycast: () => {
    probes++;
    return probes === 2 ? { hitFraction: 0.5 } : null;
  } });
  assert.equal(probes, 3);
  assert.ok(blocked.boom < 0.5);
  assert.ok(blocked.position.z < initial.position.z / 2);
  const cleared = updateKartCamera(blocked, pose, 0, 1 / 60);
  assert.ok(cleared.boom > blocked.boom && cleared.boom < 1);
});

test("camera settling is consistent at 30, 60, and 144 fps", () => {
  const results = [30, 60, 144].map((fps) => {
    let camera = updateKartCamera(null, pose, 0, 0);
    for (let i = 0; i < fps; i++) camera = updateKartCamera(camera, { ...pose, yaw: 10 }, 28, 1 / fps);
    return camera;
  });
  for (const camera of results.slice(1)) {
    near(camera.yaw, results[0].yaw);
    near(camera.fov, results[0].fov);
    near(camera.position.z, results[0].position.z);
  }
});
