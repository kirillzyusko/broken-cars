import { TRACK_NAME } from "../config.js";
import { kartNameFor, ordinal } from "../lib/format.js";
import { arcadeMode, roundsIn, tally } from "../lib/standings.js";
import { Avatar, CheckerStrip, Pill, StickerButton } from "../components/primitives.jsx";

const PODIUM_HEIGHTS = ["100%", "86%", "74%", "66%"];

export function FinalScreen({ room, history, hostAction = null }) {
  const rows = tally(history, room);
  const winner = rows[0];
  const rounds = roundsIn(history).length;
  const podium = [rows[1], rows[0], rows[2], rows[3], ...rows.slice(4)].filter(Boolean);

  return (
    <div className="tv-screen tv-final">
      <CheckerStrip />
      <div className="tv-final__body">
        <header className="tv-final__header">
          <Pill tone="yellow" className="tv-pill tv-pill--lg">
            {TRACK_NAME} · {rounds} {rounds === 1 ? "round" : "rounds"}
          </Pill>
          <h1 className="tv-final__title">{winner ? `${winner.name.toUpperCase()} WINS` : "RACE OVER"}</h1>
          <p className="tv-final__sub">
            {arcadeMode(room)
              ? `${rounds} ${rounds === 1 ? "sprint" : "sprints"}, same karts, most points wins.`
              : `${rounds} ${rounds === 1 ? "sprint" : "sprints"}, one garage, most points wins.`}
          </p>
        </header>

        <div className="tv-final__podium" style={{ gridTemplateColumns: `repeat(${Math.max(podium.length, 1)}, 1fr)` }}>
          {podium.map((player) => {
            const rank = rows.indexOf(player) + 1;
            return (
              <div className="tv-podium-card" style={{ height: PODIUM_HEIGHTS[rank - 1] ?? "60%" }} key={player.id}>
                <span className="tv-podium-card__pos">{ordinal(rank)}</span>
                <Avatar identity={player.identity} size={96} border={5} fontSize={42}>{player.badge}</Avatar>
                <span className="tv-podium-card__name">{player.name}</span>
                <span className="tv-podium-card__kart">{kartNameFor(player)}</span>
                <span className="tv-podium-card__points">{player.points} PTS</span>
              </div>
            );
          })}
        </div>

        <div className="tv-final__actions">
          {hostAction ? (
            <StickerButton className="tv-button" type="button" disabled={hostAction.disabled} onClick={hostAction.run}>
              {hostAction.label}
            </StickerButton>
          ) : null}
          <StickerButton as="a" tone="cream" className="tv-button" href="/">NEW ROOM</StickerButton>
        </div>
      </div>
    </div>
  );
}
