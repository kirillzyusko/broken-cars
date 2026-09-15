import * as pc from "playcanvas";

const TAU = Math.PI * 2;
const fract = (n) => n - Math.floor(n);
const smoothstep = (a, b, n) => {
  const t = Math.max(0, Math.min(1, (n - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (x, y, seed) => fract(Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453);

function texture(device, name, size, pixel) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const values = pixel(x / size, y / size);
      const offset = (y * size + x) * 4;
      data[offset] = Math.round(values[0] * 255);
      data[offset + 1] = Math.round(values[1] * 255);
      data[offset + 2] = Math.round((values[2] ?? 0) * 255);
      data[offset + 3] = 255;
    }
  }
  return new pc.Texture(device, {
    name, width: size, height: size, format: pc.PIXELFORMAT_RGBA8,
    levels: [data], mipmaps: true,
    addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_REPEAT,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR,
  });
}

export function createWaterTextures(device) {
  // Periodic warped cells create an original, seamless caustic pattern.
  const pattern = texture(device, "Water / curved highlights", 256, (u, v) => {
    const x = u * 6 + Math.sin(v * TAU * 2) * 0.32;
    const y = v * 6 + Math.cos(u * TAU * 2) * 0.32;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let first = Infinity;
    let second = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = ix + dx;
        const gy = iy + dy;
        const hx = ((gx % 6) + 6) % 6;
        const hy = ((gy % 6) + 6) % 6;
        const px = gx + 0.15 + hash(hx, hy, 2) * 0.7;
        const py = gy + 0.15 + hash(hx, hy, 17) * 0.7;
        const d = Math.hypot(x - px, y - py);
        if (d < first) { second = first; first = d; }
        else if (d < second) second = d;
      }
    }
    return [1 - smoothstep(0.025, 0.15, second - first), smoothstep(0.1, 0.85, first)];
  });
  const flow = texture(device, "Water / seamless flow field", 128, (u, v) => {
    const a = Math.sin(TAU * (u + v)) * 0.22 + Math.cos(TAU * (u * 2 - v)) * 0.14 + Math.sin(TAU * (u + v * 4)) * 0.07;
    const b = Math.cos(TAU * (u - v)) * 0.22 + Math.sin(TAU * (u + v * 2)) * 0.14 + Math.cos(TAU * (u * 4 - v)) * 0.07;
    return [0.5 + a, 0.5 + b];
  });
  return { pattern, flow };
}
