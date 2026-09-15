import { useEffect, useRef } from "react";
import * as pc from "playcanvas";
import { createRaceScene, syncCars } from "./race-scene-runtime.js";
import { raceCarsFromRoom } from "./race-scene-model.js";
import { CAR_FRONT_AXLE_OFFSET_WORLD, CAR_SIZE_WORLD, LANE_TO_WORLD, clampCarLane } from "../shared/race-config.js";

export default function KartDriveTest() {
  const canvasRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    let scene;
    const keys = new Set();
    const drive = { distance: 0, lane: 0, speed: 0, heading: 0, steeringAngle: 0, color: "#f2c94c" };
    const supported = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyR"]);
    const clearKeys = () => keys.clear();
    const keyDown = (event) => {
      if (!supported.has(event.code)) return;
      event.preventDefault();
      keys.add(event.code);
      if (event.code === "KeyR") {
        Object.assign(drive, { distance: 0, lane: 0, speed: 0, heading: 0, steeringAngle: 0 });
        if (scene) scene.cameraPlaced = false;
      }
    };
    const keyUp = (event) => keys.delete(event.code);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", clearKeys);
    document.addEventListener("visibilitychange", clearKeys);
    const resize = () => scene?.app.resizeCanvas(Math.max(1, canvasRef.current.clientWidth), Math.max(1, canvasRef.current.clientHeight));
    const observer = new ResizeObserver(resize);
    observer.observe(canvasRef.current);
    const publish = () => syncCars(scene, raceCarsFromRoom({ players: [{ id: "test-kart", name: "Test kart", car: drive }] }, "test-kart"));

    createRaceScene(canvasRef.current, {
      view: "driver", currentPlayerId: "test-kart", onStatus: () => {}, isCancelled: () => cancelled,
    }).then(async (loaded) => {
      if (!loaded) return;
      scene = loaded;
      resize();
      publish();
      scene.app.on("update", (elapsed) => {
        const dt = Math.min(elapsed, 0.05);
        const throttle = keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0;
        const brake = keys.has("KeyS") || keys.has("ArrowDown") || keys.has("Space") ? 1 : 0;
        const steering = Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
        drive.speed = pc.math.clamp(drive.speed + (throttle * 11 - brake * 24 - 0.65 - drive.speed * 0.12) * dt, 0, 28);
        drive.steeringAngle = pc.math.lerp(drive.steeringAngle, steering * 24, 1 - Math.exp(-10 * dt));
        drive.heading = pc.math.lerp(drive.heading, steering * Math.min(22, drive.speed * 2), 1 - Math.exp(-6 * dt));
        drive.lane = clampCarLane(drive.lane + Math.sin(drive.heading * Math.PI / 180) * drive.speed / LANE_TO_WORLD * dt);
        drive.distance += Math.cos(drive.heading * Math.PI / 180) * drive.speed * dt;
        publish();
        // Sound modules can read this event without adding a HUD or room connection.
        canvasRef.current?.dispatchEvent(new CustomEvent("kart-audio-state", { bubbles: true, detail: {
          speed: drive.speed, throttle, brake, steering, rpm: 1200 + drive.speed / 28 * 6800,
        } }));
      });
    }).catch((error) => console.error("Kart driving test failed to load", error));
    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", clearKeys);
      document.removeEventListener("visibilitychange", clearKeys);
      scene?.destroy();
    };
  }, []);
  return <canvas ref={canvasRef} className="map-graphics-test" aria-label="Kart driving test. W or up to accelerate, S or down to brake, A and D or arrow keys to steer, R to reset." />;
}
