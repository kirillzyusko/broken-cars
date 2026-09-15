import * as pc from "playcanvas";
import { createKartImpactEffects } from "./kart-impact-effects.js";
import { resultsLapPose } from "./results-lap.js";
import { createTireMarks } from "./tire-marks.js";
import { createKartThoughtBubbles } from "./kart-thought-bubbles.js";
import { createStartLights } from "./start-lights.js";
import { raceStartSignal } from "../shared/race-start.js";
import { createKartAudio } from "./kart-audio.js";
import { updateKartCamera } from "./kart-camera.js";
import { frameOffsetYaw, updateHomeCamera } from "./home-camera.js";
import { loadCorsicaMap, loadPhysics } from "./corsica-map.js";
import { loadRaceSkybox } from "./race-skybox.js";
import { createRaceWater } from "./race-water.js";
import { createKartVisual, loadKartAssets } from "./kart-visual.js";
import { setupRaceLighting, setupContactShadows } from "./race-lighting.js";
import { frontAxleWorldPosition, carWorldTransform, smoothingFactor } from "./race-scene-model.js";
import { cellPixelRect, splitScreenViews } from "./split-screen.js";
import { CAR_SIZE_WORLD, CAR_FRONT_AXLE_OFFSET_WORLD } from "../shared/race-config.js";
import track from "./corsica-track.json" with { type: "json" };

function cameraOptions() {
  return {
    clearColor: new pc.Color(0.59, 0.78, 0.85), nearClip: 0.08, farClip: 650,
    fov: 62, toneMapping: pc.TONEMAP_NEUTRAL, gammaCorrection: pc.GAMMA_SRGB,
  };
}

// What a camera follows and how it was last placed. The direct camera keeps
// one; a split screen keeps one per feed so every chase camera eases on its own.
function createCameraState(camera, mode, followId, { exclusive = false } = {}) {
  return { camera, mode, followId, exclusive, chase: null, placed: false, followKey: null, aspect: null };
}

export async function createRaceScene(canvas, { view, currentPlayerId, onStatus, isCancelled }) {
  onStatus("Loading physics…");
  await loadPhysics();
  if (isCancelled()) return null;
  const app = new pc.Application(canvas, { graphicsDeviceOptions: { alpha: false, antialias: true } });
  const device = app.graphicsDevice;
  device.maxPixelRatio = Math.min(window.devicePixelRatio, 1.5);
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  setupRaceLighting(app);
  const camera = new pc.Entity("Race camera");
  camera.addComponent("camera", cameraOptions());
  app.root.addChild(camera);
  const cameraFrame = setupContactShadows(app, camera);
  app.start();
  const main = createCameraState(camera, view, currentPlayerId);
  const scene = {
    audio: createKartAudio(), audioActive: true, impacts: createKartImpactEffects(app), tireMarks: createTireMarks(app),
    thoughtBubbles: createKartThoughtBubbles(app),
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    app, camera, cameraFrame, main, split: null, copyShader: null,
    carStates: new Map(), obstacleStates: new Map(), materials: [],
    map: null, skybox: null, water: null, kartAssets: null,
    // The direct camera keeps its plain properties for the preview and sandbox pages.
    get view() { return main.mode; },
    set view(mode) { main.mode = mode; },
    get currentPlayerId() { return main.followId; },
    set currentPlayerId(id) { main.followId = id; },
    get cameraPlaced() { return main.placed; },
    set cameraPlaced(placed) { for (const state of cameraStates(scene)) state.placed = placed; },
    /** `feeds`: `[{ key, playerId }]` in screen order, or null for the single direct camera. */
    setSplitScreen(feeds) { setSplitScreen(scene, feeds); },
    destroy() {
      scene.audio.dispose();
      scene.tireMarks.destroy();
      scene.impacts.destroy();
      scene.thoughtBubbles.destroy();
      scene.startLights?.destroy();
      destroySplitViews(scene);
      cameraFrame.destroy();
      app.scene.skybox = null;
      scene.skybox?.destroy();
      // Release GPU resources while the graphics device still exists; after
      // app.destroy() their teardown throws on the destroyed device.
      scene.water?.destroy();
      scene.materials.forEach((m) => m.destroy());
      scene.copyShader?.destroy();
      app.destroy();
    },
  };
  device.on("resizecanvas", () => layoutSplitViews(scene));
  app.on("postrender", () => presentSplitViews(scene));
  try {
    onStatus("Loading Corsica GP…");
    scene.skybox = await loadRaceSkybox(app, isCancelled);
    if (isCancelled()) { scene.destroy(); return null; }
    scene.map = await loadCorsicaMap(app, isCancelled);
    if (isCancelled()) { scene.destroy(); return null; }
    scene.startLights = createStartLights(scene.map.visual);
    scene.water = createRaceWater(app, scene.map.visual, scene.skybox);
    onStatus("Loading karts…");
    scene.kartAssets = await loadKartAssets(app, isCancelled);
    if (isCancelled()) { scene.destroy(); return null; }
    app.on("update", (dt) => {
      scene.updateDriving?.(Math.min(dt, 0.1));
      updateScene(scene, Math.min(dt, 0.1));
    });
    updateScene(scene, 0);
    onStatus("");
    return scene;
  } catch (error) {
    scene.destroy();
    throw error;
  }
}

export function syncCars(scene, cars) {
  const active = new Set(cars.map((car) => car.id));
  for (const [id, state] of scene.carStates) {
    if (!active.has(id)) { state.entity.destroy(); scene.carStates.delete(id); }
  }
  for (const car of cars) {
    let state = scene.carStates.get(car.id);
    if (!state) {
      const visual = createKartVisual(scene.kartAssets);
      const entity = new pc.Entity(`Front axle / ${car.name}`);
      const axle = frontAxleWorldPosition(car.position, car.position.yaw);
      entity.setPosition(axle.x, axle.y, axle.z);
      entity.setEulerAngles(0, car.position.yaw, 0);
      scene.app.root.addChild(entity);
      entity.addChild(visual.entity);
      // Match the body center despite the visual root being at the front axle.
      entity.addComponent("collision", {
        type: "box", halfExtents: new pc.Vec3(CAR_SIZE_WORLD.x / 2, CAR_SIZE_WORLD.y / 2, CAR_SIZE_WORLD.z / 2),
        linearOffset: new pc.Vec3(0, 0, CAR_FRONT_AXLE_OFFSET_WORLD),
      });
      entity.addComponent("rigidbody", { type: "kinematic" });
      state = { entity, visual, worldPosition: car.worldPosition ? { ...car.worldPosition } : null, distance: car.distance, lane: car.lane,
        heading: car.heading, car };
      scene.carStates.set(car.id, state);
    }
    // A rematch or preview seek must not interpolate backwards around the circuit.
    if (car.resetVersion !== state.car.resetVersion || Math.abs(car.distance - state.car.distance) > 30) {
      state.worldPosition = car.worldPosition ? { ...car.worldPosition } : null;
      state.distance = car.distance;
      state.lane = car.lane;
      state.heading = car.heading;
      state.wheelPose = null;
      state.tireContacts = null;
      scene.cameraPlaced = false;
    }
    state.car = car;
    state.visual.applyDefects(car.defectIds);
  }
  scene.thoughtBubbles.sync(scene.carStates);
}

function createMaterial(scene, color) {
  const material = new pc.StandardMaterial();
  material.diffuse.fromString(color);
  material.gloss = 0.4;
  material.update();
  scene.materials.push(material);
  return material;
}

function childBox(parent, name, material, position, size) {
  const entity = new pc.Entity(name);
  entity.addComponent("render", { type: "box", material, castShadows: true });
  entity.setLocalPosition(position.x, position.y, position.z);
  entity.setLocalScale(size.x, size.y, size.z);
  parent.addChild(entity);
  return entity;
}

export function syncObstacles(scene, obstacles) {
  const active = new Set(obstacles.map((obstacle) => obstacle.id));
  for (const [id, state] of scene.obstacleStates) {
    if (!active.has(id)) { state.entity.destroy(); scene.obstacleStates.delete(id); }
  }
  for (const obstacle of obstacles) {
    const signature = JSON.stringify(obstacle);
    const previous = scene.obstacleStates.get(obstacle.id);
    if (previous?.signature === signature) continue;
    previous?.entity.destroy();
    const { position, size } = obstacle;
    const entity = new pc.Entity(obstacle.label);
    scene.app.root.addChild(entity);
    childBox(entity, "Barrier body", createMaterial(scene, obstacle.color), { x: 0, y: 0, z: 0 }, size);
    entity.setPosition(position.x, position.y, position.z);
    entity.setEulerAngles(0, position.yaw, 0);
    entity.addComponent("collision", { type: "box", halfExtents: new pc.Vec3(size.x / 2, size.y / 2, size.z / 2) });
    entity.addComponent("rigidbody", { type: "static" });
    scene.obstacleStates.set(obstacle.id, { entity, signature });
  }
}

function updateScene(scene, dt) {
  scene.water?.update(dt);
  const blend = smoothingFactor(dt);
  if (scene.view === "results" && !scene.reducedMotion) scene.resultsTime = (scene.resultsTime ?? 0) + dt;
  const finishDistance = Math.max(0, ...[...scene.carStates.values()].map((state) => state.car.distance));
  for (const state of scene.carStates.values()) {
    state.distance = pc.math.lerp(state.distance, state.car.distance, blend);
    state.lane = pc.math.lerp(state.lane, state.car.lane, blend);
    const amount = scene.updateDriving ? 1 : blend;
    if (state.car.worldPosition) {
      state.worldPosition ??= { ...state.car.worldPosition };
      for (const axis of ["x", "y", "z"]) state.worldPosition[axis] = pc.math.lerp(state.worldPosition[axis], state.car.worldPosition[axis], amount);
    }
    const turn = ((state.car.heading - state.heading + 180) % 360 + 360) % 360 - 180;
    state.heading += turn * amount;
    // Interpolate progress before sampling the curve, avoiding shortcuts across chicanes.
    const pose = scene.view === "results"
      ? resultsLapPose(finishDistance, state.car.index, scene.resultsTime ?? 0)
      : carWorldTransform(state, state.car.index, state.car.carCount);
    state.pose = pose;
    state.impactRemaining = Math.max(0, (state.impactRemaining ?? 0) - dt);
    if (state.seenCollisions !== undefined && state.car.collisionCount > state.seenCollisions
      && state.car.lastCollision?.impactSpeed > 1 && scene.audioActive) {
      state.impactRemaining = 0.22;
      state.impactStrength = Math.min(0.07, state.car.lastCollision.impactSpeed * 0.006);
      if (!scene.reducedMotion) scene.impacts.burst(pose, state.car.lastCollision);
    }
    state.seenCollisions = state.car.collisionCount;
    const axle = frontAxleWorldPosition(pose, pose.yaw);
    state.entity.setPosition(axle.x, axle.y, axle.z);
    state.entity.setEulerAngles(0, pose.yaw, 0);
    const previous = state.wheelPose;
    const sideways = state.car.defectIds?.includes("sideways_wheels");
    const wheelForward = sideways ? { x: -pose.forward.z, z: pose.forward.x } : pose.forward;
    const travel = previous ? (pose.x - previous.x) * wheelForward.x + (pose.z - previous.z) * wheelForward.z : 0;
    state.visual.updateMotion(Math.abs(travel) < 2 ? travel : 0, (start, end) =>
      scene.app.systems.rigidbody.raycastFirst(new pc.Vec3(start.x, start.y, start.z), new pc.Vec3(end.x, end.y, end.z),
        { filterCollisionMask: pc.BODYGROUP_STATIC }));
    const marking = (state.car.drifting || state.car.braking) && state.car.speed > 1
      && !state.car.offRoad && !state.car.defectIds?.includes("no_wheels");
    if (marking) {
      const contacts = ["RL", "RR"].map((slot) => {
        const wheel = state.visual.entity.findByName(`Part.Wheel.${slot}`);
        const center = wheel.getPosition();
        const hit = scene.app.systems.rigidbody.raycastFirst(
          new pc.Vec3(center.x, center.y + 0.15, center.z),
          new pc.Vec3(center.x, center.y - 0.55, center.z),
          { filterCollisionMask: pc.BODYGROUP_STATIC });
        return hit && hit.normal.y > 0.7 ? hit.point.clone() : null;
      });
      state.tireContacts ??= contacts;
      contacts.forEach((point, i) => {
        const old = state.tireContacts[i];
        if (!point || !old || Math.hypot(point.x - old.x, point.z - old.z) > 1
          || scene.tireMarks.segment(old, point)) state.tireContacts[i] = point;
      });
    } else state.tireContacts = null;
    state.wheelPose = { x: pose.x, z: pose.z };
  }
  scene.tireMarks.update(dt);
  scene.impacts.update(dt);
  const start = scene.startClock;
  const now = start ? start.serverNow + performance.now() - start.receivedAt : 0;
  const signal = raceStartSignal(start?.startsAt, now);
  scene.thoughtBubbles.update(Number.isFinite(start?.startsAt) ? now - start.startsAt : null, scene.reducedMotion);
  scene.startLights?.update(signal);
  scene.audio.startSignal(start?.id, signal);
  updateCameras(scene, dt);
  const listener = scene.split?.views[0]?.state.camera ?? scene.camera;
  const cars = [...scene.carStates.values()].map((state) => ({ ...state.car, position: state.pose }));
  scene.audio.update(cars, scene.currentPlayerId, { yaw: listener.getEulerAngles().y }, dt, scene.audioActive);
}

// ---------- Cameras ----------

const routeCenter = track.points.reduce((a, p) => ({ x: a.x + p[0] / track.points.length, z: a.z + p[2] / track.points.length }), { x: 0, z: 0 });

function cameraStates(scene) {
  return scene.split ? scene.split.views.map((view) => view.state) : [scene.main];
}

function updateCameras(scene, dt) {
  const raycast = (start, end) => scene.app.systems.rigidbody.raycastFirst(
    new pc.Vec3(start.x, start.y, start.z), new pc.Vec3(end.x, end.y, end.z),
    { filterCollisionMask: pc.BODYGROUP_STATIC },
  );
  for (const state of cameraStates(scene)) placeCamera(scene, state, dt, raycast);
}

function placeCamera(scene, state, dt, raycast) {
  const { camera } = state;
  const driver = state.followId ? scene.carStates.get(state.followId) : null;
  const leader = [...scene.carStates.values()].sort((a, b) => b.distance - a.distance)[0];
  // A split-screen feed belongs to one racer; the direct camera falls back to the leader.
  const followed = driver ?? (state.exclusive ? null : leader);
  if (state.mode === "cinematic") {
    // The home screen's attract reel needs no racer: it tours the island on its own clock.
    state.cinematic = updateHomeCamera(state.cinematic, dt, { raycast, still: scene.reducedMotion });
    const { position, target, fov } = state.cinematic;
    const device = scene.app.graphicsDevice;
    camera.setPosition(position.x, position.y, position.z);
    camera.lookAt(target.x, target.y, target.z);
    // Turn left a little so the subject sits beside the title card, not behind it.
    camera.rotateLocal(0, frameOffsetYaw(fov, state.aspect ?? device.width / device.height), 0);
    camera.camera.fov = fov;
    state.chase = null;
    state.placed = true;
    return;
  }
  if (state.mode === "overview" || !followed?.pose) {
    const device = scene.app.graphicsDevice;
    const aspect = state.aspect ?? device.width / device.height;
    const fit = Math.max(1, 1.4 / aspect);
    camera.setPosition(routeCenter.x + 74 * fit, 114 * fit, routeCenter.z + 88 * fit);
    camera.lookAt(routeCenter.x, 0, routeCenter.z);
    state.placed = false;
    state.chase = null;
    camera.camera.fov = 62;
    return;
  }
  const pose = followed.pose;
  const followKey = `${state.mode}:${followed.car.id}`;
  if (state.followKey !== followKey) state.placed = false;
  state.followKey = followKey;
  if (state.mode === "driver" || state.mode === "results") {
    state.chase = updateKartCamera(state.chase, pose, state.mode === "results" ? 7 : followed.car.speed, dt, { reset: !state.placed, raycast });
    const { position, target, fov } = state.chase;
    const impact = !scene.reducedMotion && state.mode === "driver" ? followed.impactRemaining ?? 0 : 0;
    const shake = (followed.impactStrength ?? 0) * impact / 0.22;
    camera.setPosition(position.x + Math.sin(impact * 130) * shake, position.y + Math.cos(impact * 110) * shake, position.z);
    camera.lookAt(target.x, target.y, target.z);
    camera.camera.fov = fov;
    state.placed = true;
    return;
  }
  state.chase = null;
  camera.camera.fov = 62;
  const cockpit = state.mode === "cockpit";
  const spectator = state.mode === "spectator";
  const back = cockpit ? -0.5 : spectator ? 20 : 6.5;
  const height = cockpit ? 1.25 : spectator ? 24 : 3.5;
  const target = new pc.Vec3(pose.x + pose.forward.x * 4, pose.y + 0.7, pose.z + pose.forward.z * 4);
  const desired = new pc.Vec3(pose.x - pose.forward.x * back, pose.y + height, pose.z - pose.forward.z * back);
  if (!cockpit) {
    const origin = new pc.Vec3(pose.x, pose.y + 1.4, pose.z);
    const hit = scene.app.systems.rigidbody.raycastFirst(origin, desired, { filterCollisionMask: pc.BODYGROUP_STATIC });
    if (hit) desired.lerp(origin, desired, Math.max(0, hit.hitFraction - 0.06));
  }
  const amount = state.placed ? smoothingFactor(dt, 8) : 1;
  const position = camera.getPosition().clone().lerp(camera.getPosition(), desired, amount);
  camera.setPosition(position);
  camera.lookAt(target);
  state.placed = true;
}

// ---------- Split screen ----------
// One map and one graphics device. Each feed renders through the race's full
// post-processing into its own texture at panel resolution, then the finished
// images tile the canvas, exactly like the four-camera graphics test level.

function setSplitScreen(scene, feeds) {
  const views = feeds ? splitScreenViews(feeds) : null;
  const signature = views?.map((view) => [view.key, view.mode, view.playerId, view.x, view.y, view.w, view.h].join(":")).join("|") ?? null;
  if (signature === (scene.split?.signature ?? null)) return;
  destroySplitViews(scene);
  // With a split screen every feed draws to its own texture, so the direct camera rests.
  scene.camera.enabled = !views;
  if (!views) return;
  const device = scene.app.graphicsDevice;
  scene.copyShader ??= createCopyShader(device);
  scene.split = {
    signature,
    views: views.map((cell, index) => {
      const texture = new pc.Texture(device, {
        name: `Feed / ${cell.key}`, width: 2, height: 2, format: pc.PIXELFORMAT_RGBA8,
        mipmaps: false, minFilter: pc.FILTER_LINEAR, magFilter: pc.FILTER_LINEAR,
        addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
      });
      const target = new pc.RenderTarget({ colorBuffer: texture, depth: true });
      const camera = new pc.Entity(`Feed camera / ${cell.key}`);
      camera.addComponent("camera", {
        ...cameraOptions(), renderTarget: target, priority: index, aspectRatioMode: pc.ASPECT_MANUAL,
      });
      scene.app.root.addChild(camera);
      const frame = setupContactShadows(scene.app, camera);
      const state = createCameraState(camera, cell.mode, cell.playerId, { exclusive: true });
      return { cell, state, frame, target, texture, rect: new pc.Vec4() };
    }),
  };
  layoutSplitViews(scene);
}

function layoutSplitViews(scene) {
  if (!scene.split) return;
  const device = scene.app.graphicsDevice;
  for (const view of scene.split.views) {
    const rect = cellPixelRect(view.cell, device.width, device.height);
    view.rect.set(rect.x, rect.y, rect.width, rect.height);
    view.target.resize(rect.width, rect.height);
    view.state.aspect = rect.width / rect.height;
    view.state.camera.camera.aspectRatio = view.state.aspect;
  }
}

function presentSplitViews(scene) {
  if (!scene.split) return;
  const device = scene.app.graphicsDevice;
  device.setBlendState(pc.BlendState.NOBLEND);
  const uniform = device.scope.resolve("viewTexture");
  for (const view of scene.split.views) {
    uniform.setValue(view.texture);
    pc.drawQuadWithShader(device, null, scene.copyShader, view.rect, view.rect);
  }
}

function destroySplitViews(scene) {
  if (!scene.split) return;
  for (const view of scene.split.views) {
    view.frame.destroy();
    view.state.camera.destroy();
    view.target.destroy();
    view.texture.destroy();
  }
  scene.split = null;
}

function createCopyShader(device) {
  return pc.createShaderFromCode(device, `
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main(void) {
      vUv = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `, `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D viewTexture;
    void main(void) { gl_FragColor = texture2D(viewTexture, vUv); }
  `, "Race feed copy", { aPosition: pc.SEMANTIC_POSITION });
}
