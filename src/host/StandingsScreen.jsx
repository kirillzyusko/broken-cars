import { raceAward } from "../../shared/race-extras.js";
import { lazy, Suspense } from "react";
import { ordinal } from "../lib/format.js";
import { tally } from "../lib/standings.js";
import { StickerButton } from "../components/primitives.jsx";

const RaceView = lazy(() => import("../RaceView.jsx"));

export function StandingsScreen({ room, history, hostAction, final = false }) {
  const rows = tally(history, room);
  const award = raceAward(room.players);
  const awardName = rows.find((p) => p.id === award?.playerId)?.name;
  return (
    <div className="tv-screen tv-results">
      <Suspense fallback={null}>
        <RaceView room={room} view="results" currentPlayerId={rows[0]?.id} className="tv-results__background" />
      </Suspense>
      <section className="tv-results__panel" aria-label="Leaderboard">
        <img className="tv-results__logo" src="/images/game-logo.svg" alt="Kaaaaart" width="642" height="55" />
        <header>
          <p className="tv-results__round">{final ? "Final standings" : `Round ${room.roundNumber} complete`}</p>
          <h1>{final && rows[0] ? `${rows[0].name} wins!` : "Standings"}</h1>
        </header>
        <ol className="tv-results__list">
          {rows.map((player, index) => (
            <li className={index === 0 ? "tv-results__leader" : ""} key={player.id}>
              <span className="tv-results__rank">{ordinal(index + 1)}</span>
              <span className="tv-results__color" style={{ background: player.identity.color }} />
              <span className="tv-results__name">{player.name}</span>
              <span className="tv-results__points">{player.points}<small>PTS</small></span>
            </li>
          ))}
        </ol>
        {award && <p className="race-award">{award.title}: {awardName} · {award.detail}</p>}
        {hostAction && <StickerButton className="tv-button" type="button" disabled={hostAction.disabled} onClick={hostAction.run}>{hostAction.label}</StickerButton>}
        {final && <StickerButton as="a" className="tv-button" href="/">NEW ROOM</StickerButton>}
      </section>
    </div>
  );
}
