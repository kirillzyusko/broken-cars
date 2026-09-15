import { useCallback, useEffect, useRef, useState } from "react";
import { SHOUT_GRACE_MS } from "../config.js";
import { displayRound, isReversing, kph, ordinal } from "../lib/format.js";
import { StartSignal } from "../components/StartSignal.jsx";
import { detectShouts, shoutFor } from "../lib/shouts.js";
import { positionOf, racers } from "../lib/standings.js";
import { Avatar } from "../components/primitives.jsx";

const EMPTY_CONTROLS = Object.freeze({
  accelerate: false,
  brake: false,
  left: false,
  right: false,
  stop: false,
});

const KEY_MAP = {
  ArrowUp: "accelerate",
  w: "accelerate",
  ArrowDown: "brake",
  s: "brake",
  " ": "stop",
  ArrowLeft: "left",
  a: "left",
  ArrowRight: "right",
  d: "right",
};

const MAX_BUBBLES = 3;
const COLLISION_BUBBLE_GAP_MS = 4_000;

function Pad({ control, active, onControl, className = "", children }) {
  function press(event) {
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Capture is a nicety; the press still counts without it.
    }
    onControl(control, true);
  }

  function release(event) {
    event.preventDefault();
    onControl(control, false);
  }

  return (
    <button
      className={`ph-pad ${className} ${active ? "ph-pad--active" : ""}`}
      type="button"
      aria-label={control}
      aria-pressed={active}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </button>
  );
}

/**
 * The phone is a pure controller: the race is watched on the TV, so there is
 * no scene here. `onSceneReady` is kept for the player test page and fires as
 * soon as the controller mounts.
 */
export function DrivingScreen({ room, me, now, actions, onSceneReady }) {
  const { car } = me;
  const racing = room.phase === "racing";
  const position = positionOf(room, me.id);
  const count = racers(room).length;
  const round = displayRound(room);

  const [controls, setControls] = useState(EMPTY_CONTROLS);
  const controlsRef = useRef(EMPTY_CONTROLS);
  const [bubbles, setBubbles] = useState([]);
  const shoutedRef = useRef(new Set());
  const timersRef = useRef(new Map());
  const firstInputRef = useRef(null);
  const finishedRef = useRef(false);
  const collisionRef = useRef(null);

  const pushBubble = useCallback((bubble) => {
    setBubbles((current) => [
      ...current,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, ...bubble },
    ].slice(-MAX_BUBBLES));
  }, []);

  // Collisions are public, not secret parts, so they are called out at once,
  // but a long scrape along the scenery should not flood the bubble zone.
  useEffect(() => {
    const impact = car?.lastCollision;
    if (!impact || impact.atMs === collisionRef.current) return;
    const previous = collisionRef.current;
    collisionRef.current = impact.atMs;
    if (previous !== null && impact.atMs - previous < COLLISION_BUBBLE_GAP_MS) return;
    pushBubble({
      text: impact.type === "car" ? `Traded paint with ${impact.label}!` : `Hit the ${impact.label.toLowerCase()}!`,
      tone: "remark",
    });
  }, [car, pushBubble]);

  // Discovery: the driver shouts about a part once the player runs into it,
  // but only after a grace period that starts with the first input of the race.
  useEffect(() => {
    if (!racing || !car) return undefined;
    const now = Date.now();
    const anyInput = controls.accelerate || controls.brake || controls.left || controls.right;
    if (firstInputRef.current === null && anyInput) firstInputRef.current = now;
    if (firstInputRef.current === null || now - firstInputRef.current < SHOUT_GRACE_MS) {
      return undefined;
    }
    const fired = detectShouts({
      car,
      controls,
      now,
      timers: timersRef.current,
      alreadyShouted: shoutedRef.current,
    });
    for (const id of fired) {
      shoutedRef.current.add(id);
      const shout = shoutFor(id, { car });
      if (shout) pushBubble(shout);
    }
    return undefined;
  }, [car, controls, racing, pushBubble]);

  useEffect(() => {
    if (!car || car.finishedAtMs === null || car.finishedAtMs === undefined || finishedRef.current) return;
    finishedRef.current = true;
    pushBubble({
      text: car.rank === 1 ? "Across the line first!" : `Across the line, ${ordinal(car.rank)}!`,
      tone: "remark",
    });
  }, [car, pushBubble]);

  useEffect(() => {
    onSceneReady?.();
  }, [onSceneReady]);

  const updateControl = useCallback((control, pressed) => {
    if (controlsRef.current[control] === pressed) return;
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
    releaseAll();
    return () => {
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", releaseAll);
      releaseAll();
    };
  }, [actions]);

  useEffect(() => {
    const handleKey = (event, pressed) => {
      if (pressed && (/INPUT|SELECT|TEXTAREA|BUTTON|SUMMARY/.test(event.target?.tagName) || event.target?.isContentEditable)) return;
      const control = KEY_MAP[event.key];
      if (!control) return;
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
  }, [updateControl]);

  const positionLabel = car.rank ? ordinal(car.rank) : position ? ordinal(position) : "—";

  return (
    <main className="ph-screen ph-screen--ink ph-drive">
      <div className="ph-drive__bubbles" aria-live="polite">
        {bubbles.map((bubble) => (
          <div className="ph-bubble" key={bubble.id}>
            <Avatar identity={me.identity} size={38} border={3} fontSize={17}>{me.badge}</Avatar>
            <span className={`ph-bubble__text tone--${bubble.tone}`}>{bubble.text}</span>
          </div>
        ))}
      </div>

      <div className="ph-hud">
        <div className="ph-hud__speed">
          <span className="ph-hud__speed-value">{kph(car.speed)}</span>
          <span className="ph-hud__unit">{isReversing(car) ? "KPH · REV" : "KPH"}</span>
        </div>
        <div className="ph-hud__right">
          <span className="ph-hud__pos">{positionLabel}</span>
          <span className="ph-hud__round">R{round} · {room.trackLength}M</span>
        </div>
      </div>

      <div className="ph-drive__controls" aria-label="Kart controls">
        <div className="ph-pads">
          <Pad control="left" active={controls.left} onControl={updateControl} className="ph-pad--left">
            <span className="ph-pad__arrow-left" aria-hidden="true" />
          </Pad>
          <Pad control="right" active={controls.right} onControl={updateControl} className="ph-pad--right">
            <span className="ph-pad__arrow-right" aria-hidden="true" />
          </Pad>
          <Pad control="brake" active={controls.brake} onControl={updateControl} className="ph-pad--brake">
            <span className="ph-pad__brake">BRAKE</span>
          </Pad>
          <Pad control="accelerate" active={controls.accelerate} onControl={updateControl} className="ph-pad--gas">
            <span className="ph-pad__gas">GAS</span>
          </Pad>
        </div>
      </div>

      <StartSignal startsAt={room.startsAt} now={now} className="ph-drive__start" />
    </main>
  );
}
