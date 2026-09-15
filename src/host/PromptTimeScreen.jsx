import { URGENT_THRESHOLD_MS } from "../config.js";
import { clockLabel, displayRound } from "../lib/format.js";
import { decoratePlayers } from "../lib/identity.js";
import { statusLabel } from "../lib/standings.js";
import { Avatar, Pill, StatusDot, StickerButton } from "../components/primitives.jsx";

export function PromptTimeScreen({ room, now, hostAction }) {
  const tuning = room.phase === "tuning";
  const deadline = tuning ? room.tuningDeadline : room.promptDeadline;
  const total = tuning ? room.tuningDurationMs : room.buildDurationMs;
  const remaining = Math.max(0, (deadline ?? now) - now);
  const over = remaining <= 0;
  const urgent = remaining <= URGENT_THRESHOLD_MS;
  const round = displayRound(room);
  const players = decoratePlayers(room);
  const sent = players.filter((player) => (tuning ? player.hasTuningPrompt : player.hasPrompt)).length;
  const columns = Math.min(Math.max(players.length, 1), 4);
  const percent = total > 0 ? Math.round((remaining / total) * 100) : 0;

  const copy = tuning
    ? {
        pill: `Round ${round} · one message each`,
        title: "PIT STOP",
        lede: over
          ? `Pit's closed. ${sent} ${sent === 1 ? "message is" : "messages are"} with the garage.`
          : "One message to the garage. Send it before the pit closes.",
      }
    : {
        pill: `Round ${round} · one message each`,
        title: "MAKE IT COUNT",
        lede: over
          ? `Time's up. ${sent} ${sent === 1 ? "kart is" : "karts are"} waiting in the garage.`
          : "One message to the garage. Send it before the clock runs out.",
      };

  return (
    <div className="tv-screen tv-prompt">
      <div className="tv-prompt__circle" aria-hidden="true" />

      <div className="tv-prompt__top">
        <Pill tone="yellow" className="tv-pill tv-pill--lg">{copy.pill}</Pill>
        <h1 className="tv-prompt__title">{copy.title}</h1>
        <p className="tv-prompt__lede">{copy.lede}</p>
      </div>

      <div className="tv-prompt__clock">
        <div className={`tv-prompt__numeral ${urgent ? "tv-prompt__numeral--urgent" : ""}`}>
          {clockLabel(remaining)}
        </div>
        {over && hostAction ? (
          <StickerButton className="tv-button" type="button" disabled={hostAction.disabled} onClick={hostAction.run}>
            {hostAction.label}
          </StickerButton>
        ) : (
          <div className="tv-prompt__bar">
            <div
              className={`tv-prompt__bar-fill ${urgent ? "tv-prompt__bar-fill--urgent" : ""}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>

      <ul className="tv-prompt__players" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {players.map((player) => {
          const status = statusLabel(player, room, { closed: over });
          return (
            <li className="tv-status-card" key={player.id}>
              <Avatar identity={player.identity} size={50} fontSize={24}>{player.badge}</Avatar>
              <div className="tv-status-card__body">
                <span className="tv-status-card__name">{player.name}</span>
                <span className={`tv-status-card__status status-text--${status.tone}`}>{status.label}</span>
              </div>
              <StatusDot tone={status.tone} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
