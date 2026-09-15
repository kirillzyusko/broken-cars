import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { SHOUT_GRACE_MS } from "../config.js";
import { displayRound, isReversing, kph, ordinal } from "../lib/format.js";
import { StartSignal } from "../components/StartSignal.jsx";
import { detectShouts, shoutFor } from "../lib/shouts.js";
import { positionOf, racers } from "../lib/standings.js";
import { Avatar } from "../components/primitives.jsx";
import { arcadeMode } from "../lib/standings.js";

const RaceView = lazy(() => import("../RaceView.jsx"));

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
const FOLLOW_UP_DELAY_MS = 1_600;

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

export function DrivingScreen({ room, me, now, actions }) {
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
  const introRef = useRef(false);
  const finishedRef = useRef(false);
  const collisionRef = useRef(null);
  const arcade = arcadeMode(room);

  const pushBubble = useCallback((bubble) => {
    setBubbles((current) => [
      ...current,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, ...bubble },
    ].slice(-MAX_BUBBLES));
  }, []);

  // Opening line: the result of the last pit stop, or a fresh-kart remark.
  useEffect(() => {
    if (introRef.current) return;
    introRef.current = true;
    if (arcade) {
      pushBubble({ text: room.roundNumber <= 1 ? "Fresh kart. Send it!" : "Same kart, new sprint. Go!", tone: "remark" });
    } else if (room.roundNumber <= 1) {
      pushBubble({ text: "Fresh kart. Let's see what they forgot…", tone: "remark" });
    } else if (me.lastRepair) {
      pushBubble({ text: `Fixed: ${me.lastRepair.label.toLowerCase()}. Let's go!`, tone: "remark" });
    } else {
      pushBubble({ text: "Nothing got fixed. Be exact next time!", tone: "problem" });
    }
  }, [arcade, me.lastRepair, pushBubble, room.roundNumber]);

  // Collisions are public, not secret parts, so they are called out at once.
  useEffect(() => {
    const impact = car?.lastCollision;
    if (!impact || impact.atMs === collisionRef.current) return;
    collisionRef.current = impact.atMs;
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
    let followUp = null;
    for (const id of fired) {
      const first = shoutedRef.current.size === 0;
      shoutedRef.current.add(id);
      const shout = shoutFor(id, { car });
      if (shout) pushBubble(shout);
      if (first) {
        followUp = window.setTimeout(
          () => pushBubble({ text: "Remember that for next round!", tone: "remark" }),
          FOLLOW_UP_DELAY_MS,
        );
      }
    }
    return () => {
      if (followUp) window.clearTimeout(followUp);
    };
  }, [car, controls, racing, pushBubble]);

  useEffect(() => {
    if (!car || car.finishedAtMs === null || car.finishedAtMs === undefined || finishedRef.current) return;
    finishedRef.current = true;
    pushBubble({
      text: car.rank === 1 ? "Across the line first!" : `Across the line, ${ordinal(car.rank)}!`,
      tone: "remark",
    });
  }, [car, pushBubble]);

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
    return () => {
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", releaseAll);
      releaseAll();
    };
  }, [actions]);

  useEffect(() => {
    const handleKey = (event, pressed) => {
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

      <Suspense fallback={<div className="ph-drive__scene ph-drive__scene--loading">LOADING TRACK…</div>}>
        <RaceView room={room} currentPlayerId={me.id} view="driver" className="ph-drive__scene" />
      </Suspense>

      <div className="ph-drive__controls" aria-label="Kart controls">
        <div className="ph-pads">
          <Pad control="left" active={controls.left} onControl={updateControl}>
            <span className="ph-pad__arrow-left" aria-hidden="true" />
          </Pad>
          <Pad control="right" active={controls.right} onControl={updateControl}>
            <span className="ph-pad__arrow-right" aria-hidden="true" />
          </Pad>
          <Pad control="accelerate" active={controls.accelerate} onControl={updateControl} className="ph-pad--gas">
            <span className="ph-pad__gas">GAS</span>
          </Pad>
          <Pad control="brake" active={controls.brake} onControl={updateControl} className="ph-pad--brake">
            <span className="ph-pad__brake">BRAKE</span>
          </Pad>
        </div>
      </div>

      <StartSignal startsAt={room.startsAt} now={now} className="ph-drive__start" />
    </main>
  );
}
