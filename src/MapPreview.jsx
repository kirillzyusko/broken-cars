import { useEffect, useRef, useState } from "react";
import * as pc from "playcanvas";
import RaceScene from "./RaceScene.jsx";
import { sampleTrack } from "./race-scene-model.js";
import track from "./corsica-track.json" with { type: "json" };

export default function MapPreview() {
  const [distance, setDistance] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [collisionReport, setCollisionReport] = useState("");
  const sceneRef = useRef(null);
  useEffect(() => {
    if (!playing) return undefined;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      setDistance((value) => (value + (now - last) * 0.018) % 500);
      last = now;
    }, 50);
    return () => clearInterval(timer);
  }, [playing]);
  const room = {
    phase: "preview", trackLength: 500,
    players: [{ id: "preview", name: "Circuit tour", car: { distance, lane: 0, speed: playing ? 18 : 0, color: "#f2c94c" } }],
  };
  function checkCollisions() {
    const scene = sceneRef.current;
    if (!scene) return;
    let hits = 0;
    for (let i = 0; i < 500; i++) {
      const p = sampleTrack(i * track.lapLength / 500);
      const hit = scene.app.systems.rigidbody.raycastFirst(new pc.Vec3(p.x, 2, p.z), new pc.Vec3(p.x, -2, p.z), { filterTags: ["race-road"] });
      if (hit && Math.abs(hit.point.y - p.y) < 0.05) hits++;
    }
    setCollisionReport(`${hits}/500 road samples hit · ${scene.map.chunks} static mesh colliders · flowers and grass excluded`);
  }
  return (
    <main className="app-shell map-preview">
      <header className="map-preview__heading"><div><p className="eyebrow">PlayCanvas</p><h1>Corsica GP</h1><p>Explore the full island or take a lap from the driver's seat.</p></div><a href="/">Back to game</a></header>
      <RaceScene room={room} view="overview" currentPlayerId="preview" onReady={(scene) => { sceneRef.current = scene; }} />
      <section className="panel map-preview__controls" aria-label="Circuit tour controls">
        <button onClick={() => setPlaying((value) => !value)}>{playing ? "Pause tour" : "Take a lap"}</button>
        <label>Lap position · {Math.round(distance)} m<input aria-label="Lap position" type="range" min="0" max="500" step="1" value={distance} onChange={(event) => { setPlaying(false); setDistance(Number(event.target.value)); }} /></label>
        <button onClick={() => { setPlaying(false); setDistance(0); }}>Start line</button>
        {import.meta.env.DEV && <button onClick={checkCollisions}>Check road collisions</button>}
        {collisionReport && <output>{collisionReport}</output>}
      </section>
    </main>
  );
}
