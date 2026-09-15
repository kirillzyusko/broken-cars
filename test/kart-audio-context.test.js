import assert from "node:assert/strict";
import test from "node:test";
import { kartAudioContext, unlockKartAudio } from "../src/kart-audio-context.js";

test("a host gesture unlocks the context reused by later race screens", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  let created = 0, resumed = 0;
  class Context {
    constructor() { created++; this.state = "suspended"; }
    resume() { resumed++; this.state = "running"; return Promise.resolve(); }
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: { AudioContext: Context } });
  try {
    const lobby = unlockKartAudio();
    assert.equal(lobby.state, "running");
    assert.equal(kartAudioContext(), lobby);
    assert.equal(unlockKartAudio(), lobby);
    assert.equal(created, 1);
    assert.equal(resumed, 1);
    lobby.state = "suspended";
    unlockKartAudio();
    assert.equal(resumed, 2, "returning to a hidden tab resumes audio");
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else delete globalThis.window;
  }
});
