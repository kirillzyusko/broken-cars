import { useEffect, useMemo, useRef, useState } from "react";
import * as pc from "playcanvas";
import {
  CAR_FRONT_AXLE_OFFSET_WORLD,
  CAR_SIZE_WORLD,
} from "../shared/race-config.js";
import {
  DISTANCE_TO_WORLD,
  ROAD_HALF_WIDTH,
  ROAD_WORLD_LENGTH,
  frontAxleWorldPosition,
  raceCarsFromRoom,
  raceObstaclesFromRoom,
  smoothingFactor,
} from "./race-scene-model.js";

function colorFromHex(hex) {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return new pc.Color(
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  );
}

function createMaterial(color, { emissive = 0, gloss = 0.25 } = {}) {
  const material = new pc.StandardMaterial();
  const parsedColor = typeof color === "string" ? colorFromHex(color) : color;
  material.diffuse.copy(parsedColor);
  material.gloss = gloss;
  if (emissive > 0) {
    material.emissive.copy(parsedColor).mulScalar(emissive);
  }
  material.update();
  return material;
}

function createBox(app, name, material, position, scale) {
  const entity = new pc.Entity(name);
  entity.addComponent("render", { type: "box", material });
  entity.setPosition(position.x, position.y, position.z);
  entity.setLocalScale(scale.x, scale.y, scale.z);
  app.root.addChild(entity);
  return entity;
}

function createChildBox(parent, name, material, position, scale) {
  const entity = new pc.Entity(name);
  entity.addComponent("render", { type: "box", material });
  entity.setLocalPosition(position.x, position.y, position.z);
  entity.setLocalScale(scale.x, scale.y, scale.z);
  parent.addChild(entity);
  return entity;
}

function buildTrack(app, obstacles) {
  const grass = createMaterial(new pc.Color(0.12, 0.2, 0.1), { gloss: 0.05 });
  const asphalt = createMaterial(new pc.Color(0.095, 0.105, 0.11), { gloss: 0.1 });
  const paint = createMaterial(new pc.Color(0.86, 0.87, 0.79), { emissive: 0.08 });
  const curb = createMaterial(new pc.Color(0.88, 0.18, 0.09), { gloss: 0.15 });
  const checkpoint = createMaterial(new pc.Color(0.78, 0.94, 0.22), {
    emissive: 0.12,
    gloss: 0.18,
  });
  const trackCenter = 2 - ROAD_WORLD_LENGTH / 2;
  const trackLength = ROAD_WORLD_LENGTH + 10;

  createBox(
    app,
    "Grass",
    grass,
    { x: 0, y: -0.25, z: trackCenter },
    { x: 52, y: 0.2, z: trackLength + 20 },
  );
  createBox(
    app,
    "Road",
    asphalt,
    { x: 0, y: -0.08, z: trackCenter },
    { x: ROAD_HALF_WIDTH * 2, y: 0.18, z: trackLength },
  );

  for (const side of [-1, 1]) {
    createBox(
      app,
      `Curb ${side}`,
      curb,
      { x: side * ROAD_HALF_WIDTH, y: 0.08, z: trackCenter },
      { x: 0.24, y: 0.18, z: trackLength },
    );
  }

  for (let z = 3; z > -ROAD_WORLD_LENGTH - 4; z -= 4) {
    for (const x of [-2, 2]) {
      createBox(
        app,
        "Lane marker",
        paint,
        { x, y: 0.04, z },
        { x: 0.09, y: 0.025, z: 1.8 },
      );
    }
  }

  for (let distance = 25; distance < 500; distance += 25) {
    const major = distance % 100 === 0;
    for (const side of [-1, 1]) {
      createBox(
        app,
        major ? `${distance} metre checkpoint` : "Roadside reflector",
        major ? checkpoint : paint,
        {
          x: side * (ROAD_HALF_WIDTH + (major ? 0.7 : 0.45)),
          y: major ? 0.65 : 0.24,
          z: -distance * DISTANCE_TO_WORLD,
        },
        major
          ? { x: 0.22, y: 1.3, z: 0.22 }
          : { x: 0.12, y: 0.46, z: 0.12 },
      );
    }
  }

  for (let column = 0; column < 8; column += 1) {
    createBox(
      app,
      "Finish line",
      column % 2 === 0 ? paint : asphalt,
      {
        x: -ROAD_HALF_WIDTH + 0.75 + column * 1.5,
        y: 0.055,
        z: -500 * DISTANCE_TO_WORLD,
      },
      { x: 1.5, y: 0.03, z: 0.7 },
    );
  }

  for (const obstacle of obstacles) {
    createBox(
      app,
      obstacle.label,
      createMaterial(obstacle.color, { emissive: 0.05, gloss: 0.2 }),
      obstacle.position,
      obstacle.size,
    );
  }
}

function createScene(canvas, view, obstacles, onError) {
  let app;
  try {
    app = new pc.Application(canvas, {
      graphicsDeviceOptions: { alpha: false, antialias: true },
    });
  } catch (error) {
    onError(error);
    return null;
  }

  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  app.scene.ambientLight = new pc.Color(0.48, 0.5, 0.55);

  const camera = new pc.Entity("Race camera");
  camera.addComponent("camera", {
    clearColor: new pc.Color(0.43, 0.67, 0.83),
    farClip: 220,
    fov: view === "driver" ? 60 : 52,
  });
  if (view === "driver") {
    camera.setPosition(0, 4.6, 8.5);
    camera.lookAt(0, 0, -18);
  } else {
    camera.setPosition(0, 15, 18);
    camera.lookAt(0, 0, -25);
  }
  app.root.addChild(camera);

  const sun = new pc.Entity("Sun");
  sun.addComponent("light", {
    type: "directional",
    color: new pc.Color(1, 0.96, 0.82),
    intensity: 1.35,
    castShadows: false,
  });
  sun.setEulerAngles(42, 28, 0);
  app.root.addChild(sun);

  buildTrack(app, obstacles);
  app.start();

  return {
    app,
    camera,
    carStates: new Map(),
    materials: new Map(),
    view,
    currentPlayerId: null,
  };
}

function ensureCarEntity(scene, car) {
  let state = scene.carStates.get(car.id);
  if (state) return state;

  const materialKey = `${car.color}:${car.isCurrent}`;
  let material = scene.materials.get(materialKey);
  if (!material) {
    material = createMaterial(car.color, {
      emissive: car.isCurrent ? 0.16 : 0.04,
      gloss: 0.55,
    });
    scene.materials.set(materialKey, material);
  }

  const wheelMaterial = createMaterial(new pc.Color(0.035, 0.04, 0.045), {
    gloss: 0.18,
  });
  const entity = new pc.Entity(`Front axle ${car.name}`);
  const visualYaw = -car.heading;
  const axlePosition = frontAxleWorldPosition(car.position, visualYaw);
  entity.setPosition(axlePosition.x, axlePosition.y, axlePosition.z);
  entity.setEulerAngles(0, visualYaw, 0);
  scene.app.root.addChild(entity);

  createChildBox(
    entity,
    `Body ${car.name}`,
    material,
    { x: 0, y: 0, z: CAR_FRONT_AXLE_OFFSET_WORLD },
    CAR_SIZE_WORLD,
  );

  const frontWheelPivots = [];
  for (const side of [-1, 1]) {
    const frontWheelPivot = new pc.Entity(`Front wheel pivot ${car.name}`);
    frontWheelPivot.setLocalPosition(
      side * (CAR_SIZE_WORLD.x / 2 + 0.07),
      -CAR_SIZE_WORLD.y * 0.36,
      0,
    );
    entity.addChild(frontWheelPivot);
    createChildBox(
      frontWheelPivot,
      `Front wheel ${car.name}`,
      wheelMaterial,
      { x: 0, y: 0, z: 0 },
      { x: 0.16, y: 0.24, z: 0.34 },
    );
    frontWheelPivots.push(frontWheelPivot);

    createChildBox(
      entity,
      `Rear wheel ${car.name}`,
      wheelMaterial,
      {
        x: side * (CAR_SIZE_WORLD.x / 2 + 0.07),
        y: -CAR_SIZE_WORLD.y * 0.36,
        z: CAR_SIZE_WORLD.z * 0.72,
      },
      { x: 0.16, y: 0.24, z: 0.34 },
    );
  }
  state = {
    entity,
    frontWheelPivots,
    target: new pc.Vec3(axlePosition.x, axlePosition.y, axlePosition.z),
    targetYaw: visualYaw,
    targetWheelYaw: -car.steeringAngle,
    wheelYaw: -car.steeringAngle,
    yaw: visualYaw,
  };
  scene.carStates.set(car.id, state);
  return state;
}

function syncCars(scene, cars) {
  const activeIds = new Set(cars.map((car) => car.id));
  for (const [id, state] of scene.carStates) {
    if (!activeIds.has(id)) {
      state.entity.destroy();
      scene.carStates.delete(id);
    }
  }

  for (const car of cars) {
    const state = ensureCarEntity(scene, car);
    const visualYaw = -car.heading;
    const axlePosition = frontAxleWorldPosition(car.position, visualYaw);
    state.target.set(axlePosition.x, axlePosition.y, axlePosition.z);
    state.targetYaw = visualYaw;
    state.targetWheelYaw = -car.steeringAngle;
  }
}

export default function RaceScene({ room, currentPlayerId = null, view = "spectator" }) {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const obstaclesRef = useRef(null);
  const [renderError, setRenderError] = useState("");
  if (!obstaclesRef.current) {
    obstaclesRef.current = raceObstaclesFromRoom(room);
  }
  const obstacles = obstaclesRef.current;
  const cars = useMemo(
    () => raceCarsFromRoom(room, currentPlayerId),
    [currentPlayerId, room],
  );
  const focusCar = view === "driver"
    ? cars.find((car) => car.isCurrent)
    : cars.reduce(
        (leader, car) => (!leader || car.distance > leader.distance ? car : leader),
        null,
      );
  const raceElapsedMs = Math.max(0, (room.serverNow ?? 0) - (room.startsAt ?? 0));
  const recentImpact = focusCar?.lastCollision
    && raceElapsedMs - focusCar.lastCollision.atMs < 900
    ? focusCar.lastCollision
    : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const scene = createScene(canvas, view, obstacles, (error) => {
      setRenderError(error?.message ?? "3D rendering is unavailable.");
    });
    if (!scene) return undefined;
    scene.currentPlayerId = currentPlayerId;
    sceneRef.current = scene;

    const resize = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      scene.app.resizeCanvas(width, height);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    const onUpdate = (deltaSeconds) => {
      const amount = smoothingFactor(deltaSeconds);
      for (const state of scene.carStates.values()) {
        const current = state.entity.getPosition();
        state.entity.setPosition(
          pc.math.lerp(current.x, state.target.x, amount),
          pc.math.lerp(current.y, state.target.y, amount),
          pc.math.lerp(current.z, state.target.z, amount),
        );
        state.yaw = pc.math.lerp(state.yaw, state.targetYaw, amount);
        state.entity.setEulerAngles(0, state.yaw, 0);
        state.wheelYaw = pc.math.lerp(state.wheelYaw, state.targetWheelYaw, amount);
        for (const wheel of state.frontWheelPivots) {
          wheel.setLocalEulerAngles(0, state.wheelYaw, 0);
        }
      }

      const focusCar = scene.view === "driver"
        ? scene.carStates.get(scene.currentPlayerId)
        : [...scene.carStates.values()].reduce((leader, candidate) => {
            if (!leader) return candidate;
            return candidate.target.z < leader.target.z ? candidate : leader;
          }, null);
      if (focusCar) {
        const position = focusCar.entity.getPosition();
        const cameraPosition = scene.camera.getPosition();
        const cameraAmount = smoothingFactor(deltaSeconds, 6);
        const isDriver = scene.view === "driver";
        scene.camera.setPosition(
          pc.math.lerp(
            cameraPosition.x,
            position.x * (isDriver ? 0.45 : 0.18),
            cameraAmount,
          ),
          pc.math.lerp(cameraPosition.y, isDriver ? 4.6 : 15, cameraAmount),
          pc.math.lerp(
            cameraPosition.z,
            position.z + (isDriver ? 8.5 : 18),
            cameraAmount,
          ),
        );
        scene.camera.lookAt(
          position.x * (isDriver ? 0.55 : 0.22),
          0.3,
          position.z - (isDriver ? 18 : 25),
        );
      }
    };
    scene.app.on("update", onUpdate);

    return () => {
      resizeObserver.disconnect();
      scene.app.off("update", onUpdate);
      scene.app.destroy();
      if (sceneRef.current === scene) sceneRef.current = null;
    };
  }, [currentPlayerId, view]);

  useEffect(() => {
    if (sceneRef.current) syncCars(sceneRef.current, cars);
  }, [cars]);

  return (
    <section className="panel race-world" aria-label="Live 3D race">
      <div className="race-world__heading">
        <div>
          <p className="eyebrow">PlayCanvas live track</p>
          <h2>{view === "driver" ? "Your road" : "All drivers"}</h2>
        </div>
        <span>
          {Math.round(room.trackLength)} m · {obstacles.length} barriers · {focusCar?.massKg ?? 1_000} kg
        </span>
      </div>
      <div className="race-world__viewport">
        <canvas ref={canvasRef} aria-label="Box cars racing around barriers on a three-lane road" />
        <div className="race-world__status">
          {room.phase === "countdown"
            ? "Starting grid"
            : recentImpact
              ? `Impact · ${recentImpact.impactSpeed.toFixed(1)} m/s`
              : "Live · server synced"}
        </div>
        <div className="race-world__distance">
          {Math.round(focusCar?.distance ?? 0)} / {Math.round(room.trackLength)} m
        </div>
        {renderError ? (
          <p className="race-world__error" role="alert">{renderError}</p>
        ) : null}
      </div>
      <div className="race-world__roster" aria-label="Live drivers">
        {cars.map((car) => (
          <div
            className={`race-world__driver ${car.isCurrent ? "race-world__driver--current" : ""}`}
            key={car.id}
          >
            <i style={{ backgroundColor: car.color }} />
            <strong>{car.isCurrent ? "You" : car.name}</strong>
            <span>{Math.round(car.speed * 3.6)} km/h</span>
            <span>
              {Math.round(car.distance)} m
              {car.collisionCount > 0 ? ` · ${car.collisionCount} hit${car.collisionCount === 1 ? "" : "s"}` : ""}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
