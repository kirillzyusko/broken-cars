// Every car leaves the garage with broken parts. Driving tests that want a
// healthy kart repair it in full first, as players do over the pit stops.
const STOCK_DEFECTS = ["no_brakes", "no_seatbelt", "no_steering"];

export async function startRepairedRace(engine, room, now = 1_002) {
  await engine.startRoom(
    room.id,
    room.hostToken,
    async (racers) => Object.fromEntries(racers.map((player) => [player.id, STOCK_DEFECTS])),
    now,
  );
  for (const player of room.players.values()) {
    player.car.defectIds = [];
    player.car._queuedDefectIds = [];
  }
}
