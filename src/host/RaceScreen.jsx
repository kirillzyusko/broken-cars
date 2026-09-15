import { Suspense, lazy } from "react";
import { SHOUT_GRACE_MS, TRACK_NAME } from "../config.js";
import { displayRound, isReversing, kartNameFor, kph, ordinal } from "../lib/format.js";
import { publicRemark } from "../lib/shouts.js";
import { racePositions, racers } from "../lib/standings.js";
import { Avatar, Pill } from "../components/primitives.jsx";
import { StartSignal } from "../components/StartSignal.jsx";

const RaceView = lazy(() => import("../RaceView.jsx"));

export function RaceScreen({ room, now }) {
  const order = racePositions(room);
  const positions = new Map(order.map((player, index) => [player.id, index + 1]));
  const cars = racers(room);
  const elapsedMs = Math.max(0, now - room.startsAt);
  const round = displayRound(room);

  return (
    <div className="tv-screen tv-race">
      <header className="tv-race__header">
        <span className="tv-race__track">{TRACK_NAME}</span>
        <Pill tone="yellow" className="tv-pill">Round {round} · {room.trackLength}m</Pill>
        <div className="tv-race__standings">
          {order.slice(0, 4).map((player, index) => (
            <div className="tv-standing-pill" key={player.id}>
              <Avatar identity={player.identity} size={34} border={3} fontSize={16}>{player.badge}</Avatar>
              <span className="tv-standing-pill__pos">{ordinal(index + 1)}</span>
              <span className="tv-standing-pill__name">{player.name}</span>
            </div>
          ))}
        </div>
      </header>

      <div className="tv-race__stage">
        <Suspense fallback={<div className="tv-race__loading">LOADING CORSICA GP…</div>}>
          <RaceView room={room} view="spectator" className="tv-race__view" />
        </Suspense>
        <StartSignal startsAt={room.startsAt} now={now} className="tv-race__start" />
        <div
          className="tv-race__hud"
          style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(cars.length, 1), 4)}, 1fr)` }}
        >
          {cars.map((player) => (
            <HudCard
              key={player.id}
              player={player}
              position={positions.get(player.id)}
              count={cars.length}
              elapsedMs={elapsedMs}
              trackLength={room.trackLength}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function HudCard({ player, position, count, elapsedMs, trackLength }) {
  const { car } = player;
  const remark = publicRemark(player, {
    position,
    racerCount: count,
    elapsedMs,
    graceMs: SHOUT_GRACE_MS,
  });
  const positionLabel = car.rank ? ordinal(car.rank) : position ? ordinal(position) : "—";

  return (
    <div className="tv-hud-card">
      <div className="tv-hud-card__row">
        <Avatar identity={player.identity} size={54} fontSize={25}>{player.badge}</Avatar>
        <div className="tv-hud-card__text">
          <span className="tv-hud-card__name">{player.name}</span>
          <span className="tv-hud-card__kart">{kartNameFor(player)}</span>
        </div>
        <div className="tv-hud-card__position">
          <span className="tv-hud-card__position-value">{positionLabel}</span>
          <span className="tv-hud-card__position-of">/ {count}</span>
        </div>
      </div>
      <div className="tv-hud-card__row tv-hud-card__row--stats">
        <div className="tv-hud-card__speed">
          <span className="tv-hud-card__speed-value">{kph(car.speed)}</span>
          <span className="tv-hud-card__speed-unit">{isReversing(car) ? "KPH · REV" : "KPH"}</span>
        </div>
        <span className="tv-hud-card__distance">{Math.round(car.distance)} / {trackLength} M</span>
      </div>
      {remark ? (
        <div className={`tv-hud-card__alert tone--${remark.tone}`} key={remark.text}>{remark.text}</div>
      ) : null}
    </div>
  );
}
