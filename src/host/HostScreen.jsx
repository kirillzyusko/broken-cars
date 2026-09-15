import BackgroundMusic from "../BackgroundMusic.jsx";
import { useGameSocket } from "../use-game-socket.js";
import { useServerClock } from "../lib/use-now.js";
import { useRaceHistory } from "../lib/use-race-history.js";
import { sessionOver } from "../lib/standings.js";
import { ConnectionBadge, ErrorBanner, StickerButton } from "../components/primitives.jsx";
import { TvLoading, TvStage } from "./TvStage.jsx";
import { JoinScreen } from "./JoinScreen.jsx";
import { PromptTimeScreen } from "./PromptTimeScreen.jsx";
import { GridScreen } from "./GridScreen.jsx";
import { RaceScreen } from "./RaceScreen.jsx";
import { StandingsScreen } from "./StandingsScreen.jsx";
import { FinalScreen } from "./FinalScreen.jsx";

function hostActionFor(room, now, actions) {
  if (!room) return null;
  const connected = room.players.filter((player) => player.connected).length;
  switch (room.phase) {
    case "waiting":
      return {
        label: connected > 0 ? "START THE BUILD" : "WAITING FOR DRIVERS",
        disabled: connected === 0,
        run: actions.startBuild,
      };
    case "prompting": {
      if (room.promptDeadline - now > 0) return null;
      const ready = room.players.filter((player) => player.hasPrompt).length;
      return {
        label: ready > 0 ? "START THE RACE" : "NO KARTS SUBMITTED",
        disabled: ready === 0,
        run: actions.startRace,
      };
    }
    case "tuning":
      if (room.tuningDeadline - now > 0) return null;
      return { label: "APPLY FIXES & RACE", disabled: false, run: actions.startNextRace };
    case "finished":
      if (sessionOver(room)) return null;
      return { label: "OPEN THE PIT", disabled: false, run: actions.startTuning };
    default:
      return null;
  }
}

function HostKeyMissing() {
  return (
    <main className="simple-page">
      <section className="simple-page__card">
        <h1 className="simple-page__title">Host key missing</h1>
        <p className="simple-page__text">
          This TV page belongs to the browser that opened the room. Open a new room from this device instead.
        </p>
        <StickerButton as="a" className="simple-page__button" href="/">OPEN A NEW ROOM</StickerButton>
      </section>
    </main>
  );
}

export function HostScreen({ roomId }) {
  const hostToken = sessionStorage.getItem(`broken-cars:host:${roomId}`) ?? "";
  const storedJoinUrl = sessionStorage.getItem(`broken-cars:join:${roomId}`);
  const joinUrl = storedJoinUrl ?? `${window.location.origin}/play/${roomId}`;
  const { connection, room, error, clearError, actions } = useGameSocket({
    roomId,
    role: "host",
    hostToken,
  });
  const now = useServerClock(room);
  const history = useRaceHistory(room);

  if (!hostToken) return <HostKeyMissing />;

  const hostAction = hostActionFor(room, now, actions);
  let screen;
  if (!room) {
    screen = <TvLoading />;
  } else {
    switch (room.phase) {
      case "waiting":
        screen = <JoinScreen room={room} roomId={roomId} joinUrl={joinUrl} hostAction={hostAction} />;
        break;
      case "prompting":
      case "tuning":
        screen = <PromptTimeScreen room={room} now={now} hostAction={hostAction} />;
        break;
      case "assigning":
      case "repairing":
        screen = <GridScreen room={room} now={now} />;
        break;
      case "countdown":
      case "racing":
        screen = <RaceScreen room={room} now={now} />;
        break;
      case "finished":
        screen = sessionOver(room)
          ? <FinalScreen room={room} history={history} hostAction={hostAction} />
          : <StandingsScreen room={room} history={history} hostAction={hostAction} />;
        break;
      default:
        screen = <TvLoading label={String(room.phase).toUpperCase()} />;
    }
  }

  return (
    <TvStage>
      {screen}
      <BackgroundMusic racing={room?.phase === "racing" || room?.phase === "finished"} />
      <ErrorBanner message={error} onClose={clearError} />
      <ConnectionBadge connection={connection} />
    </TvStage>
  );
}
