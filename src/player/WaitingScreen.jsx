import { SEAT_COUNT } from "../config.js";
import { EMPTY_IDENTITY, decoratePlayers, seatStatus } from "../lib/identity.js";
import { Pill } from "../components/primitives.jsx";

function rulesFor(buildSeconds, arcade) {
  return [
    "Describe your car.",
    `You get ${buildSeconds} seconds. One prompt, no edits.`,
    "The garage builds it. Then you race one sprint.",
    arcade
      ? "Then race again. Most points after four sprints wins."
      : "After each sprint, one pit stop: one more message to the garage.",
  ];
}

export function WaitingScreen({ room, me }) {
  const players = decoratePlayers(room);
  const emptySeats = Math.max(0, SEAT_COUNT - players.length);
  const filled = players.length <= SEAT_COUNT
    ? `${players.length} of ${SEAT_COUNT} seats filled`
    : `${players.length} drivers in`;
  const rules = rulesFor(Math.round((room.buildDurationMs ?? 15_000) / 1000), room.defectsEnabled === false);

  return (
    <main className="ph-screen ph-screen--cream ph-waiting">
      <div className="ph-head">
        <Pill tone="yellow" className="ph-pill">You're in, {me.name}</Pill>
        <h1 className="ph-title">Waiting for<br />the host</h1>
      </div>

      <div className="ph-live">
        <span className="ph-live__dot" aria-hidden="true" />
        <span>{filled}</span>
      </div>

      <ul className="ph-seats">
        {players.map((player) => (
          <li className={`ph-seat ${player.id === me.id ? "ph-seat--me" : ""}`} key={player.id}>
            <span className="ph-seat__dot" style={{ background: player.identity.color }} />
            <span className="ph-seat__name">{player.name}{player.id === me.id ? " (you)" : ""}</span>
            <span className="ph-seat__tag">{seatStatus(player)}</span>
          </li>
        ))}
        {Array.from({ length: emptySeats }, (_, index) => (
          <li className="ph-seat ph-seat--empty" key={`empty-${index}`}>
            <span className="ph-seat__dot" style={{ background: EMPTY_IDENTITY.color }} />
            <span className="ph-seat__name">Open seat</span>
            <span className="ph-seat__tag">SCAN TO JOIN</span>
          </li>
        ))}
      </ul>

      <section className="ph-rules">
        <span className="ph-rules__label">HOW A ROUND GOES</span>
        {rules.map((text, index) => (
          <div className="ph-rule" key={text}>
            <span className="ph-rule__num">{index + 1}</span>
            <span className="ph-rule__text">{text}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
