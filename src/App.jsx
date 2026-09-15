import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { QRCodeSVG } from "qrcode.react";
import { useGameSocket } from "./use-game-socket.js";
import { createPlayerId } from "./player-identity.js";

const RaceScene = lazy(() => import("./RaceScene.jsx"));
const MapGraphicsTest = lazy(() => import("./MapGraphicsTest.jsx"));
const MapPreview = lazy(() => import("./MapPreview.jsx"));

const EMPTY_CONTROLS = {
  accelerate: false,
  brake: false,
  left: false,
  right: false,
};

function routeFromPath() {
  const [, page, roomId] = window.location.pathname.split("/");
  if ((page === "host" || page === "play") && roomId) {
    return { page, roomId: roomId.toUpperCase() };
  }
  return { page: "home", roomId: null };
}

function useNow(active = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function estimatedServerNow(room, localNow) {
  if (!room?.receivedAt) return localNow;
  return room.serverNow + (localNow - room.receivedAt);
}

function formatSeconds(milliseconds) {
  return Math.max(0, Math.ceil(milliseconds / 1000));
}

function PhasePill({ phase, connection }) {
  const phaseLabels = {
    waiting: "waiting room",
    prompting: "building",
    assigning: "breaking cars",
    tuning: "tuning",
    repairing: "repairing",
    countdown: "countdown",
    racing: "racing",
    finished: "finished",
  };
  return (
    <div className="phase-row">
      <span className={`connection connection--${connection}`} />
      <span>{connection === "connected" ? (phaseLabels[phase] ?? phase) : connection}</span>
    </div>
  );
}

function ErrorBanner({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="error-banner" role="alert">
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss error">
        ×
      </button>
    </div>
  );
}

function Home() {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function createGame() {
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/rooms", { method: "POST" });
      if (!response.ok) throw new Error("Could not create a game room.");
      const room = await response.json();
      sessionStorage.setItem(`broken-cars:host:${room.roomId}`, room.hostToken);
      sessionStorage.setItem(`broken-cars:join:${room.roomId}`, room.joinUrl);
      window.location.assign(`/host/${room.roomId}`);
    } catch (reason) {
      setError(reason.message);
      setCreating(false);
    }
  }

  return (
    <main className="center-page">
      <section className="hero panel">
        <p className="eyebrow">Multiplayer party race</p>
        <h1>Funny Cars</h1>
        <p className="lede">
          Dream up the perfect car. Race it anyway.
        </p>
        <button className="primary-button" type="button" onClick={createGame} disabled={creating}>
          {creating ? "Opening garage…" : "Create local game"}
        </button>
        <a className="map-preview-link" href="/map">Explore Corsica GP</a>
        {error ? <p className="inline-error">{error}</p> : null}
      </section>
    </main>
  );
}

function Leaderboard({ room, currentPlayerId }) {
  const sortedPlayers = useMemo(() => {
    if (!room) return [];
    return room.players
      .filter((player) => player.car)
      .sort((a, b) => {
        if (a.car.rank) return -1;
        if (b.car.rank) return 1;
        return b.car.distance - a.car.distance;
      });
  }, [room]);

  if (!room || sortedPlayers.length === 0) return null;
  return (
    <section className="panel race-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Live track · {room.trackLength}m</p>
          <h2>{room.phase === "finished" ? "Final result" : "Race position"}</h2>
        </div>
      </div>
      <div className="track-list">
        {sortedPlayers.map((player, index) => {
          const progress = Math.min(100, (player.car.distance / room.trackLength) * 100);
          return (
            <div
              className={`track-row ${player.id === currentPlayerId ? "track-row--current" : ""}`}
              key={player.id}
            >
              <div className="track-meta">
                <span>{player.car.rank ? `#${player.car.rank}` : `#${index + 1}`}</span>
                <strong>{player.name}</strong>
                <span>{Math.round(player.car.speed * 3.6)} km/h</span>
              </div>
              <div className="track">
                <div className="track-progress" style={{ width: `${progress}%` }} />
                <div
                  className="car-marker"
                  style={{ left: `${progress}%`, backgroundColor: player.car.color }}
                  title={player.car.name}
                >
                  {player.car.rank ? "🏁" : "▰"}
                </div>
              </div>
              <div className="car-caption">
                <span>{player.car.name}</span>
                <span>{Math.round(player.car.distance)}m</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DefectList({ car }) {
  if (!car) return null;
  if (car.defects.length === 0) {
    return <p className="fully-tuned">✓ No defects left</p>;
  }
  return (
    <div className="defect-list">
      {car.defects.map((defect) => (
        <article className="defect-card" key={defect.id}>
          <strong>{defect.label}</strong>
          <span>{defect.description}</span>
        </article>
      ))}
    </div>
  );
}

function RaceSceneLoading() {
  return (
    <section className="panel race-world race-world--loading">
      <div className="spinner" />
      <p>Loading the 3D track…</p>
    </section>
  );
}

function shouldShowRaceWorld(phase) {
  return phase === "countdown" || phase === "racing" || phase === "finished";
}

function Host({ roomId }) {
  const hostToken = sessionStorage.getItem(`broken-cars:host:${roomId}`) ?? "";
  const storedJoinUrl = sessionStorage.getItem(`broken-cars:join:${roomId}`);
  const joinUrl = storedJoinUrl ?? `${window.location.origin}/play/${roomId}`;
  const { connection, room, error, clearError, actions } = useGameSocket({
    roomId,
    role: "host",
    hostToken,
  });
  const localNow = useNow(
    room?.phase === "prompting"
    || room?.phase === "tuning"
    || room?.phase === "countdown",
  );
  const now = estimatedServerNow(room, localNow);
  const remaining = room?.phase === "tuning"
    ? (room?.tuningDeadline ?? 0) - now
    : (room?.promptDeadline ?? 0) - now;
  const readyPlayers = room?.players.filter((player) => player.hasPrompt).length ?? 0;
  const tuningPlayers = room?.players.filter((player) => player.hasTuningPrompt).length ?? 0;
  const connectedCount = room?.players.filter((player) => player.connected).length ?? 0;
  const standardRacing = room?.defectsEnabled === false;
  const canStartBuild = room?.phase === "waiting" && connectedCount > 0;
  const canStartRace = room?.phase === "prompting" && remaining <= 0 && readyPlayers > 0;
  const canStartTuning = !standardRacing && room?.phase === "finished"
    && room.players.some((player) => player.car?.defects.length > 0);
  const canStartNextRace = room?.phase === "tuning" && remaining <= 0;
  const isWaiting = room?.phase === "waiting";
  const isBusy = room?.phase === "assigning" || room?.phase === "repairing";
  const buildSeconds = Math.round((room?.buildDurationMs ?? 60_000) / 1000);
  const tuningSeconds = Math.round((room?.tuningDurationMs ?? 60_000) / 1000);

  const hostAction = (() => {
    if (isWaiting) return { label: `Start ${buildSeconds}s car build`, disabled: !canStartBuild };
    if (room?.phase === "prompting") return { label: "Start ride", disabled: !canStartRace };
    if (room?.phase === "finished") {
      if (standardRacing) return { label: "Race again", disabled: false };
      return canStartTuning
        ? { label: `Start ${tuningSeconds}s tuning`, disabled: false }
        : { label: "All cars are fully tuned", disabled: true };
    }
    if (room?.phase === "tuning") {
      return { label: "Apply repairs & start next ride", disabled: !canStartNextRace };
    }
    if (isBusy) {
      return {
        label: room?.phase === "assigning" ? "Breaking cars…" : "Applying repairs…",
        disabled: true,
      };
    }
    return { label: "Ride in progress", disabled: true };
  })();

  function triggerHostAction() {
    if (isWaiting) actions.startBuild();
    else if (room?.phase === "prompting") actions.startRace();
    else if (room?.phase === "finished" && standardRacing) actions.restartRace();
    else if (room?.phase === "finished") actions.startTuning();
    else if (room?.phase === "tuning") actions.startNextRace();
  }

  if (!hostToken) {
    return (
      <main className="center-page">
        <section className="panel hero">
          <h1>Host key missing</h1>
          <p>This host page belongs to the browser that created it.</p>
          <a className="primary-button link-button" href="/">Create a new game</a>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Room {roomId}</p>
          <h1>Host garage</h1>
        </div>
        <PhasePill phase={room?.phase ?? "loading"} connection={connection} />
      </header>
      <ErrorBanner message={error} onClose={clearError} />

      <div className="host-grid">
        <section className="panel qr-panel">
          <div className="qr-wrap"><QRCodeSVG value={joinUrl} size={190} level="M" /></div>
          <div className="join-details">
            <p className="eyebrow">Scan to drive</p>
            <h2>{roomId}</h2>
            <p className="muted join-url">{joinUrl}</p>
            <aside className="wifi-note" aria-label="Wi-Fi requirement">
              <strong>Same Wi-Fi required</strong>
              <p>Everyone needs to connect to the same Wi-Fi access point as this host.</p>
              <div className="wifi-name wifi-name--connected">
                <span className="connection" aria-hidden="true" />
                <span>Current Wi-Fi</span>
                <b>STARLINK</b>
              </div>
            </aside>
          </div>
        </section>

        <section className="panel timer-panel">
          <p className="eyebrow">
            {isWaiting
              ? "Waiting room"
              : room?.phase === "tuning"
                ? `Tuning round · before ride ${room.roundNumber + 1}`
                : `Ride ${Math.max(1, room?.roundNumber ?? 1)}`}
          </p>
          <div className="big-timer">
            {isWaiting
              ? "WAIT"
              : room?.phase === "prompting" || room?.phase === "tuning"
                ? formatSeconds(remaining)
                : isBusy
                  ? "AI"
                  : room?.phase === "finished"
                    ? "PIT"
                    : "GO"}
          </div>
          <p className="muted">
            {isWaiting
              ? connectedCount > 0
                ? `${connectedCount} ${connectedCount === 1 ? "driver is" : "drivers are"} ready. Start when everyone has joined.`
                : "Drivers can scan the QR code and wait here."
              : room?.phase === "prompting" && remaining > 0
                ? "The room is locked while everyone builds a car."
                : room?.phase === "prompting" && readyPlayers > 0
                  ? "Build time is over. Start the ride when ready."
                  : room?.phase === "prompting"
                    ? "Build time is over. No cars were submitted."
                    : room?.phase === "tuning" && remaining > 0
                      ? `${tuningPlayers} drivers have submitted one problem to repair.`
                      : room?.phase === "tuning"
                        ? "Tuning time is over. Apply at most one repair per car."
                        : room?.phase === "finished"
                          ? standardRacing
                            ? "The race is over. Start a rematch when everyone is ready."
                            : "The ride is over. Start a tuning round when everyone is ready."
                          : "The garage is locked."}
          </p>
          <button
            className="primary-button"
            type="button"
            disabled={hostAction.disabled}
            onClick={triggerHostAction}
          >
            {hostAction.label}
          </button>
          <small>
            {standardRacing
              ? "Driving mode: standard physics"
              : `Defect selector: ${room?.selectorName ?? "—"}`}
          </small>
        </section>
      </div>

      {shouldShowRaceWorld(room?.phase) ? (
        <Suspense fallback={<RaceSceneLoading />}>
          <RaceScene room={room} view="spectator" />
        </Suspense>
      ) : null}

      <section className="panel players-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Drivers</p>
            <h2>{connectedCount} connected</h2>
          </div>
          <span>
            {isWaiting
              ? "Waiting room open"
              : room?.phase === "tuning"
                ? `${tuningPlayers} repair reports ready`
                : `${readyPlayers} cars ready`}
          </span>
        </div>
        <div className="player-grid">
          {room?.players.map((player) => (
            <article className="player-card" key={player.id}>
              <div className="player-title">
                <span className={`connection ${player.connected ? "connection--connected" : "connection--reconnecting"}`} />
                <strong>{player.name}</strong>
              </div>
              <p>
                {isWaiting
                  ? "Ready in the waiting room"
                  : room?.phase === "tuning"
                    ? player.hasTuningPrompt
                      ? "Repair report submitted ✓"
                      : player.car?.defects.length === 0
                        ? "Fully tuned"
                        : "Diagnosing one problem…"
                    : player.hasPrompt
                    ? "Car submitted ✓"
                    : room?.phase === "prompting"
                      ? "Building a car…"
                      : "No car submitted"}
              </p>
              {!standardRacing ? <DefectList car={player.car} /> : null}
            </article>
          ))}
          {room?.players.length === 0 ? <p className="empty-state">No drivers yet. Point a phone at the QR code.</p> : null}
        </div>
      </section>

      {room?.phase === "countdown" ? (
        <div className="countdown-overlay">{formatSeconds(room.startsAt - now)}</div>
      ) : null}
      <Leaderboard room={room} />
    </main>
  );
}

function getPlayerId(roomId) {
  const key = `broken-cars:player:${roomId}`;
  let playerId = localStorage.getItem(key);
  if (!playerId) {
    playerId = createPlayerId(window.crypto);
    localStorage.setItem(key, playerId);
  }
  return playerId;
}

function ControllerButton({ control, label, active, onControl, children, className = "" }) {
  function press(event) {
    event.preventDefault();
    onControl(control, true);
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // The control remains active even when a browser cannot capture this pointer.
    }
  }

  function release(event) {
    event.preventDefault();
    onControl(control, false);
  }

  return (
    <button
      id={`control-${control}`}
      aria-label={label}
      className={`control-button ${active ? "control-button--active" : ""} ${className}`}
      type="button"
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      {children}
    </button>
  );
}

function Player({ roomId }) {
  const playerId = useMemo(() => getPlayerId(roomId), [roomId]);
  const { connection, room, error, clearError, actions } = useGameSocket({
    roomId,
    role: "player",
    clientId: playerId,
  });
  const [prompt, setPrompt] = useState("");
  const [tuningPrompt, setTuningPrompt] = useState("");
  const [controls, setControls] = useState(EMPTY_CONTROLS);
  const controlsRef = useRef(EMPTY_CONTROLS);
  const localNow = useNow(
    room?.phase === "prompting"
    || room?.phase === "tuning"
    || room?.phase === "countdown",
  );
  const now = estimatedServerNow(room, localNow);
  const me = room?.players.find((player) => player.id === playerId);
  const remaining = room?.promptDeadline ? room.promptDeadline - now : 0;
  const tuningRemaining = room?.tuningDeadline ? room.tuningDeadline - now : 0;
  const promptOpen = room?.phase === "prompting" && remaining > 0;
  const tuningOpen = room?.phase === "tuning"
    && tuningRemaining > 0
    && (me?.car?.defects.length ?? 0) > 0;
  const canDrive = room?.phase === "countdown" || room?.phase === "racing";
  const standardRacing = room?.defectsEnabled === false;
  const connectedPlayers = room?.players.filter((player) => player.connected).length ?? 0;
  const buildSeconds = Math.round((room?.buildDurationMs ?? 60_000) / 1000);

  useEffect(() => {
    setTuningPrompt("");
  }, [room?.roundNumber]);

  const updateControl = useCallback((control, pressed) => {
    const next = { ...controlsRef.current, [control]: pressed };
    controlsRef.current = next;
    setControls(next);
    actions.setControls(next);
  }, [actions]);

  useEffect(() => {
    function releaseAll() {
      controlsRef.current = EMPTY_CONTROLS;
      setControls(EMPTY_CONTROLS);
      actions.setControls(EMPTY_CONTROLS);
    }
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", releaseAll);
    return () => {
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", releaseAll);
    };
  }, [actions]);

  useEffect(() => {
    if (!canDrive) return undefined;
    const keyMap = {
      ArrowUp: "accelerate",
      w: "accelerate",
      ArrowDown: "brake",
      s: "brake",
      ArrowLeft: "left",
      a: "left",
      ArrowRight: "right",
      d: "right",
    };
    const handleKey = (event, pressed) => {
      const control = keyMap[event.key];
      if (!control || controlsRef.current[control] === pressed) return;
      event.preventDefault();
      updateControl(control, pressed);
    };
    const keyDown = (event) => handleKey(event, true);
    const keyUp = (event) => handleKey(event, false);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, [canDrive, updateControl]);

  function submitPrompt(event) {
    event.preventDefault();
    if (!prompt.trim()) return;
    actions.submitCarPrompt(prompt);
  }

  function submitTuningPrompt(event) {
    event.preventDefault();
    if (!tuningPrompt.trim()) return;
    actions.submitRepair(tuningPrompt);
  }

  return (
    <main className="controller-shell">
      <header className="topbar compact-topbar">
        <div>
          <p className="eyebrow">Room {roomId}</p>
          <h1>{me?.name ?? "Joining garage…"}</h1>
        </div>
        <PhasePill phase={room?.phase ?? "loading"} connection={connection} />
      </header>
      <ErrorBanner message={error} onClose={clearError} />

      {room?.phase === "waiting" ? (
        <section className="panel status-panel waiting-panel">
          <div className="waiting-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="eyebrow">You’re in</p>
          <h2>Waiting for other players</h2>
          <p>
            {connectedPlayers <= 1
              ? "You’re the first driver. The host will start when everyone is here."
              : `${connectedPlayers} drivers are in the room. The host will start when everyone is here.`}
          </p>
          <small>Everyone gets the same {buildSeconds} seconds to build a car.</small>
        </section>
      ) : null}

      {room?.phase === "prompting" ? (
        <section className="panel prompt-panel">
          <div className="prompt-timer">{formatSeconds(remaining)}s</div>
          <p className="eyebrow">Build your dream car</p>
          <h2>What do you want to drive?</h2>
          <p className="prompt-guidance">
            {standardRacing
              ? "Give your box car a name and describe its look. Every car gets the same working engine, brakes and steering."
              : "Include must-have details and say what must not be broken. For example: “A red rally car with round wheels — keep the wheels round.”"}
          </p>
          <form onSubmit={submitPrompt}>
            <textarea
              value={prompt}
              disabled={!promptOpen}
              maxLength={160}
              placeholder="A tiny neon rally car with round wheels. Keep the wheels round…"
              onChange={(event) => setPrompt(event.target.value)}
              autoFocus
            />
            <button className="primary-button" type="submit" disabled={!promptOpen || !prompt.trim()}>
              {me?.hasPrompt ? "Update my car" : "Lock in my car"}
            </button>
          </form>
          {me?.hasPrompt ? <p className="saved-message">✓ Saved: {me.prompt}</p> : null}
          {!promptOpen ? <p className="saved-message">Build time is over. Waiting for the host.</p> : null}
        </section>
      ) : null}

      {room?.phase === "assigning" ? (
        <section className="panel status-panel">
          <div className="spinner" />
          <h2>The mechanic is “helping”</h2>
          <p>Broken parts are being assigned to every car.</p>
        </section>
      ) : null}

      {room?.phase === "repairing" ? (
        <section className="panel status-panel">
          <div className="spinner" />
          <h2>The mechanic is checking reports</h2>
          <p>Each car can receive at most one concrete repair.</p>
        </section>
      ) : null}

      {shouldShowRaceWorld(room?.phase) && me?.car ? (
        <Suspense fallback={<RaceSceneLoading />}>
          <RaceScene room={room} currentPlayerId={playerId} view="driver" />
        </Suspense>
      ) : null}

      {room?.phase === "tuning" ? (
        <section className="panel prompt-panel tuning-panel">
          <div className="prompt-timer">{formatSeconds(tuningRemaining)}s</div>
          <p className="eyebrow">Tune one thing</p>
          <h2>Which exact problem did you notice?</h2>
          <p className="prompt-guidance">
            Report one concrete symptom, for example “the steering is reversed” or
            “it slides like ice”. “Make it fully working” repairs nothing.
          </p>
          <form onSubmit={submitTuningPrompt}>
            <textarea
              value={tuningPrompt}
              disabled={!tuningOpen}
              maxLength={160}
              placeholder="The steering is reversed…"
              onChange={(event) => setTuningPrompt(event.target.value)}
              autoFocus
            />
            <button
              className="primary-button"
              type="submit"
              disabled={!tuningOpen || !tuningPrompt.trim()}
            >
              {me?.hasTuningPrompt ? "Update repair report" : "Submit one repair"}
            </button>
          </form>
          {me?.hasTuningPrompt ? (
            <p className="saved-message">✓ Saved privately: {me.tuningPrompt}</p>
          ) : null}
          {!tuningOpen && me?.car?.defects.length > 0 ? (
            <p className="saved-message">Tuning time is over. Waiting for the host.</p>
          ) : null}
        </section>
      ) : null}

      {me?.car ? (
        <section className="panel my-car-panel" style={{ borderColor: me.car.color }}>
          <p className="eyebrow">Your ride</p>
          <h2>{me.car.name}</h2>
          {me.lastRepair ? (
            <p className="repair-result">✓ Repaired this round: {me.lastRepair.label}</p>
          ) : room?.roundNumber > 1 && room?.phase !== "tuning" ? (
            <p className="repair-result repair-result--missed">
              No repair applied — report one specific defect next round.
            </p>
          ) : null}
          {standardRacing ? (
            <p className="fully-tuned">✓ Standard engine, brakes and steering</p>
          ) : (
            <DefectList car={me.car} />
          )}
          {me.car.heat > 0 ? (
            <div className="heat-meter">
              <span>Engine heat</span>
              <div><i style={{ width: `${me.car.heat * 100}%` }} /></div>
            </div>
          ) : null}
        </section>
      ) : null}

      {room?.phase === "countdown" ? (
        <div className="countdown-overlay">{formatSeconds(room.startsAt - now)}</div>
      ) : null}

      {canDrive ? (
        <section className="controller" aria-label="Car controls">
          <div className="steering-controls">
            <ControllerButton control="left" label="Steer left" active={controls.left} onControl={updateControl}>←</ControllerButton>
            <ControllerButton control="right" label="Steer right" active={controls.right} onControl={updateControl}>→</ControllerButton>
          </div>
          <div className="pedal-controls">
            <ControllerButton control="brake" label="Brake" active={controls.brake} onControl={updateControl} className="brake-button">
              <span>Brake</span><strong>■</strong>
            </ControllerButton>
            <ControllerButton control="accelerate" label="Accelerate" active={controls.accelerate} onControl={updateControl} className="gas-button">
              <span>Gas</span><strong>▲</strong>
            </ControllerButton>
          </div>
        </section>
      ) : null}

      {room?.phase === "finished" && standardRacing ? (
        <section className="panel status-panel round-finished-panel">
          <p className="eyebrow">Race {room.roundNumber} complete</p>
          <h2>Ready for another lap?</h2>
          <p>The host can start a rematch with the same cars.</p>
        </section>
      ) : room?.phase === "finished" && me?.car?.defects.length > 0 ? (
        <section className="panel status-panel round-finished-panel">
          <p className="eyebrow">Ride {room.roundNumber} complete</p>
          <h2>Remember one problem</h2>
          <p>The host will open the tuning round. You can repair one defect next.</p>
        </section>
      ) : null}

      <Leaderboard room={room} currentPlayerId={playerId} />
    </main>
  );
}

export default function App() {
  const route = routeFromPath();
  if (window.location.pathname === "/map/graphics") return <Suspense fallback={null}><MapGraphicsTest /></Suspense>;
  if (window.location.pathname === "/map") return <Suspense fallback={<RaceSceneLoading />}><MapPreview /></Suspense>;
  if (route.page === "host") return <Host roomId={route.roomId} />;
  if (route.page === "play") return <Player roomId={route.roomId} />;
  return <Home />;
}
