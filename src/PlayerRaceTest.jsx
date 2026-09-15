import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DrivingScreen } from "./player/DrivingScreen.jsx";
import { findPlayer } from "./lib/identity.js";
import { SHOUTS } from "./lib/shouts.js";
import { createDrivingWorld } from "../shared/driving-world.js";
import { createPlayerRaceTest, TEST_PLAYER_ID } from "./player-race-test-model.js";
import { createKartAudio } from "./kart-audio.js";
import { raceCarsFromRoom } from "./race-scene-model.js";
import track from "./corsica-track.json" with { type: "json" };
import "./player-race-test.css";

export default function PlayerRaceTest() {
  const simulation = useRef(null);
  const [room, setRoom] = useState(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [defect, setDefect] = useState("");
  const [run, setRun] = useState(0);
  const actions = useMemo(() => ({ setControls: (controls) => simulation.current?.setControls(controls) }), []);
  const onSceneReady = useCallback(() => {
    simulation.current?.start(Date.now());
    setReady(true);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    let frame;
    let previous;
    let lastPublished = 0;
    const audio = createKartAudio({ keyboardHorn: false });
    async function load() {
      try {
        const response = await fetch(track.collisionUrl, { signal: abort.signal });
        if (!response.ok) throw new Error("Could not load the track collisions.");
        const buffer = await response.arrayBuffer();
        if (abort.signal.aborted) return;
        const model = createPlayerRaceTest(createDrivingWorld(buffer));
        simulation.current = model;
        setRoom(model.snapshot(Date.now()));
        const tick = (time) => {
          model.step(previous === undefined ? 0 : (time - previous) / 1000, Date.now());
          previous = time;
          if (time - lastPublished >= 1000 / 30) {
            const snapshot = model.snapshot(Date.now());
            setRoom(snapshot);
            audio.update(raceCarsFromRoom(snapshot, TEST_PLAYER_ID), TEST_PLAYER_ID, { yaw: 0 }, (time - lastPublished) / 1000, true);
            lastPublished = time;
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch (cause) {
        if (!abort.signal.aborted) setError(cause.message);
      }
    }
    load();
    return () => { audio.dispose(); abort.abort(); cancelAnimationFrame(frame); simulation.current = null; };
  }, []);

  const restart = () => {
    simulation.current.reset(defect);
    setRoom(simulation.current.snapshot(Date.now()));
    setReady(false);
    setRun((value) => value + 1);
  };

  return <>
    {room ? <DrivingScreen key={run} room={room} me={findPlayer(room, TEST_PLAYER_ID)}
      now={room.serverNow} actions={actions} onSceneReady={onSceneReady} />
      : <main className="ph-screen ph-loading"><p role={error ? "alert" : "status"}>{error || "Loading player test…"}</p>
        {error && <button type="button" onClick={() => window.location.reload()}>Try again</button>}</main>}
    <details className="player-race-test-tools">
      <summary>Player test</summary>
      <div className="player-race-test-tools__body">
        <p>The real player screen with a local solo race. Use the touch pads or WASD / arrow keys.</p>
        <label>Kart fault
          <select value={defect} onChange={(event) => setDefect(event.target.value)}>
            <option value="">All parts working</option>
            {Object.keys(SHOUTS).map((id) => <option key={id} value={id}>{id.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <p>Restart to apply. Fault messages follow the game's 10-second grace period after your first input.</p>
        <button type="button" disabled={!ready} onClick={restart}>Restart countdown</button>
        <button type="button" disabled={!ready || room?.phase !== "racing"} onClick={() => simulation.current.finish()}>Finish kart</button>
        <a href="/test/loading">Loading screen test</a>
        {!ready && <p role="status">Loading track…</p>}
      </div>
    </details>
  </>;
}
