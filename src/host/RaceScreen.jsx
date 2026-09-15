import { Suspense, lazy } from "react";
import { SHOUT_GRACE_MS, TRACK_NAME } from "../config.js";
import { displayRound, isReversing, kartNameFor, kph, ordinal } from "../lib/format.js";
import { publicRemark } from "../lib/shouts.js";
import { racePositions, racers } from "../lib/standings.js";
import { splitScreenGrid, splitScreenViews } from "../split-screen.js";
import { Avatar, Pill } from "../components/primitives.jsx";
import { StartSignal } from "../components/StartSignal.jsx";
import { faultIcon } from "../kart-fault-icons.js";
import { THOUGHT_DELAY_MS } from "../kart-thought-bubble-model.js";
import { discoverableDefectIds } from "../../shared/defect-discovery.js";

const RaceView = lazy(() => import("../RaceView.jsx"));

/**
 * The race is a split screen: every racer gets a third-person chase camera in
 * seat order, tiled like a console party racer, with that kart's HUD drawn
 * inside its own feed. Three racers leave a spare cell, which shows the island.
 */
export function RaceScreen({ room, now }) {
  const order = racePositions(room);
  const positions = new Map(order.map((player, index) => [player.id, index + 1]));
  const cars = racers(room);
  const elapsedMs = Math.max(0, now - room.startsAt);
  const round = displayRound(room);
  const feeds = cars.map((player) => ({ key: player.id, playerId: player.id }));
  const views = splitScreenViews(feeds);
  const { columns, rows } = splitScreenGrid(feeds.length);
  const byId = new Map(cars.map((player) => [player.id, player]));

  return (
    <div className="tv-screen tv-race">
      <header className="tv-race__header">
        <span className="tv-race__track">{TRACK_NAME}</span>
        <Pill tone="yellow" className="tv-pill">{room.finalRace ? "FINAL RACE" : `Round ${round} · ${room.trackLength}m`}</Pill>
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
          <RaceView room={room} feeds={feeds} className="tv-race__view" />
        </Suspense>
        <div
          className="tv-race__feeds"
          style={{
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
          }}
        >
          {views.map((view) => {
            const player = view.playerId ? byId.get(view.playerId) : null;
            return player ? (
              <FeedHud
                key={view.key}
                player={player}
                position={positions.get(player.id)}
                count={cars.length}
                elapsedMs={elapsedMs}
                trackLength={room.trackLength}
              />
            ) : (
              <div className="tv-feed tv-feed--island" key={view.key}>
                <Pill tone="ink" className="tv-pill tv-feed__tag">Corsica GP · Island cam</Pill>
              </div>
            );
          })}
        </div>
        <StartSignal startsAt={room.startsAt} now={now} className="tv-race__start" />
      </div>
    </div>
  );
}

function FeedHud({ player, position, count, elapsedMs, trackLength }) {
  const { car } = player;
  const remark = publicRemark(player, {
    position,
    racerCount: count,
    elapsedMs,
    graceMs: SHOUT_GRACE_MS,
  });
  const positionLabel = car.rank ? ordinal(car.rank) : position ? ordinal(position) : "—";

  return (
    <div className="tv-feed" style={{ "--seat": player.identity.color }}>
      <div className="tv-feed__driver">
        <Avatar identity={player.identity} size={30} border={2} fontSize={15}>{player.badge}</Avatar>
        <div className="tv-feed__driver-text">
          <span className="tv-feed__name">{player.name}</span>
          <span className="tv-feed__kart">{kartNameFor(player)}</span>
        </div>
        {elapsedMs >= THOUGHT_DELAY_MS && <DriverFault player={player} />}
      </div>
      <div className="tv-feed__position">
        <span className="tv-feed__position-value">{positionLabel}</span>
        <span className="tv-feed__position-of">/ {count}</span>
      </div>
      <div className="tv-feed__bottom">
        {remark ? (
          <div className={`tv-feed__alert tone--${remark.tone}`} key={remark.text}>{remark.text}</div>
        ) : null}
        <div className="tv-feed__stats">
          <span className="tv-feed__speed">
            {kph(car.speed)}
            <small>{isReversing(car) ? "KPH · REV" : "KPH"}</small>
          </span>
          <span className="tv-feed__distance">{Math.round(car.distance)} / {trackLength} M</span>
        </div>
      </div>
    </div>
  );
}

function DriverFault({ player }) {
  const { car } = player;
  const ids = discoverableDefectIds(car);
  if (!ids.length) {
    return (
      <span className="tv-feed__faults tv-feed__faults--fixed" role="img" aria-label={`${player.name}: no remaining faults`} title="Fully fixed">
        <svg viewBox="0 0 32 32" width="18" height="18" aria-hidden="true">
          <circle cx="16" cy="16" r="14" fill="#22854f" />
          <path d="m9 16 5 5 9-10" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return <span className="tv-feed__faults" aria-label={`${player.name}: remaining faults`}>
    {ids.map((id) => {
      const icon = faultIcon(id, car);
      if (!icon) return null;
      const label = icon.label.join(" ").toLowerCase();
      return <img key={id} src={icon.src} alt={label} title={label} width="20" height="20" draggable={false} />;
    })}
  </span>;
}
