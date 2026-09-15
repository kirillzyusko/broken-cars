import { useState } from "react";
import BackgroundMusic from "./BackgroundMusic.jsx";
import MenuMapBackground from "./MenuMapBackground.jsx";
import { GAME_NAME } from "./config.js";
import { Pill, StickerButton } from "./components/primitives.jsx";

export function Home() {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function createGame() {
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/rooms", { method: "POST" });
      if (!response.ok) throw new Error("Could not open a room.");
      const room = await response.json();
      sessionStorage.setItem(`broken-cars:host:${room.roomId}`, room.hostToken);
      sessionStorage.setItem(`broken-cars:join:${room.roomId}`, room.joinUrl);
      window.location.assign(`/host/${room.roomId}`);
    } catch (reason) {
      setError(reason.message);
      setCreating(false);
    }
  }

  return (
    <main className="home">
      <BackgroundMusic />
      <MenuMapBackground />
      <div className="home__shade" aria-hidden="true" />
      <section className="home__card">
        <Pill tone="red" className="home__pill">Party mode · phones vs. the garage</Pill>
        <h1 className="home__wordmark">{GAME_NAME}</h1>
        <p className="home__lede">
          Describe a car. The garage builds it. Race it.
        </p>
        <StickerButton className="home__button" type="button" onClick={createGame} disabled={creating}>
          {creating ? "OPENING THE GARAGE…" : "OPEN A ROOM"}
        </StickerButton>
        {error ? <p className="home__error">{error}</p> : null}
        <StickerButton as="a" tone="cream" className="home__explore" href="/map">EXPLORE CORSICA GP</StickerButton>
        <p className="home__hint">
          Put this screen on the TV.
          <br />
          Phones join by scanning the QR code.
        </p>
      </section>
    </main>
  );
}
