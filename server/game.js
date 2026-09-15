import { getSelectorName, selectDefects, selectRepairs } from "./defects.js";
import { GameEngine } from "./game-engine.js";

export class BrokenCarsGame {
  constructor({
    defectSelector = selectDefects,
    repairSelector = selectRepairs,
    selectorName = getSelectorName,
    ...engineOptions
  } = {}) {
    this.engine = new GameEngine(engineOptions);
    this.defectSelector = defectSelector;
    this.repairSelector = repairSelector;
    this.selectorName = selectorName;
  }

  get rooms() {
    return this.engine.rooms;
  }

  createRoom(now) {
    return this.engine.createRoom(now);
  }

  getRoom(roomId) {
    return this.engine.getRoom(roomId);
  }

  requireRoom(roomId) {
    return this.engine.requireRoom(roomId);
  }

  assertHost(room, hostToken) {
    return this.engine.assertHost(room, hostToken);
  }

  joinPlayer(roomId, playerId, now) {
    return this.engine.joinPlayer(roomId, playerId, now);
  }

  disconnectPlayer(roomId, playerId) {
    return this.engine.disconnectPlayer(roomId, playerId);
  }

  startBuild(roomId, hostToken, now) {
    return this.engine.startPrompting(roomId, hostToken, now);
  }

  submitCarPrompt(roomId, playerId, prompt, now) {
    return this.engine.submitPrompt(roomId, playerId, prompt, now);
  }

  startRace(roomId, hostToken, now) {
    return this.engine.startRoom(
      roomId,
      hostToken,
      this.defectSelector,
      now,
    );
  }

  startTuning(roomId, hostToken, now) {
    return this.engine.startTuning(roomId, hostToken, now);
  }

  restartRace(roomId, hostToken, now) {
    return this.engine.restartRace(roomId, hostToken, now);
  }

  submitRepair(roomId, playerId, prompt, now) {
    return this.engine.submitTuningPrompt(roomId, playerId, prompt, now);
  }

  startNextRace(roomId, hostToken, now) {
    return this.engine.startNextRace(
      roomId,
      hostToken,
      this.repairSelector,
      now,
    );
  }

  setControls(roomId, playerId, controls) {
    return this.engine.setControls(roomId, playerId, controls);
  }

  tick(now) {
    return this.engine.tick(now);
  }

  getState(roomOrId, { now, viewerPlayerId = null } = {}) {
    const room = typeof roomOrId === "string"
      ? this.requireRoom(roomOrId)
      : roomOrId;
    return this.engine.serialize(
      room,
      now,
      this.selectorName(),
      viewerPlayerId,
    );
  }

  removeStaleRooms(now) {
    return this.engine.removeStaleRooms(now);
  }
}

export function createGame(options) {
  return new BrokenCarsGame(options);
}
