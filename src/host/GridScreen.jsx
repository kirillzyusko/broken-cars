import { TRACK_NAME } from "../config.js";
import { displayRound, kartNameFor } from "../lib/format.js";
import { decoratePlayers } from "../lib/identity.js";
import { Avatar, KartPlaceholder, Pill } from "../components/primitives.jsx";

const CREAM_BADGE = { color: "#faf7f0", onColor: "#141210" };

export function GridScreen({ room }) {
  const assigning = room.phase === "assigning";
  const repairing = room.phase === "repairing";
  const building = assigning || repairing;
  const players = decoratePlayers(room).filter((player) => (assigning ? player.hasPrompt : player.car));
  const round = displayRound(room);
  const columns = Math.min(Math.max(players.length, 1), 4);

  function mysteryFor() {
    if (assigning || repairing) return "In the garage…";
    return "Built.";
  }

  const footer = building
    ? "The garage is working on every kart."
    : "Karts are ready. Lights go green any second.";

  return (
    <div className="tv-screen tv-grid">
      <header className="tv-grid__header">
        <h1 className="tv-grid__title">{building ? "IN THE GARAGE" : "ON THE GRID"}</h1>
        <div className="tv-grid__pills">
          <Pill tone="yellow" className="tv-pill">Round {round}</Pill>
          <Pill tone="cream" className="tv-pill">{TRACK_NAME}</Pill>
        </div>
      </header>

      {players.length === 0 ? (
        <div className="tv-grid__empty">NO KARTS ON THE GRID</div>
      ) : (
        <ul className="tv-grid__cards" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
          {players.map((player) => (
            <li className="tv-kart-card" key={player.id}>
              <div className="tv-kart-card__head" style={{ background: player.identity.color }}>
                <Avatar identity={CREAM_BADGE} size={54} fontSize={26}>{player.badge}</Avatar>
                <span className="tv-kart-card__name" style={{ color: player.identity.onColor }}>{player.name}</span>
              </div>
              <KartPlaceholder className="tv-kart-card__render">
                <span className="kart-placeholder__caption">
                  {building ? "in the garage" : "kart render"}
                  <br />
                  {kartNameFor(player)}
                </span>
              </KartPlaceholder>
              <div className="tv-kart-card__foot">
                <span className="tv-kart-card__kart">{kartNameFor(player)}</span>
                <span className="tv-kart-card__mystery">{mysteryFor()}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="tv-grid__footer">{footer}</p>

    </div>
  );
}
