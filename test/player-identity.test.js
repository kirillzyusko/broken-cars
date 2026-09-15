import assert from "node:assert/strict";
import test from "node:test";
import { createPlayerId } from "../src/player-identity.js";

test("player identity uses randomUUID when the browser exposes it", () => {
  const id = createPlayerId({ randomUUID: () => "native-uuid" });
  assert.equal(id, "native-uuid");
});

test("player identity works on insecure LAN origins without randomUUID", () => {
  const cryptoApi = {
    getRandomValues(bytes) {
      bytes.fill(7);
      return bytes;
    },
  };

  const id = createPlayerId(cryptoApi, 1_000);
  assert.match(
    id,
    /^player-rs-07070707-0707-4707-8707-070707070707$/,
  );
});
