import { useState } from "react";
import BackgroundMusic from "./BackgroundMusic.jsx";
import MenuMapBackground from "./MenuMapBackground.jsx";
import { GAME_NAME } from "./config.js";
import { StickerButton } from "./components/primitives.jsx";

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
      <BackgroundMusic showControl={false} />
      <MenuMapBackground />
      <div className="home__shade" aria-hidden="true" />
      <section className="home__card">
        <h1 className="home__wordmark"><img src="/images/game-logo.svg" alt={GAME_NAME} width="642" height="55" /></h1>
        <p className="home__lede" role={error ? "alert" : undefined}>
          {error || "Describe a car. The garage builds it. Race it."}
        </p>
        <StickerButton className="home__button" type="button" onClick={createGame} disabled={creating}>
          {creating ? "OPENING THE GARAGE…" : "OPEN A ROOM"}
        </StickerButton>
      </section>
    </main>
  );
}
