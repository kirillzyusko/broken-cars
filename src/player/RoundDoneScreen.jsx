import { formatLapTime, ordinal } from "../lib/format.js";
import { arcadeMode, positionOf, racePositions, sessionOver, tally } from "../lib/standings.js";
import { Pill } from "../components/primitives.jsx";

export function RoundDoneScreen({ room, me, history }) {
  const order = racePositions(room);
  const over = sessionOver(room);
  const arcade = arcadeMode(room);
  const rows = tally(history, room);
  const winner = rows[0];
  const pointsById = new Map(rows.map((player) => [player.id, player.points]));
  const myRank = me.car?.rank ?? null;
  const myPosition = positionOf(room, me.id);

  let title;
  if (over) title = winner ? `${winner.name} wins` : "Race over";
  else if (!me.car) title = "Round over";
  else if (myRank) title = `You came ${ordinal(myRank)}`;
  else title = myPosition ? `Out of road in ${ordinal(myPosition)}` : "Out of road";

  let card;
  if (over) {
    card = {
      tone: "",
      label: "THAT'S THE SESSION",
      text: arcade ? "Four sprints down. Thanks for driving." : "That's the session. Thanks for driving.",
    };
  } else if (arcade && me.car) {
    card = { tone: "", label: "SAME KART, NEXT SPRINT", text: "The host starts the rematch. Points carry over." };
  } else if (me.car) {
    card = { tone: "", label: "PIT STOP NEXT", text: "The host opens the pit. One message per kart." };
  } else {
    card = { tone: "", label: "SPECTATING", text: "No kart this session. Heckle responsibly." };
  }

  const list = over ? rows : order;

  return (
    <main className="ph-screen ph-screen--cream ph-sent ph-done">
      <div className="ph-head">
        <Pill tone={over ? "yellow" : "red"} className="ph-pill">
          {over ? "Final result" : `Round ${room.roundNumber} · done`}
        </Pill>
        <h1 className="ph-title">{title}</h1>
      </div>

      <section className="ph-list">
        <span className="ph-list__label">{over ? "FINAL STANDINGS" : "THIS SPRINT"}</span>
        {list.map((player, index) => (
          <div className={`ph-row ${player.id === me.id ? "ph-row--me" : ""}`} key={player.id}>
            <span className="ph-row__pos">{ordinal(index + 1)}</span>
            <span className="ph-row__dot" style={{ background: player.identity.color }} />
            <span className="ph-row__name">{player.name}</span>
            <span className="ph-row__status status-text--idle">
              {over ? `${pointsById.get(player.id) ?? 0} PTS` : formatLapTime(player.car.finishedAtMs)}
            </span>
          </div>
        ))}
      </section>

      <section className={`ph-card ${card.tone}`} style={{ marginTop: "auto" }}>
        <span className="ph-card__label">{card.label}</span>
        <span className="ph-card__text">{card.text}</span>
      </section>

      <p className="ph-footer-bar">
        {over ? "Thanks for driving" : arcade ? "Waiting for the host to restart" : "Waiting for the host to open the pit"}
      </p>
    </main>
  );
}
