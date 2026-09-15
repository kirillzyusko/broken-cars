import * as pc from "playcanvas";
import { FAULT_ICONS, faultIcon, thoughtBubbleSvg } from "./kart-fault-icons.js";
import { thoughtBubbleFrame } from "./kart-thought-bubble-model.js";

// The shader faces each camera independently, including all split-screen feeds.
// Depth testing keeps the cloud in the world, behind scenery that obscures the kart.
const shader = {
  uniqueName: "Kart thought bubble",
  attributes: { aPosition: pc.SEMANTIC_POSITION, aUv: pc.SEMANTIC_TEXCOORD0 },
  vertexGLSL: `
    attribute vec3 aPosition;
    attribute vec2 aUv;
    uniform mat4 matrix_model;
    uniform mat4 matrix_viewProjection;
    uniform mat4 matrix_viewInverse;
    uniform vec2 bubbleSize;
    varying vec2 uv;
    void main(void) {
      vec3 world = matrix_model[3].xyz
        + matrix_viewInverse[0].xyz * aPosition.x * bubbleSize.x
        + matrix_viewInverse[1].xyz * aPosition.y * bubbleSize.y;
      gl_Position = matrix_viewProjection * vec4(world, 1.0);
      uv = aUv;
    }
  `,
  fragmentGLSL: `
    uniform sampler2D bubbleTexture;
    uniform float bubbleOpacity;
    varying vec2 uv;
    void main(void) {
      vec4 color = texture2D(bubbleTexture, uv);
      color.a *= bubbleOpacity;
      if (color.a < 0.01) discard;
      gl_FragColor = vec4(pow(color.rgb, vec3(2.2)), color.a);
    }
  `,
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load kart artwork: ${src.slice(0, 100)}`));
    image.src = src;
  });
}

function loadPage(device, ids, car, entry) {
  const artwork = thoughtBubbleSvg(ids);
  const page = { texture: null, aspect: artwork.width / artwork.height };
  const sources = [
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artwork.svg)}`,
    ...ids.map((id) => faultIcon(id, car).src),
  ];
  Promise.all(sources.map(loadImage)).then(([cloud, ...icons]) => {
    if (entry.disposed) return;
    const canvas = document.createElement("canvas");
    canvas.width = artwork.width * 2;
    canvas.height = artwork.height * 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create kart artwork canvas");
    context.drawImage(cloud, 0, 0, canvas.width, canvas.height);
    icons.forEach((image, index) => {
      context.drawImage(image, (24 + index * 144) * 2, 30 * 2, 144 * 2, 144 * 2);
    });
    const texture = new pc.Texture(device, {
      name: `Kart faults / ${ids.join(", ")}`,
      flipY: true,
      mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    });
    texture.setSource(canvas);
    page.texture = texture;
  }).catch((error) => {
    if (!entry.disposed) console.warn("Could not load kart fault icons", ids, error);
  });
  return page;
}

function destroyEntry(entry) {
  entry.disposed = true;
  entry.entity.destroy();
  entry.material.destroy();
  for (const page of entry.pages) page.texture?.destroy();
}

export function createKartThoughtBubbles(app) {
  const mesh = new pc.Mesh(app.graphicsDevice);
  mesh.setPositions([-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0]);
  mesh.setUvs(0, [0, 0, 1, 0, 1, 1, 0, 1]);
  mesh.setIndices([0, 1, 2, 0, 2, 3]);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  // Keep the shared quad alive when the last faulty kart is repaired or removed.
  mesh.incRefCount();
  const entries = new Map();

  return {
    sync(carStates) {
      for (const [id, entry] of entries) {
        if (!carStates.has(id)) { destroyEntry(entry); entries.delete(id); }
      }
      for (const [id, state] of carStates) {
        const car = state.car;
        const ids = [...new Set(car.defectIds ?? [])].filter((key) => Object.hasOwn(FAULT_ICONS, key));
        const signature = JSON.stringify([ids, car.oneWayTurn, car.enginePowerIssue]);
        const previous = entries.get(id);
        if (previous?.signature === signature) continue;
        if (previous) { destroyEntry(previous); entries.delete(id); }
        if (!ids.length) continue;
        const entity = new pc.Entity(`Thought bubble / ${car.name}`);
        const material = new pc.ShaderMaterial(shader);
        material.blendType = pc.BLEND_NORMAL;
        material.depthWrite = false;
        material.cull = pc.CULLFACE_NONE;
        material.update();
        const instance = new pc.MeshInstance(mesh, material);
        // The shader rotates the quad beyond its flat CPU bounds.
        instance.cull = false;
        entity.addComponent("render", { meshInstances: [instance], castShadows: false, receiveShadows: false });
        entity.enabled = false;
        app.root.addChild(entity);
        const entry = { entity, material, state, signature, ids, pages: [], size: new Float32Array(2), disposed: false };
        for (let offset = 0; offset < ids.length; offset += 3) {
          entry.pages.push(loadPage(app.graphicsDevice, ids.slice(offset, offset + 3), car, entry));
        }
        entries.set(id, entry);
      }
    },
    update(elapsedMs, reducedMotion) {
      for (const entry of entries.values()) {
        const frame = thoughtBubbleFrame(entry.state.car, elapsedMs, reducedMotion);
        const page = frame ? entry.pages[Math.floor(entry.ids.indexOf(frame.ids[0]) / 3)] : null;
        entry.entity.enabled = Boolean(page?.texture && frame.opacity > 0);
        if (!entry.entity.enabled) continue;
        const pose = entry.state.pose ?? entry.state.car.position;
        // Fixed world size follows the kart and shrinks naturally with distance.
        const width = 0.78 * frame.ids.length + 0.28;
        const height = width / page.aspect;
        entry.entity.setPosition(pose.x, pose.y + 0.55 + height / 2, pose.z);
        entry.size[0] = width * frame.scale;
        entry.size[1] = height * frame.scale;
        entry.material.setParameter("bubbleSize", entry.size);
        entry.material.setParameter("bubbleOpacity", frame.opacity);
        entry.material.setParameter("bubbleTexture", page.texture);
      }
    },
    destroy() {
      for (const entry of entries.values()) destroyEntry(entry);
      entries.clear();
      mesh.decRefCount();
      mesh.destroy();
    },
  };
}
