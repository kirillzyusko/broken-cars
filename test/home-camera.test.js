import assert from "node:assert/strict";
import test from "node:test";
import {
  HOME_REEL_DURATION, HOME_SHOTS, HOME_STILL_TIME, HOME_SUBJECT_FRAME_X, ISLAND_CENTER,
  frameOffsetYaw, homeCameraShot, homeShotAt, updateHomeCamera,
} from "../src/home-camera.js";
import { sampleTrack } from "../shared/track-world.js";

const near = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const shotStart = (index) => HOME_SHOTS.slice(0, index).reduce((sum, shot) => sum + shot.duration, 0);

test("the reel plays every shot in order and loops", () => {
  HOME_SHOTS.forEach((shot, index) => {
    assert.equal(homeShotAt(shotStart(index) + 0.5).index, index);
    assert.equal(homeShotAt(shotStart(index) + shot.duration - 0.01).index, index);
  });
  assert.equal(HOME_REEL_DURATION, HOME_SHOTS.reduce((sum, shot) => sum + shot.duration, 0));
  assert.equal(homeShotAt(HOME_REEL_DURATION + 0.5).index, 0);
  assert.equal(homeShotAt(-0.5).index, HOME_SHOTS.length - 1);
  assert.ok(HOME_SHOTS.some((shot) => shot.kind === "orbit"));
  assert.ok(HOME_SHOTS.some((shot) => shot.kind === "flyover"));
  assert.ok(HOME_SHOTS.some((shot) => shot.kind === "crane"));
});

test("orbits keep their distance and height while looking at the island", () => {
  const index = HOME_SHOTS.findIndex((shot) => shot.kind === "orbit");
  const shot = HOME_SHOTS[index];
  const frames = [0, 0.5, 0.999].map((progress) => homeCameraShot(shotStart(index) + shot.duration * progress));
  for (const frame of frames) {
    near(Math.hypot(frame.position.x - ISLAND_CENTER.x, frame.position.z - ISLAND_CENTER.z), shot.radius);
    near(frame.position.y, shot.height);
    near(frame.target.x, ISLAND_CENTER.x);
    near(frame.target.z, ISLAND_CENTER.z);
    assert.equal(frame.fov, shot.fov);
  }
  // The camera actually travels around the island rather than holding still.
  assert.ok(distance(frames[0].position, frames[2].position) > 50);
});

test("flyovers hover above the road and look ahead down the lap", () => {
  const index = HOME_SHOTS.findIndex((shot) => shot.kind === "flyover");
  const shot = HOME_SHOTS[index];
  for (const elapsed of [0, 4, 8, 12, shot.duration - 0.01]) {
    const frame = homeCameraShot(shotStart(index) + elapsed);
    const eye = sampleTrack(shot.start + shot.speed * elapsed - shot.back);
    const look = sampleTrack(shot.start + shot.speed * elapsed + shot.ahead);
    near(frame.position.x, eye.x);
    near(frame.position.z, eye.z);
    near(frame.position.y, eye.y + shot.height);
    near(frame.target.x, look.x);
    near(frame.target.z, look.z);
    assert.ok(frame.target.y < frame.position.y);
  }
});

test("a crane shot rises, pulls back and moves smoothly from frame to frame", () => {
  const index = HOME_SHOTS.findIndex((shot) => shot.kind === "crane");
  const shot = HOME_SHOTS[index];
  const start = shotStart(index);
  const first = homeCameraShot(start);
  const middle = homeCameraShot(start + shot.duration / 2);
  const last = homeCameraShot(start + shot.duration - 0.001);
  assert.ok(first.position.y < middle.position.y && middle.position.y < last.position.y);
  assert.ok(last.position.y > shot.rise - 1);
  assert.ok(distance(first.position, last.position) > shot.pullBack);
  let previous = first;
  for (let time = start + 1 / 60; time < start + shot.duration; time += 1 / 60) {
    const frame = homeCameraShot(time);
    assert.ok(distance(previous.position, frame.position) < 0.5);
    assert.ok(distance(previous.target, frame.target) < 0.5);
    previous = frame;
  }
});

test("stepping the reel only cuts at shot boundaries", () => {
  let state = updateHomeCamera(null, 0);
  assert.equal(state.cut, true);
  assert.equal(state.index, 0);
  state = updateHomeCamera(state, 1 / 60);
  assert.equal(state.cut, false);
  near(state.time, 1 / 60);
  state = updateHomeCamera(state, HOME_SHOTS[0].duration);
  assert.equal(state.index, 1);
  assert.equal(state.cut, true);
  const same = updateHomeCamera(state, 1 / 60);
  assert.equal(same.cut, false);
  assert.ok(distance(state.position, same.position) < 0.5);
});

test("scenery in front of a low shot moves the lens in; orbits ignore it", () => {
  const flyover = HOME_SHOTS.findIndex((shot) => shot.kind === "flyover");
  const clear = updateHomeCamera({ time: shotStart(flyover) + 3, index: flyover }, 0);
  const blocked = updateHomeCamera({ time: shotStart(flyover) + 3, index: flyover }, 0, { raycast: () => ({ hitFraction: 0.5 }) });
  near(distance(blocked.position, blocked.target), distance(clear.position, clear.target) * 0.46);
  assert.ok(blocked.position.y >= 1.2);
  const orbit = HOME_SHOTS.findIndex((shot) => shot.kind === "orbit");
  let calls = 0;
  const orbiting = updateHomeCamera({ time: shotStart(orbit) + 3, index: orbit }, 0, { raycast: () => { calls++; return { hitFraction: 0.1 }; } });
  assert.equal(calls, 0);
  near(orbiting.position.y, HOME_SHOTS[orbit].height);
});

test("wide screens turn the camera so the subject sits beside the card", () => {
  assert.equal(frameOffsetYaw(56, 9 / 16), 0);
  assert.equal(frameOffsetYaw(56, 1), 0);
  for (const [fov, aspect] of [[44, 16 / 9], [56, 16 / 9], [52, 4 / 3]]) {
    const yaw = frameOffsetYaw(fov, aspect);
    assert.ok(yaw > 0 && yaw < 30, `${yaw}`);
    // Project the subject back through the turned camera: it lands at the requested spot.
    const halfWidth = Math.tan(fov / 2 * Math.PI / 180) * aspect;
    const frameX = 0.5 + Math.tan(yaw * Math.PI / 180) / (2 * halfWidth);
    near(frameX, HOME_SUBJECT_FRAME_X);
  }
  assert.ok(frameOffsetYaw(56, 16 / 9) > frameOffsetYaw(44, 16 / 9));
});

test("reduced motion holds the establishing frame", () => {
  const still = updateHomeCamera(null, 0, { still: true });
  const later = updateHomeCamera(still, 30, { still: true });
  assert.equal(still.time, HOME_STILL_TIME);
  assert.equal(later.index, 0);
  assert.deepEqual(later.position, still.position);
  assert.deepEqual(later.target, still.target);
  assert.equal(later.cut, false);
});
