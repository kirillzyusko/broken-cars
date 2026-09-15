import { formatLapTime, kartNameFor, ordinal } from "../lib/format.js";
import { arcadeMode, roundDots, roundsIn, tally } from "../lib/standings.js";
import { Avatar, Pill, RoundDot, StickerButton } from "../components/primitives.jsx";

export function StandingsScreen({ room, history, hostAction }) {
  const rows = tally(history, room);
  const rounds = roundsIn(history).slice(-4);
  const dots = roundDots(room);
  const gridTemplateColumns = `110px 1fr ${rounds.map(() => "210px").join(" ")} 180px`;
  const dense = rows.length > 4;
  const stillBroken = rows.filter((player) => player.car.defects.length > 0).length;

  return (
    <div className="tv-screen tv-standings">
      <header className="tv-standings__header">
        <div className="tv-standings__title-block">
          <Pill tone="red" className="tv-pill tv-pill--loose">Round {room.roundNumber} · complete</Pill>
          <h1 className="tv-standings__title">STANDINGS</h1>
        </div>
        <div className="tv-round-dots">
          {dots.map((dot) => <RoundDot key={dot.n} state={dot.state}>{dot.n}</RoundDot>)}
        </div>
      </header>

      <div className="tv-standings__table">
        <div className="tv-standings__columns" style={{ gridTemplateColumns }}>
          <span>POS</span>
          <span>PLAYER</span>
          {rounds.map((round) => <span key={round}>R{round} TIME</span>)}
          <span className="tv-standings__columns--right">POINTS</span>
        </div>
        {rows.map((player, index) => (
          <div
            className={`tv-standings__row ${index === 0 ? "tv-standings__row--leader" : ""} ${dense ? "tv-standings__row--dense" : ""}`}
            style={{ gridTemplateColumns }}
            key={player.id}
          >
            <span className="tv-standings__pos">{ordinal(index + 1)}</span>
            <div className="tv-standings__player">
              <Avatar identity={player.identity} size={dense ? 48 : 62} fontSize={dense ? 22 : 28}>
                {player.badge}
              </Avatar>
              <div className="tv-standings__player-text">
                <span className="tv-standings__name">{player.name}</span>
                <span className="tv-standings__kart">{kartNameFor(player)}</span>
              </div>
            </div>
            {rounds.map((round) => (
              <span className="tv-standings__time" key={round}>
                {formatLapTime(player.results[round]?.finishedAtMs ?? null)}
              </span>
            ))}
            <span className="tv-standings__points">{player.points}</span>
          </div>
        ))}
      </div>

      <footer className="tv-standings__footer">
        <span className="tv-standings__footer-text">
          {arcadeMode(room)
            ? "Same karts, one more sprint. Points carry over."
            : `${stillBroken} ${stillBroken === 1 ? "kart still has" : "karts still have"} something missing. Open the pit for one fix each.`}
        </span>
        {hostAction ? (
          <StickerButton className="tv-button" type="button" disabled={hostAction.disabled} onClick={hostAction.run}>
            {hostAction.label}
          </StickerButton>
        ) : null}
      </footer>
    </div>
  );
}
