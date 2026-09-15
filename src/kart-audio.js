import manifest from "../public/audio/kart/manifest.json" with { type: "json" };

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const smooth = (a, b, dt, rate) => a + (b - a) * (1 - Math.exp(-dt * rate));

// A continuous engine model: engine load raises revs independently of wheel
// speed, while a slower release lets the engine wind down after lifting.
export function engineMix(previous, car, dt) {
  const speed = clamp(Math.abs(car.speed ?? 0) / 28, 0, 1.5);
  const inferredThrottle = previous && car.speed > previous.speed + 0.01 ? 1 : 0;
  const throttle = clamp(car.throttle ?? inferredThrottle, 0, 1);
  const target = clamp(speed * 0.78 + throttle * 0.22, 0, 1);
  const rpm = smooth(previous?.rpm ?? 0, target, dt, target > (previous?.rpm ?? 0) ? 7 : 3);
  const load = smooth(previous?.load ?? 0, throttle, dt, 10);
  const moving = clamp(speed / 0.2 + load * 0.35, 0, 1);
  const high = clamp((rpm - 0.3) / 0.65, 0, 1);
  const audible = !(car.defectIds ?? []).includes("no_engine");
  return { rpm, load, speed: car.speed, braking: !!car.braking,
    idle: audible ? Math.cos(moving * Math.PI / 2) * 0.55 : 0,
    low: audible ? Math.sin(moving * Math.PI / 2) * Math.cos(high * Math.PI / 2) * (0.42 + load * 0.2) : 0,
    high: audible ? Math.sin(moving * Math.PI / 2) * Math.sin(high * Math.PI / 2) * (0.38 + load * 0.25) : 0,
    idleRate: 0.9 + rpm * 0.28, lowRate: 0.65 + rpm * 0.6, highRate: 0.72 + rpm * 0.5,
  };
}

// Each kart owns persistent loops. One-shots get independent sources, and
// voices retire with a fade rather than stealing a source from a playing sound.
export class KartAudioMixer {
  constructor(context, buffers) {
    this.context = context;
    this.buffers = buffers;
    this.voices = new Map();
    this.retiring = new Set();
    this.shots = new Set();
    this.cooldowns = new Map();
    this.master = context.createGain();
    this.master.gain.value = 0;
    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -15;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.008;
    this.compressor.release.value = 0.2;
    this.master.connect(this.compressor).connect(context.destination);
  }

  target(param, value, time = 0.06) {
    // setTargetAtTime starts from the current computed value, avoiding clicks
    // and abrupt jumps when a fresh snapshot arrives during a previous ramp.
    param.setTargetAtTime(value, this.context.currentTime, time);
  }

  voice(id) {
    if (this.voices.has(id)) return this.voices.get(id);
    const bus = this.context.createGain();
    bus.gain.value = 0;
    const pan = this.context.createStereoPanner();
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 5000;
    bus.connect(filter).connect(pan).connect(this.master);
    const layers = {};
    for (const name of ["idle", "low", "high"]) {
      const source = this.context.createBufferSource();
      source.buffer = this.buffers[name];
      source.loop = true;
      const gain = this.context.createGain();
      gain.gain.value = 0;
      source.connect(gain).connect(bus);
      source.start(this.context.currentTime, 0);
      layers[name] = { source, gain };
    }
    const voice = { bus, pan, filter, layers, mix: null, id };
    this.voices.set(id, voice);
    return voice;
  }

  oneShot(name, key, volume = 0.25, pan = 0, cooldown = 0.25) {
    const now = this.context.currentTime;
    if (this.disposed || !this.buffers[name] || this.shots.size >= 16 || (this.cooldowns.get(key) ?? -Infinity) > now) return;
    this.cooldowns.set(key, now + cooldown);
    const source = this.context.createBufferSource();
    source.buffer = this.buffers[name];
    const gain = this.context.createGain();
    const panner = this.context.createStereoPanner();
    gain.gain.value = volume;
    panner.pan.value = pan;
    source.connect(gain).connect(panner).connect(this.master);
    const shot = { source, gain, panner };
    this.shots.add(shot);
    source.onended = () => { source.disconnect(); gain.disconnect(); panner.disconnect(); this.shots.delete(shot); };
    source.start();
  }

  retire(voice) {
    this.voices.delete(voice.id);
    this.retiring.add(voice);
    this.target(voice.bus.gain, 0, 0.04);
    let remaining = 3;
    for (const layer of Object.values(voice.layers)) {
      layer.source.onended = () => {
        layer.source.disconnect(); layer.gain.disconnect();
        if (--remaining === 0) {
          voice.bus.disconnect(); voice.pan.disconnect(); voice.filter.disconnect(); this.retiring.delete(voice);
        }
      };
      layer.source.stop(this.context.currentTime + 0.3);
    }
  }

  update(cars, currentId, camera, dt, active = true) {
    if (this.disposed) return;
    this.target(this.master.gain, active ? 0.6 : 0, 0.12);
    if (!active) { for (const voice of this.voices.values()) this.retire(voice); return; }
    const anchor = cars.find((c) => c.id === currentId) ?? cars[0];
    if (!anchor) { for (const voice of this.voices.values()) this.retire(voice); return; }
    const distanceTo = (c) => Math.hypot(c.position.x - anchor.position.x, c.position.z - anchor.position.z);
    const selected = [...cars].sort((a, b) => distanceTo(a) - distanceTo(b)).filter((c) => distanceTo(c) < 35).slice(0, 5);
    const ids = new Set(selected.map((c) => c.id));
    for (const [id, voice] of this.voices) if (!ids.has(id)) this.retire(voice);
    for (const car of selected) {
      const voice = this.voice(car.id);
      const mix = engineMix(voice.mix, car, Math.min(dt, 0.1));
      const local = car.id === anchor.id;
      const distance = distanceTo(car);
      const volume = local ? 0.8 : 0.22 / (1 + distance * 0.15);
      const angle = (camera.yaw ?? 0) * Math.PI / 180;
      const dx = car.position.x - anchor.position.x, dz = car.position.z - anchor.position.z;
      const pan = local ? 0 : clamp((Math.cos(angle) * dx - Math.sin(angle) * dz) / 12, -0.9, 0.9);
      this.target(voice.bus.gain, volume);
      this.target(voice.pan.pan, pan);
      this.target(voice.filter.frequency, 1800 + mix.load * 3200 + mix.rpm * 1800, 0.1);
      for (const name of ["idle", "low", "high"]) {
        this.target(voice.layers[name].gain.gain, mix[name]);
        this.target(voice.layers[name].source.playbackRate, mix[`${name}Rate`], 0.09);
      }
      if (voice.mix) {
        if (mix.braking && !voice.mix.braking && car.speed > 8 && !(car.defectIds ?? []).includes("no_brakes")) {
          this.oneShot("brake", `${car.id}:brake`, volume * 0.3, pan, 0.8);
        }
        if (voice.mix.load > 0.65 && mix.load < 0.65 && car.speed > 12 && !(car.defectIds ?? []).includes("no_engine")) {
          this.oneShot("lift", `${car.id}:lift`, volume * 0.12, pan, 0.65);
        }
      }
      voice.mix = mix;
    }
    for (const [key, until] of this.cooldowns) if (until < this.context.currentTime - 2) this.cooldowns.delete(key);
  }

  dispose() {
    this.disposed = true;
    for (const voice of [...this.voices.values(), ...this.retiring]) {
      for (const { source, gain } of Object.values(voice.layers)) { source.onended = null; source.stop(); source.disconnect(); gain.disconnect(); }
      voice.bus.disconnect(); voice.pan.disconnect(); voice.filter.disconnect();
    }
    for (const { source, gain, panner } of this.shots) { source.onended = null; source.stop(); source.disconnect(); gain.disconnect(); panner.disconnect(); }
    this.voices.clear(); this.retiring.clear(); this.shots.clear(); this.cooldowns.clear();
    this.master.disconnect(); this.compressor.disconnect();
  }
}

export function createKartAudio() {
  let context, mixer, loading, disposed = false, active = false, muted = false;
  let retryAt = 0;
  const controller = new AbortController();
  const unlock = () => {
    if (disposed || document.hidden || performance.now() < retryAt) return;
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return;
    context ??= new AudioContext({ latencyHint: "interactive" });
    context.resume().catch(() => {});
    loading ??= Promise.all(Object.entries(manifest.samples).map(async ([name, sample]) => {
      const response = await fetch(sample.url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Could not load kart sound: ${name}`);
      return [name, await context.decodeAudioData(await response.arrayBuffer())];
    })).then((entries) => {
      if (!disposed) mixer = new KartAudioMixer(context, Object.fromEntries(entries));
    }).catch((error) => {
      if (!disposed) { console.warn("Kart audio could not load", error); retryAt = performance.now() + 5000; loading = null; }
    });
  };
  const keyDown = (event) => {
    if (/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName) || event.target?.isContentEditable) return;
    unlock();
    if (event.repeat) return;
    if (event.code === "KeyM") muted = !muted;
    if (event.code === "KeyH" && active && !muted) mixer?.oneShot("horn", "local:horn", 0.3, 0, 0.3);
  };
  const visibility = () => { if (document.hidden) context?.suspend().catch(() => {}); };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", keyDown);
  document.addEventListener("visibilitychange", visibility);
  return {
    update(cars, currentId, camera, dt, enabled) {
      active = enabled;
      if (!document.hidden) mixer?.update(cars, currentId, camera, dt, enabled && !muted);
    },
    dispose() {
      disposed = true;
      controller.abort();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", keyDown);
      document.removeEventListener("visibilitychange", visibility);
      mixer?.dispose();
      context?.close().catch(() => {});
    },
  };
}
