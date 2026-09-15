import * as pc from "playcanvas";
import kart from "../public/models/kart/kart.json" with { type: "json" };
import { CAR_SIZE_WORLD, KART_SCALE } from "../shared/race-config.js";

const BASE_URL = "/models/kart/";
const VISUAL_DEFECTS = Object.keys(kart.visualDefects);
const SIDEWAYS = new pc.Quat().setFromEulerAngles(0, 90, 0);
const BACKWARDS = new pc.Quat().setFromEulerAngles(0, 180, 0);

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
      return { round, square, rest, sideways: rest.clone().mul(SIDEWAYS) };
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

    let lastSignature;
    function applyDefects(defectIds = []) {
      const defects = new Set(defectIds);
      const signature = VISUAL_DEFECTS.filter((id) => defects.has(id)).join(",");
      if (signature === lastSignature) return;
      lastSignature = signature;
      engine.render.enabled = !defects.has("no_engine");
      steering.render.enabled = !defects.has("no_steering");
      engineMount.setLocalRotation(defects.has("backwards_engine") ? engineBackwards : engineRest);
      for (const wheel of wheels) {
        const visible = !defects.has("no_wheels");
        const square = defects.has("square_wheels");
        wheel.round.enabled = visible && !square;
        wheel.square.enabled = visible && square;
        const rotation = defects.has("sideways_wheels") ? wheel.sideways : wheel.rest;
        wheel.round.setLocalRotation(rotation);
        wheel.square.setLocalRotation(rotation);
      }
    }
    applyDefects();
    return { entity, applyDefects };
  } catch (error) {
    entity.destroy();
    throw error;
  }
}
