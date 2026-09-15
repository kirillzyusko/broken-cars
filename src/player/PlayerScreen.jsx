import { useMemo } from "react";
import { useGameSocket } from "../use-game-socket.js";
import { createPlayerId } from "../player-identity.js";
import { useServerClock } from "../lib/use-now.js";
import { useRaceHistory } from "../lib/use-race-history.js";
import { usePromptHistory } from "../lib/use-prompt-history.js";
import { findPlayer } from "../lib/identity.js";
import { displayRound } from "../lib/format.js";
import { ConnectionBadge, ErrorBanner } from "../components/primitives.jsx";
import { ClaimSeatScreen } from "./ClaimSeatScreen.jsx";
import { WaitingScreen } from "./WaitingScreen.jsx";
import { PromptScreen } from "./PromptScreen.jsx";
import { SentScreen } from "./SentScreen.jsx";
import { DrivingScreen } from "./DrivingScreen.jsx";
import { RoundDoneScreen } from "./RoundDoneScreen.jsx";

function getPlayerId(roomId) {
  const key = `broken-cars:player:${roomId}`;
  let playerId = localStorage.getItem(key);
  if (!playerId) {
    playerId = createPlayerId(window.crypto);
    localStorage.setItem(key, playerId);
  }
  return playerId;
}

function PhoneLoading() {
  return (
    <main className="ph-screen ph-loading">
      <span className="ph-loading__dot" aria-hidden="true" />
      <span className="ph-loading__text">JOINING THE GARAGE…</span>
    </main>
  );
}

export function PlayerScreen({ roomId }) {
  const playerId = useMemo(() => getPlayerId(roomId), [roomId]);
  const { connection, room, error, clearError, actions } = useGameSocket({
    roomId,
    role: "player",
    clientId: playerId,
  });
  const now = useServerClock(room);
  const history = useRaceHistory(room);
  const me = findPlayer(room, playerId);
  const prompts = usePromptHistory({ roomId, playerId, me, room });

  let screen;
  if (!room || !me) {
    screen = <PhoneLoading />;
  } else {
    switch (room.phase) {
      case "waiting":
        screen = me.named
          ? <WaitingScreen room={room} me={me} />
          : <ClaimSeatScreen room={room} roomId={roomId} me={me} onJoin={actions.setProfile} />;
        break;
      case "prompting":
        if (me.hasPrompt) {
          screen = <SentScreen room={room} me={me} now={now} history={prompts.entries} variant="sent" />;
        } else if (room.promptDeadline - now <= 0) {
          screen = <SentScreen room={room} me={me} now={now} history={prompts.entries} variant="missed" />;
        } else {
          screen = (
            <PromptScreen
              room={room}
              me={me}
              now={now}
              mode="build"
              history={[]}
              onSubmit={(text) => actions.submitCarPrompt(text)}
            />
          );
        }
        break;
      case "assigning":
        screen = <SentScreen room={room} me={me} now={now} history={prompts.entries} variant={me.hasPrompt ? "building" : "spectating"} />;
        break;
      case "tuning":
        if (!me.car) {
          screen = <SentScreen room={room} me={me} now={now} history={prompts.entries} variant="spectating" />;
        } else if (me.car.defects.length === 0) {
          screen = <SentScreen room={room} me={me} now={now} history={prompts.entries} variant="tuned" />;
        } else if (me.hasTuningPrompt) {
          screen = <SentScreen room={room} me={me} now={now} history={prompts.entries} variant="fix-sent" />;
        } else if (room.tuningDeadline - now <= 0) {
          screen = <SentScreen room={room} me={me} now={now} history={prompts.entries} variant="missed-fix" />;
        } else {
          screen = (
            <PromptScreen
              key={room.roundNumber}
              room={room}
              me={me}
              now={now}
              mode="fix"
              history={prompts.entries}
              onSubmit={(text) => {
                actions.submitRepair(text);
                prompts.record(displayRound(room), text);
              }}
            />
          );
        }
        break;
      case "repairing":
        screen = <SentScreen room={room} me={me} now={now} history={prompts.entries} variant={me.car ? "repairing" : "spectating"} />;
        break;
      case "countdown":
      case "racing":
        screen = me.car
          ? <DrivingScreen key={room.roundNumber} room={room} me={me} now={now} actions={actions} />
          : <SentScreen room={room} me={me} now={now} history={prompts.entries} variant="spectating" />;
        break;
      case "finished":
        screen = <RoundDoneScreen room={room} me={me} history={history} />;
        break;
      default:
        screen = <PhoneLoading />;
    }
  }

  return (
    <>
      {screen}
      <ErrorBanner message={error} onClose={clearError} />
      <ConnectionBadge connection={connection} />
    </>
  );
}
