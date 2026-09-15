import { Component, useEffect, useMemo, useRef, useState } from "react";
import { raceCarsFromRoom, raceObstaclesFromRoom } from "./race-scene-model.js";
import { createRaceScene, syncCars, syncObstacles } from "./race-scene-runtime.js";
import { decoratePlayers } from "./lib/identity.js";

/**
 * The live Corsica GP render as a bare canvas that fills its box, so the
 * surrounding screen owns the HUD. `feeds` (`[{ key, playerId }]` in screen
 * order) tiles the canvas with one third-person chase camera per racer;
 * without it `view: "driver"` chases `currentPlayerId` and `view: "spectator"`
 * follows the leader from broadcast height. Karts wear their seat colour so
 * they match the badges everywhere else.
 */
class RaceViewBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("Race view failed", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className={`race-view ${this.props.className}`}>
          <p className="race-view__error" role="alert">
            {this.state.error?.message ?? "3D rendering is unavailable."}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function RaceView(props) {
  return (
    <RaceViewBoundary className={props.className ?? ""}>
      <RaceCanvas {...props} />
    </RaceViewBoundary>
  );
}

function RaceCanvas({
  room,
  currentPlayerId = null,
  view = "spectator",
  feeds = null,
  className = "",
  onReady,
}) {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const latestRef = useRef(null);
  const [status, setStatus] = useState("Loading Corsica GP…");
  const [renderError, setRenderError] = useState("");
  const cars = useMemo(() => {
    const colors = new Map(
      decoratePlayers(room).map((player) => [player.id, player.identity.color]),
    );
    return raceCarsFromRoom(room, currentPlayerId).map((car) => ({
      ...car,
      color: colors.get(car.id) ?? car.color,
    }));
  }, [currentPlayerId, room]);
  const obstacles = useMemo(() => raceObstaclesFromRoom(room), [room?.obstacles]);
  const audioActive = room.phase === "racing" || room.phase === "countdown";
  const startClock = audioActive
    ? {
        startsAt: room.startsAt,
        serverNow: room.serverNow,
        receivedAt: performance.now() - Math.max(0, Date.now() - (room.receivedAt ?? Date.now())),
        id: `${room.id}:${room.roundNumber}:${room.startsAt}`,
      }
    : null;
  latestRef.current = { cars, obstacles, currentPlayerId, view, feeds, audioActive, startClock, onReady };

  useEffect(() => {
    let cancelled = false;
    let scene;
    const canvas = canvasRef.current;
    const resize = () => scene?.app.resizeCanvas(
      Math.max(1, canvas.clientWidth),
      Math.max(1, canvas.clientHeight),
    );
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    createRaceScene(canvas, {
      view: latestRef.current.view,
      currentPlayerId: latestRef.current.currentPlayerId,
      isCancelled: () => cancelled,
      onStatus: (text) => {
        if (!cancelled) setStatus(text);
      },
    }).then((loaded) => {
      if (!loaded) return;
      scene = loaded;
      sceneRef.current = scene;
      scene.currentPlayerId = latestRef.current.currentPlayerId;
      scene.view = latestRef.current.view;
      scene.startClock = latestRef.current.startClock;
      scene.audioActive = latestRef.current.audioActive;
      syncCars(scene, latestRef.current.cars);
      syncObstacles(scene, latestRef.current.obstacles);
      scene.setSplitScreen(latestRef.current.feeds);
      resize();
      latestRef.current.onReady?.();
    }).catch((error) => {
      if (cancelled) return;
      setStatus("");
      setRenderError(error?.message ?? "3D rendering is unavailable.");
    });
    return () => {
      cancelled = true;
      observer.disconnect();
      sceneRef.current = null;
      try {
        scene?.destroy();
      } catch (error) {
        // A renderer teardown hiccup must never take the whole screen down.
        console.warn("Race view teardown failed", error);
      }
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.startClock = startClock;
    scene.audioActive = audioActive;
    syncCars(scene, cars);
    syncObstacles(scene, obstacles);
    scene.currentPlayerId = currentPlayerId;
    if (scene.view !== view) scene.cameraPlaced = false;
    scene.view = view;
    scene.setSplitScreen(feeds);
  }, [cars, obstacles, currentPlayerId, view, feeds, audioActive, room]);

  return (
    <div className={`race-view ${className}`}>
      <canvas ref={canvasRef} className="race-view__canvas" aria-label="Corsica GP island circuit" />
      {status ? <div className="race-view__status" role="status">{status.toUpperCase()}</div> : null}
      {renderError ? <p className="race-view__error" role="alert">{renderError}</p> : null}
    </div>
  );
}
