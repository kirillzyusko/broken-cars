export const IDENTITIES = Object.freeze([
  { key: "blue", color: "#2f6df5", onColor: "#ffffff" },
  { key: "yellow", color: "#ffc93c", onColor: "#141210" },
  { key: "red", color: "#e8452f", onColor: "#ffffff" },
  { key: "green", color: "#3c7d33", onColor: "#ffffff" },
]);

export const IDENTITY_BY_KEY = Object.freeze(
  Object.fromEntries(IDENTITIES.map((identity) => [identity.key, identity])),
);

export const EMPTY_IDENTITY = Object.freeze({
  key: "empty",
  color: "#e4e9ed",
  onColor: "#5a6773",
});

const DEFAULT_NAME_PATTERN = /^Driver (\d+)$/u;

export function badgeFor(player, index) {
  const name = (player?.name ?? "").trim();
  const match = DEFAULT_NAME_PATTERN.exec(name);
  if (match) return match[1];
  return name.charAt(0).toUpperCase() || String(index + 1);
}

function takenColors(room, exceptPlayerId = null) {
  return new Set(
    (room?.players ?? [])
      .filter((player) => player.id !== exceptPlayerId && player.color)
      .map((player) => player.color),
  );
}

export function freeIdentities(room, exceptPlayerId = null) {
  const taken = takenColors(room, exceptPlayerId);
  return IDENTITIES.filter((identity) => !taken.has(identity.key));
}

/**
 * Colours are picked on the phone and stored by the server. Anyone without a
 * pick gets the first colour nobody chose, so seats stay distinguishable.
 */
export function decoratePlayers(room) {
  const players = room?.players ?? [];
  const spare = freeIdentities(room);
  let spareIndex = 0;
  return players.map((player, index) => {
    let identity = player.color ? IDENTITY_BY_KEY[player.color] : null;
    if (!identity) {
      const pool = spare.length > 0 ? spare : IDENTITIES;
      identity = pool[spareIndex % pool.length];
      spareIndex += 1;
    }
    return { ...player, index, identity, badge: badgeFor(player, index) };
  });
}

export function findPlayer(room, playerId) {
  return decoratePlayers(room).find((player) => player.id === playerId) ?? null;
}

export function seatStatus(player) {
  if (!player.named) return "NAMING…";
  return player.connected ? "READY" : "RECONNECTING…";
}
