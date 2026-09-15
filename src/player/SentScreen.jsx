import { clockLabel } from "../lib/format.js";
import { decoratePlayers } from "../lib/identity.js";
import { statusLabel, windowClosed } from "../lib/standings.js";
import { Pill } from "../components/primitives.jsx";

function copyFor(variant, { remaining }) {
  const closing = remaining > 0 ? `Window closes in ${clockLabel(remaining)}` : "Waiting for the host to start";
  const pitClosing = remaining > 0 ? `Pit closes in ${clockLabel(remaining)}` : "Waiting for the host";
  switch (variant) {
    case "sent":
      return { pill: { tone: "green", text: "Prompt sent" }, title: ["In the", "garage now"], footer: closing };
    case "fix-sent":
      return { pill: { tone: "green", text: "Fix sent" }, title: ["Back in", "the pit"], footer: pitClosing };
    case "building":
      return {
        pill: { tone: "green", text: "Prompt sent" },
        title: ["The garage", "is building"],
        footer: "Lights go green any second",
      };
    case "repairing":
      return {
        pill: { tone: "green", text: "Fix sent" },
        title: ["The mechanic", "is looking"],
        footer: "Lights go green any second",
      };
    case "missed":
      return {
        pill: { tone: "red", text: "Window closed" },
        title: ["Missed", "the garage"],
        footer: "No prompt, no kart. The race runs without you",
      };
    case "missed-fix":
      return {
        pill: { tone: "red", text: "Pit closed" },
        title: ["No fix", "this round"],
        footer: "Your kart races exactly as it is",
      };
    case "tuned":
      return { pill: { tone: "green", text: "Fully tuned" }, title: ["Nothing left", "to fix"], footer: pitClosing };
    case "spectating":
    default:
      return {
        pill: { tone: "cream", text: "Spectating" },
        title: ["Watch from", "the pit wall"],
        footer: "No kart this session. The race runs without you",
      };
  }
}

export function SentScreen({ room, me, now, variant, history = [] }) {
  const deadline = room.phase === "tuning" ? room.tuningDeadline : room.promptDeadline;
  const remaining = deadline ? Math.max(0, deadline - now) : 0;
  const copy = copyFor(variant, { remaining });
  const others = decoratePlayers(room).filter((player) => player.id !== me.id);
  const closed = windowClosed(room, now);
  const showWaitingOn = ["prompting", "tuning", "assigning", "repairing"].includes(room.phase) && others.length > 0;
  const latestRound = history[history.length - 1]?.round;

  return (
    <main className="ph-screen ph-screen--cream ph-sent">
      <div className="ph-head">
        <Pill tone={copy.pill.tone} className="ph-pill">{copy.pill.text}</Pill>
        <h1 className="ph-title">{copy.title[0]}<br />{copy.title[1]}</h1>
      </div>

      {history.length > 0 ? (
        <section className="ph-echo" aria-label="Your prompts so far">
          <span className="ph-echo__label">
            {history.length > 1 ? "EVERYTHING YOU'VE ASKED FOR" : `YOUR ROUND ${history[0].round} PROMPT`}
          </span>
          {history.map((entry) => (
            <div
              className={`ph-echo__line ${entry.round === latestRound ? "ph-echo__line--latest" : ""}`}
              key={entry.round}
            >
              <span className="ph-echo__round">R{entry.round}</span>
              <span className="ph-echo__text">“{entry.text}”</span>
            </div>
          ))}
        </section>
      ) : null}

      {showWaitingOn ? (
        <section className="ph-list ph-list--bottom">
          <span className="ph-list__label">WAITING ON</span>
          {others.map((player) => {
            const status = statusLabel(player, room, { closed });
            return (
              <div className="ph-row" key={player.id}>
                <span className="ph-row__dot" style={{ background: player.identity.color }} />
                <span className="ph-row__name">{player.name}</span>
                <span className={`ph-row__status status-text--${status.tone}`}>{status.label}</span>
              </div>
            );
          })}
        </section>
      ) : null}

      <p className={`ph-footer-bar ${showWaitingOn ? "" : "ph-footer-bar--bottom"}`}>{copy.footer}</p>
    </main>
  );
}
