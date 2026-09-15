import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import manifest from "../public/audio/kart/manifest.json" with { type: "json" };
import { engineMix, KartAudioMixer } from "../src/kart-audio.js";

class Param {
  value = 0;
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  setTargetAtTime(value, now, time) { assert.ok(Number.isFinite(value)); assert.ok(time > 0); this.value = value; }
}
class Node {
  gain = new Param(); pan = new Param(); frequency = new Param(); playbackRate = new Param();
  threshold = new Param(); knee = new Param(); ratio = new Param(); attack = new Param(); release = new Param();
  connect() { return this; }
  disconnect() { this.disconnected = true; }
  start() { this.starts = (this.starts ?? 0) + 1; }
  stop() { this.stops = (this.stops ?? 0) + 1; }
}
function setup() {
  const sources = [];
  const oscillators = [];
  const context = { currentTime: 0, destination: new Node(),
    createGain: () => new Node(), createStereoPanner: () => new Node(),
    createBiquadFilter: () => new Node(), createDynamicsCompressor: () => new Node(),
    createBufferSource: () => { const source = new Node(); sources.push(source); return source; },
    createOscillator: () => { const source = new Node(); oscillators.push(source); return source; },
  };
  const buffers = Object.fromEntries(Object.keys(manifest.samples).map((name) => [name, { duration: 2 }]));
  return { context, sources, oscillators, mixer: new KartAudioMixer(context, buffers) };
}
const car = { id: "driver", speed: 0, throttle: 0, position: { x: 0, z: 0 }, defectIds: [] };

test("countdown beeps and GO overlap engine audio and release their own nodes", () => {
  const { mixer, sources, oscillators } = setup();
  mixer.update([car], car.id, {}, 1 / 60);
  mixer.countdown(false);
  mixer.countdown(true);
  assert.equal(mixer.shots.size, 2);
  assert.ok(sources.every((s) => s.starts === 1 && !s.stops));
  assert.equal(oscillators[0].frequency.value, 440);
  assert.equal(oscillators[1].frequency.value, 880);
  oscillators[0].onended();
  assert.equal(mixer.shots.size, 1);
  assert.ok(oscillators[0].disconnected);
  mixer.dispose();
  assert.ok(oscillators.every((o) => o.disconnected));
});

test("engine revs rise under load, coast down smoothly, and respect a missing engine", () => {
  let mix = engineMix(null, car, 1 / 60);
  assert.ok(mix.idle > 0 && mix.high === 0);
  for (let i = 0; i < 120; i++) mix = engineMix(mix, { ...car, speed: 28, throttle: 1 }, 1 / 60);
  assert.ok(mix.high > mix.low && mix.rpm > 0.9);
  const lift = engineMix(mix, { ...car, speed: 15, throttle: 0 }, 1 / 60);
  assert.ok(lift.rpm < mix.rpm && lift.rpm > 0.8);
  const missing = engineMix(lift, { ...car, defectIds: ["no_engine"] }, 1 / 60);
  assert.equal(missing.idle + missing.low + missing.high, 0);
});

test("hundreds of speed changes reuse three continuous sources without restarting them", () => {
  const { mixer, sources, context } = setup();
  for (let i = 0; i < 300; i++) {
    context.currentTime = i / 60;
    mixer.update([{ ...car, speed: i % 28, throttle: 1 }], car.id, {}, 1 / 60);
  }
  assert.equal(sources.length, 3);
  assert.ok(sources.every((s) => s.loop && s.starts === 1 && !s.stops));
});

test("brake and horn voices overlap naturally without stopping engine or other effects", () => {
  const { mixer, sources } = setup();
  mixer.update([{ ...car, speed: 20 }], car.id, {}, 1 / 60);
  mixer.update([{ ...car, speed: 19, braking: true }], car.id, {}, 1 / 60);
  mixer.oneShot("horn", "horn");
  assert.equal(mixer.shots.size, 2);
  assert.ok(sources.every((s) => !s.stops));
  for (let i = 0; i < 20; i++) mixer.update([{ ...car, speed: 18, braking: true }], car.id, {}, 1 / 60);
  assert.equal(mixer.shots.size, 2, "holding a brake must not retrigger every frame");
  sources[3].onended();
  assert.equal(mixer.shots.size, 1);
  assert.ok(sources[3].disconnected);
});

test("voice cap drops excess effects instead of cutting off those already playing", () => {
  const { mixer, sources } = setup();
  for (let i = 0; i < 30; i++) mixer.oneShot("horn", `horn${i}`);
  assert.equal(mixer.shots.size, 16);
  assert.ok(sources.every((s) => !s.stops));
});

test("nearby cars pan and fade out; disposal releases playing and retiring voices", () => {
  const { mixer, sources } = setup();
  mixer.update([car, { ...car, id: "rival", position: { x: 10, z: 0 } }], car.id, { yaw: 0 }, 1 / 60);
  assert.ok(mixer.voices.get("rival").pan.pan.value > 0);
  assert.ok(mixer.voices.get("rival").bus.gain.value < mixer.voices.get(car.id).bus.gain.value);
  mixer.update([car], car.id, {}, 1 / 60);
  assert.equal(mixer.retiring.size, 1);
  mixer.oneShot("horn", "horn");
  mixer.dispose();
  assert.ok(sources.every((s) => s.stops && s.disconnected));
  assert.equal(mixer.shots.size + mixer.voices.size + mixer.retiring.size, 0);
});

test("imported WAVs have valid durations and continuous loop boundaries", () => {
  for (const sample of Object.values(manifest.samples)) {
    const wav = readFileSync(new URL(`../public${sample.url}`, import.meta.url));
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    const rate = wav.readUInt32LE(24);
    assert.ok(Math.abs((wav.length - 44) / 2 / rate - sample.duration) < 1e-6);
    if (sample.loop) assert.ok(Math.abs(wav.readInt16LE(44) - wav.readInt16LE(wav.length - 2)) < 3500);
  }
});
