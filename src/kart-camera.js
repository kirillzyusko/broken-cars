// Chase framing inspired by Nintendo's Mario Kart 8 Deluxe cornering footage:
// https://www.nintendo.com/jp/ichikara/aabpa/02_en.html
// These distances and response rates are tuned for our 1.4 m kart.
const blend = (dt, rate) => 1 - Math.exp(-Math.max(0, dt) * rate);
const mix = (a, b, amount) => a + (b - a) * amount;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const angleDelta = (from, to) => ((to - from + 180) % 360 + 360) % 360 - 180;

export function updateKartCamera(previous, pose, speed, dt, { reset = false, raycast } = {}) {
  const snap = reset || !previous;
  const speedRatio = clamp(Math.abs(speed ?? 0) / 28, 0, 1);
  const pace = snap ? speedRatio : mix(previous.pace, speedRatio, blend(dt, 3));
  let yaw = snap ? pose.yaw : previous.yaw + angleDelta(previous.yaw, pose.yaw) * blend(dt, 14);
  // Keep a short turn delay without swinging beside the kart in a tight corner.
  yaw = pose.yaw - clamp(angleDelta(yaw, pose.yaw), -12, 12);
  const angle = yaw * Math.PI / 180;
  const forward = { x: -Math.sin(angle), z: -Math.cos(angle) };
  const height = snap ? pose.y : mix(previous.height, pose.y, blend(dt, 12));
  const back = 4.2 + pace * 0.45;
  const up = 1.75 + pace * 0.1;
  const ahead = 2.7 + pace * 0.4;
  const target = { x: pose.x + forward.x * ahead, y: height + 0.45, z: pose.z + forward.z * ahead };
  const origin = { x: pose.x, y: pose.y + 0.65, z: pose.z };
  const desired = { x: pose.x - forward.x * back, y: height + up, z: pose.z - forward.z * back };
  const dx = desired.x - origin.x, dy = desired.y - origin.y, dz = desired.z - origin.z;
  const length = Math.hypot(dx, dy, dz);
  let clearance = 1;
  // Probe the lens centre and edges, so a clear centre ray cannot clip a wall.
  for (const side of [0, -0.2, 0.2]) {
    const offset = { x: -forward.z * side, z: forward.x * side };
    const hit = raycast?.(
      { x: origin.x + offset.x, y: origin.y, z: origin.z + offset.z },
      { x: desired.x + offset.x, y: desired.y, z: desired.z + offset.z },
    );
    if (hit) clearance = Math.min(clearance, Math.max(0, hit.hitFraction - 0.2 / length));
  }
  // Move in immediately at a wall, then ease back out once the view clears.
  const boom = snap || clearance < previous.boom ? clearance : mix(previous.boom, clearance, blend(dt, 5));
  const position = { x: origin.x + dx * boom, y: origin.y + dy * boom, z: origin.z + dz * boom };
  return { yaw, pace, height, boom, position, target, fov: 58 + pace * 6 };
}
