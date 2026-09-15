import * as pc from "playcanvas";
import kart from "../public/models/kart/kart.json" with { type: "json" };
import { CAR_SIZE_WORLD, KART_SCALE } from "../shared/race-config.js";

const BASE_URL = "/models/kart/";
const VISUAL_DEFECTS = Object.keys(kart.visualDefects);
const SIDEWAYS = new pc.Quat().setFromEulerAngles(0, 90, 0);
const BACKWARDS = new pc.Quat().setFromEulerAngles(0, 180, 0);
const AXLE = new pc.Vec3(0, 0, 1);

function wheelGeometry(root) {
  return root.findComponents("render").flatMap((render) => render.meshInstances.map((instance) => {
    const positions = [];
    instance.mesh.getPositions(positions);
    return { instance, positions };
  }));
}

function tireBottom(geometry) {
  let bottom = Infinity;
  for (const { instance, positions } of geometry) {
    const m = instance.node.getWorldTransform().data;
    for (let i = 0; i < positions.length; i += 3) {
      bottom = Math.min(bottom, m[1] * positions[i] + m[5] * positions[i + 1] + m[9] * positions[i + 2] + m[13]);
    }
  }
  return bottom;
}

export async function loadKartAssets(app, isCancelled) {
  const load = (file) => new Promise((resolve, reject) => {
    app.assets.loadFromUrl(BASE_URL + file, "container", (error, asset) => {
      if (error) reject(new Error(`Could not load kart asset ${file}: ${error}`));
      else resolve(asset);
    });
  });
  // Settle both requests before scene teardown, including a failed or cancelled load.
  const results = await Promise.allSettled([load(kart.defaultModel), load(kart.wheels.square)]);
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
  if (isCancelled()) return null;
  return { round: results[0].value.resource, squareWheel: results[1].value.resource };
}

function requiredNode(entity, name, needsRender = false) {
  const node = entity.findByName(name);
  if (!node || (needsRender && !node.render)) throw new Error(`Kart asset is missing ${name}`);
  return node;
}

export function createKartVisual(assets) {
  const entity = assets.round.instantiateRenderEntity({ castShadows: true });
  try {
    const engine = requiredNode(entity, kart.parts.engineAssembly, true);
    const steering = requiredNode(entity, kart.parts.steeringWheel, true);
    const engineMount = requiredNode(entity, kart.engineMount);
    const engineRest = engineMount.getLocalRotation().clone();
    const engineBackwards = engineRest.clone().mul(BACKWARDS);
    const wheels = Object.entries(kart.wheels.slots).map(([slot, names]) => {
      const mount = requiredNode(entity, names.mount);
      const round = requiredNode(entity, names.defaultMeshNode, true);
      const square = assets.squareWheel.instantiateRenderEntity({ castShadows: true });
      square.name = `Part.SquareWheel.${slot}`;
      mount.addChild(square);
      square.enabled = false;
      const rest = round.getLocalRotation().clone();
      const axis = round.getWorldTransform().transformVector(AXLE).normalize();
      const half = round.render.meshInstances[0].mesh.aabb.halfExtents;
      return { round, square, rest, sideways: rest.clone().mul(SIDEWAYS), angle: 0,
        direction: -Math.sign(axis.x), radius: Math.max(half.x, half.y) * KART_SCALE,
        halfWidth: half.z * KART_SCALE,
        roundPosition: round.getLocalPosition().clone(), squarePosition: square.getLocalPosition().clone(),
        roundGeometry: wheelGeometry(round), squareGeometry: wheelGeometry(square) };
    });
    const idle = assets.round.animations.find((asset) => asset.resource.name === kart.animation);
    if (!idle) throw new Error("Kart asset is missing its Idle animation");
    entity.addComponent("anim", { activate: true });
    entity.anim.assignAnimation(kart.animation, idle.resource);

    // Put the model's front axle on its parent pivot and its tires on the road.
    // Use exported, skinned bounds rather than the unposed first-frame mesh AABBs.
    entity.setLocalScale(KART_SCALE, KART_SCALE, KART_SCALE);
    entity.setLocalPosition(
      -kart.geometry.frontAxle[0] * KART_SCALE,
      -CAR_SIZE_WORLD.y / 2 - kart.geometry.bounds.min[1] * KART_SCALE,
      -kart.geometry.frontAxle[2] * KART_SCALE,
    );
    const basePosition = entity.getLocalPosition().clone();
    let sidewaysWheels = false;
    const spin = new pc.Quat();
    const rotation = new pc.Quat();

    function placeWheels() {
      for (const wheel of wheels) {
        spin.setFromAxisAngle(AXLE, wheel.angle);
        rotation.copy(sidewaysWheels ? wheel.sideways : wheel.rest).mul(spin);
        wheel.round.setLocalRotation(rotation);
        wheel.square.setLocalRotation(rotation);
      }
    }

    function updateMotion(travel, groundRaycast) {
      entity.setLocalPosition(basePosition);
      for (const wheel of wheels) {
        wheel.round.setLocalPosition(wheel.roundPosition);
        wheel.square.setLocalPosition(wheel.squarePosition);
        if (wheel.round.enabled || wheel.square.enabled) {
          wheel.angle = (wheel.angle + travel / wheel.radius * 180 / Math.PI * wheel.direction) % 360;
        }
      }
      placeWheels();
      if (!groundRaycast) return;
      const contacts = [];
      for (const wheel of wheels) {
        const mesh = wheel.round.enabled ? wheel.round : wheel.square.enabled ? wheel.square : null;
        if (!mesh) continue;
        const bottom = tireBottom(mesh === wheel.round ? wheel.roundGeometry : wheel.squareGeometry);
        const center = mesh.getPosition().clone();
        const axis = wheel.round.getWorldTransform().transformVector(AXLE).normalize();
        let height = -Infinity;
        // Check across the tread so the curb cannot pass through a tire edge.
        for (const side of [-0.8, 0, 0.8]) {
          const point = { x: center.x + axis.x * wheel.halfWidth * side, z: center.z + axis.z * wheel.halfWidth * side };
          const hit = groundRaycast({ ...point, y: bottom + 0.25 }, { ...point, y: bottom - 0.65 });
          if (hit && hit.point.y >= -0.6) height = Math.max(height, hit.point.y);
        }
        if (Number.isFinite(height)) contacts.push({ mesh, center, delta: height - bottom - 0.001 });
      }
      if (!contacts.length) return;
      // Settle the chassis between its tire contacts; suspension takes up the
      // difference at each wheel instead of leaving the downhill tires hanging.
      const bodyOffset = pc.math.clamp(contacts.reduce((sum, c) => sum + c.delta, 0) / contacts.length, -0.2, 0.2);
      entity.setLocalPosition(basePosition.x, basePosition.y + bodyOffset, basePosition.z);
      for (const { mesh, center, delta } of contacts) mesh.setPosition(center.x, center.y + delta, center.z);
    }

    let lastSignature;
    function applyDefects(defectIds = []) {
      const defects = new Set(defectIds);
      const signature = VISUAL_DEFECTS.filter((id) => defects.has(id)).join(",");
      if (signature === lastSignature) return;
      lastSignature = signature;
      engine.render.enabled = !defects.has("no_engine");
      steering.render.enabled = !defects.has("no_steering");
      engineMount.setLocalRotation(defects.has("backwards_engine") ? engineBackwards : engineRest);
      sidewaysWheels = defects.has("sideways_wheels");
      for (const wheel of wheels) {
        const visible = !defects.has("no_wheels");
        const square = defects.has("square_wheels");
        wheel.round.enabled = visible && !square;
        wheel.square.enabled = visible && square;
      }
      placeWheels();
    }
    applyDefects();
    return { entity, applyDefects, updateMotion };
  } catch (error) {
    entity.destroy();
    throw error;
  }
}
