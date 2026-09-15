import { useCallback, useEffect, useRef, useState } from "react";
import { PROMPT_MAX_LENGTH, URGENT_THRESHOLD_MS } from "../config.js";
import { clockLabel, displayRound } from "../lib/format.js";
import { roundDots } from "../lib/standings.js";
import { StickerButton } from "../components/primitives.jsx";

// The window auto-sends whatever has been typed just before it closes, so a
// slow thumb still gets a kart.
const AUTO_SEND_MS = 1_200;
const RETRY_AFTER_MS = 2_500;

const COPY = {
  build: {
    eyebrow: "PRIVATE — ONLY YOU SEE THIS",
    title: () => "Your car",
    label: "DESCRIBE YOUR CAR",
  },
  fix: {
    eyebrow: "PRIVATE — ONLY YOU SEE THIS",
    title: (round) => `Round ${round} message`,
    label: "YOUR MESSAGE TO THE GARAGE",
  },
};

export function PromptScreen({ room, me, now, mode, history, onSubmit }) {
  const fix = mode === "fix";
  const copy = COPY[mode];
  const deadline = fix ? room.tuningDeadline : room.promptDeadline;
  const remaining = Math.max(0, deadline - now);
  const urgent = remaining <= URGENT_THRESHOLD_MS;
  const round = displayRound(room);
  const dots = fix ? roundDots(room) : null;
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const submittedRef = useRef(false);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || submittedRef.current) return;
    submittedRef.current = true;
    setSending(true);
    onSubmit(text);
  }, [draft, onSubmit]);

  useEffect(() => {
    if (remaining > 0 && remaining <= AUTO_SEND_MS) submit();
  }, [remaining, submit]);

  // If the server rejected the prompt the parent never switches screens, so
  // let the player try again.
  useEffect(() => {
    if (!sending) return undefined;
    const timer = window.setTimeout(() => {
      submittedRef.current = false;
      setSending(false);
    }, RETRY_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [sending]);

  return (
    <main className="ph-screen ph-screen--blue ph-prompt">
      <header className="ph-prompt__head">
        <div className="ph-prompt__head-text">
          <span className="ph-prompt__eyebrow">{copy.eyebrow}</span>
          <h1 className="ph-prompt__title">{copy.title(round)}</h1>
        </div>
        <span className={`ph-clock ${urgent ? "ph-clock--urgent" : ""}`}>{clockLabel(remaining)}</span>
      </header>

      {dots ? (
        <div className="ph-rounds" aria-label="Round progress">
          {dots.map((dot) => (
            <span className={`ph-rounds__cell round-dot--${dot.state}`} key={dot.n}>{dot.n}</span>
          ))}
        </div>
      ) : null}

      {history.length > 0 ? (
        <section className="ph-well">
          <span className="ph-well__label">
            {history.length > 1 ? "EVERYTHING YOU'VE ASKED FOR" : "WHAT YOU'VE ASKED FOR SO FAR"}
          </span>
          {history.map((entry) => (
            <div className="ph-history-line" key={entry.round}>
              <span className="ph-history-line__round">R{entry.round}</span>
              <span className="ph-history-line__text">“{entry.text}”</span>
            </div>
          ))}
        </section>
      ) : null}

      <form
        className="ph-prompt__input-block"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="ph-prompt__label" htmlFor="prompt-field">{copy.label}</label>
        <div className="ph-field">
          <textarea
            id="prompt-field"
            value={draft}
            maxLength={PROMPT_MAX_LENGTH}
            disabled={sending}
            autoFocus
            onChange={(event) => setDraft(event.target.value.slice(0, PROMPT_MAX_LENGTH))}
          />
          <div className="ph-field__meta">
            <span>{draft.length}/{PROMPT_MAX_LENGTH}</span>
            <span>ONE SHOT</span>
          </div>
        </div>
      </form>

      <StickerButton className="ph-button" type="button" onClick={submit} disabled={!draft.trim() || sending}>
        {sending ? "SENDING…" : "SEND TO GARAGE"}
      </StickerButton>
    </main>
  );
}
