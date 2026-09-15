import { useEffect, useState } from "react";
import { GAME_NAME } from "../config.js";
import { IDENTITIES, IDENTITY_BY_KEY, freeIdentities } from "../lib/identity.js";
import { Avatar, Pill, StickerButton } from "../components/primitives.jsx";

const NAME_KEY = "broken-cars:name";
const MAX_NAME_LENGTH = 16;
const RETRY_AFTER_MS = 2_500;

function rememberedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function ClaimSeatScreen({ room, roomId, me, onJoin }) {
  const [name, setName] = useState(rememberedName);
  const [picked, setPicked] = useState(null);
  const [sending, setSending] = useState(false);
  const free = freeIdentities(room, me.id);
  const freeKeys = new Set(free.map((identity) => identity.key));
  const chosen = picked && freeKeys.has(picked) ? picked : (free[0]?.key ?? null);
  const identity = chosen ? IDENTITY_BY_KEY[chosen] : me.identity;
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const ready = name.trim().length > 0;

  // If the server rejected the claim the parent never switches screens, so
  // let the player try again.
  useEffect(() => {
    if (!sending) return undefined;
    const timer = window.setTimeout(() => setSending(false), RETRY_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [sending]);

  function submit(event) {
    event.preventDefault();
    if (!ready || sending) return;
    const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
    try {
      localStorage.setItem(NAME_KEY, trimmed);
    } catch {
      // Remembering the name is a convenience only.
    }
    setSending(true);
    onJoin({ name: trimmed, color: chosen });
  }

  return (
    <main className="ph-screen ph-screen--sky ph-join">
      <div className="ph-ground" aria-hidden="true" />
      <div className="ph-join__head">
        <Pill tone="red" className="ph-pill">Room {roomId}</Pill>
        <h1 className="ph-join__wordmark">{GAME_NAME}</h1>
      </div>

      <form className="ph-join__form" onSubmit={submit}>
        <div className="ph-join__field">
          <label className="ph-join__label" htmlFor="name-field">YOUR NAME</label>
          <input
            id="name-field"
            className="ph-join__input"
            type="text"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Denise"
            autoComplete="nickname"
            autoCapitalize="words"
            enterKeyHint="done"
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="ph-join__field">
          <span className="ph-join__label">PICK YOUR COLOUR</span>
          <div className="ph-join__swatches" role="radiogroup" aria-label="Kart colour">
            {IDENTITIES.map((option) => {
              const taken = !freeKeys.has(option.key);
              const selected = chosen === option.key;
              return (
                <button
                  type="button"
                  key={option.key}
                  className={`ph-join__swatch ${taken ? "ph-join__swatch--taken" : ""}`}
                  style={{ background: option.color, color: option.onColor }}
                  disabled={taken}
                  role="radio"
                  aria-checked={selected}
                  aria-label={taken ? `${option.key}, taken` : option.key}
                  onClick={() => setPicked(option.key)}
                >
                  {selected ? "✓" : taken ? "×" : ""}
                </button>
              );
            })}
          </div>
        </div>

        <div className="ph-join__preview">
          <Avatar identity={identity} size={62} fontSize={28} bob>{initial}</Avatar>
          <span className="ph-join__preview-text">Your badge rides along on the TV cameras.</span>
        </div>

        <div className="ph-join__bottom">
          <StickerButton className="ph-button" type="submit" disabled={!ready || sending}>
            {sending ? "JOINING…" : "JOIN THE RACE"}
          </StickerButton>
          <p className="ph-join__hint">
            Keep this open — it becomes
            <br />
            your controller.
          </p>
        </div>
      </form>
    </main>
  );
}
