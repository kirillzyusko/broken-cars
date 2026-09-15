import { useEffect, useMemo, useRef, useState } from "react";
import { raceCarsFromRoom, raceObstaclesFromRoom } from "./race-scene-model.js";
import { createRaceScene, syncCars, syncObstacles } from "./race-scene-runtime.js";

export default function RaceScene({ room, currentPlayerId = null, view = "spectator", onReady }) {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const latestRef = useRef(null);
  const [renderError, setRenderError] = useState("");
  const [loading, setLoading] = useState("Loading Corsica GP…");
  const [cameraMode, setCameraMode] = useState(view);
  const cars = useMemo(() => raceCarsFromRoom(room, currentPlayerId), [currentPlayerId, room]);
  const obstacles = useMemo(() => raceObstaclesFromRoom(room), [room?.obstacles]);
  const focusCar = cars.find((car) => car.isCurrent)
    ?? cars.reduce((leader, car) => !leader || car.distance > leader.distance ? car : leader, null);
  const raceElapsedMs = Math.max(0, (room.serverNow ?? 0) - (room.startsAt ?? 0));
  const recentImpact = focusCar?.lastCollision && raceElapsedMs - focusCar.lastCollision.atMs < 900
    ? focusCar.lastCollision : null;
  const audioActive = room.phase === "racing" || room.phase === "countdown";
  latestRef.current = { cars, obstacles, currentPlayerId, cameraMode, onReady, audioActive, room };

  useEffect(() => { setCameraMode(view); }, [view]);
  useEffect(() => {
    let cancelled = false;
    let scene;
    const canvas = canvasRef.current;
    const resize = () => scene?.app.resizeCanvas(Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight));
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    createRaceScene(canvas, {
      view: latestRef.current.cameraMode,
      currentPlayerId: latestRef.current.currentPlayerId,
      isCancelled: () => cancelled,
      onStatus: (status) => { if (!cancelled) setLoading(status); },
    }).then((loaded) => {
      if (!loaded) return;
      scene = loaded;
      sceneRef.current = scene;
      const snapshot = latestRef.current.room;
      scene.startClock = latestRef.current.audioActive ? { startsAt: snapshot.startsAt, serverNow: snapshot.serverNow,
        receivedAt: performance.now() - Math.max(0, Date.now() - (snapshot.receivedAt ?? Date.now())),
        id: `${snapshot.id}:${snapshot.roundNumber}:${snapshot.startsAt}` } : null;
      scene.audioActive = latestRef.current.audioActive;
      scene.currentPlayerId = latestRef.current.currentPlayerId;
      scene.view = latestRef.current.cameraMode;
      syncCars(scene, latestRef.current.cars);
      syncObstacles(scene, latestRef.current.obstacles);
      resize();
      latestRef.current.onReady?.(scene);
    }).catch((error) => {
      if (!cancelled) { setLoading(""); setRenderError(error?.message ?? "3D rendering is unavailable."); }
    });
    return () => {
      cancelled = true;
      observer.disconnect();
      scene?.destroy();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.startClock = audioActive ? {
      startsAt: room.startsAt, serverNow: room.serverNow,
      receivedAt: performance.now() - Math.max(0, Date.now() - (room.receivedAt ?? Date.now())),
      id: `${room.id}:${room.roundNumber}:${room.startsAt}`,
    } : null;
    scene.audioActive = audioActive;
    syncCars(scene, cars);
    syncObstacles(scene, obstacles);
    scene.currentPlayerId = currentPlayerId;
    if (scene.view !== cameraMode) scene.cameraPlaced = false;
    scene.view = cameraMode;
  }, [cars, obstacles, currentPlayerId, cameraMode, audioActive, room]);

  return (
    <section className="panel race-world" aria-label="Live 3D race">
      <div className="race-world__heading">
        <div><p className="eyebrow">Island circuit</p><h2>Corsica GP</h2></div>
        <label className="race-world__camera">
          <span>Camera</span>
          <select aria-label="Race camera" value={cameraMode} onChange={(event) => setCameraMode(event.target.value)}>
            <option value="driver">Chase</option>
            <option value="cockpit">Driver view</option>
            <option value="spectator">Broadcast</option>
            <option value="overview">Whole island</option>
          </select>
        </label>
        <span>{Math.round(room.trackLength)} m · 1 lap · {obstacles.length} barriers · {focusCar?.massKg ?? 1_000} kg</span>
      </div>
      <div className="race-world__viewport">
        <canvas ref={canvasRef} aria-label="Corsica GP island circuit in PlayCanvas" />
        <div className="race-world__status">
          {loading || (room.phase === "countdown" ? "Starting grid" : room.phase === "preview" ? "Circuit preview" : recentImpact ? `Impact · ${recentImpact.impactSpeed.toFixed(1)} m/s` : "Live · server synced")}
        </div>
        <div className="race-world__distance">{Math.round(focusCar?.distance ?? 0)} / {Math.round(room.trackLength)} m</div>
        {loading && <div className="race-world__loading" role="status"><span className="spinner" />{loading}</div>}
        {renderError && <p className="race-world__error" role="alert">{renderError}</p>}
      </div>
      <div className="race-world__roster" aria-label="Live drivers">
        {cars.map((car) => (
          <div className={`race-world__driver ${car.isCurrent ? "race-world__driver--current" : ""}`} key={car.id}>
            <i style={{ backgroundColor: car.color }} />
            <strong>{car.isCurrent ? "You" : car.name}</strong>
            <span>{Math.round(car.speed * 3.6)} km/h</span>
            <span>{Math.round(car.distance)} m{car.collisionCount > 0 ? ` · ${car.collisionCount} hit${car.collisionCount === 1 ? "" : "s"}` : ""}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
