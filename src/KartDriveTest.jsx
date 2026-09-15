import { useEffect, useRef } from "react";
import { createRaceScene, syncCars } from "./race-scene-runtime.js";
import { raceCarsFromRoom } from "./race-scene-model.js";
import { DRIVING_STEP, stepKart } from "../shared/kart-driving.js";
import { resetDriving, updateLapProgress } from "../shared/track-world.js";
import { createDrivingWorld } from "../shared/driving-world.js";
import track from "./corsica-track.json" with { type: "json" };

export default function KartDriveTest() {
  const canvasRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    let scene;
    const keys = new Set();
    const drive = { color: "#f2c94c", defectIds: [], heat: 0 };
    resetDriving(drive);
    let accumulator = 0;
    let drivingTime = 0;
    const supported = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyR"]);
    const clearKeys = () => keys.clear();
    const keyDown = (event) => {
      if (!supported.has(event.code)) return;
      event.preventDefault();
      keys.add(event.code);
      if (event.code === "KeyR") {
        if (event.repeat) return;
        resetDriving(drive);
        accumulator = 0;
        if (scene) {
          scene.cameraPlaced = false;
        }
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
      const response = await fetch(track.collisionUrl);
      if (!response.ok) throw new Error("Could not load driving collisions.");
      const buffer = await response.arrayBuffer();
      if (cancelled) return;
      const world = createDrivingWorld(buffer);
      resize();
      publish();
      scene.updateDriving = (elapsed) => {
        const throttle = keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0;
        const brake = keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0;
        const stop = keys.has("Space");
        const steering = Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
        accumulator += Math.min(elapsed, 0.1);
        while (accumulator + 1e-9 >= DRIVING_STEP) {
          const previous = { ...drive.worldPosition };
          const resetVersion = drive.resetVersion;
          stepKart(drive, { accelerate: !!throttle, brake: !!brake, stop, left: steering < 0, right: steering > 0 }, DRIVING_STEP, drivingTime, world);
          if (drive.resetVersion === resetVersion) updateLapProgress(drive, previous);
          accumulator -= DRIVING_STEP;
          drivingTime += DRIVING_STEP * 1000;
        }
        publish();
        // Sound modules can read this event without adding a HUD or room connection.
        canvasRef.current?.dispatchEvent(new CustomEvent("kart-audio-state", { bubbles: true, detail: {
          speed: drive.speed, throttle, brake: brake || Number(stop), steering, rpm: 1200 + drive.speed / 28 * 6800,
        } }));
      };
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
  return <>
    <canvas ref={canvasRef} className="map-graphics-test" aria-label="Kart driving test. W or up to accelerate, S or down to brake and reverse, Space to brake, A and D or arrow keys to steer, R to reset." />
  </>;
}
