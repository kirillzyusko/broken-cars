import * as pc from "playcanvas";
import lenses from "../public/maps/corsica-gp/start-lights.json" with { type: "json" };

export function createStartLights(visual) {
  const root = new pc.Entity("Animated start lights");
  visual.addChild(root);
  const materials = Array.from({ length: 3 }, () => {
    const material = new pc.StandardMaterial();
    material.diffuse.set(0.035, 0.015, 0.01);
    material.emissive.set(0, 0, 0);
    material.update();
    return material;
  });
  const sources = new Map();
  for (const render of visual.findComponents("render")) {
    for (const mesh of render.meshInstances) {
      if (mesh.material.name === "Start / signal red") {
        sources.set(render.entity.name, mesh.mesh);
        mesh.visible = false;
      }
    }
  }
  for (const lens of lenses) {
    const mesh = sources.get(lens.source);
    if (!mesh) continue;
    const entity = new pc.Entity(`Start lens row ${lens.row + 1}`);
    root.addChild(entity);
    entity.setLocalPosition(...lens.position);
    entity.setLocalRotation(...lens.rotation);
    entity.setLocalScale(...lens.scale);
    entity.addComponent("render", { meshInstances: [new pc.MeshInstance(mesh, materials[lens.row], entity)], castShadows: false });
  }
  let lastStep, lastPulse;
  return {
    update(signal) {
      if (signal.step === lastStep && signal.pulse === lastPulse) return;
      lastStep = signal.step;
      lastPulse = signal.pulse;
      materials.forEach((material, row) => {
        const on = signal.step === 4 || row < signal.step;
        const green = signal.step === 4;
        const color = green ? [0.05, 1, 0.2] : [1, 0.04, 0.015];
        const strength = on ? 1.8 + signal.pulse * 0.5 : 0;
        material.diffuse.set(...color.map((v) => v * (on ? 0.6 : 0.055)));
        material.emissive.set(...color.map((v) => v * strength));
        material.update();
      });
    },
    destroy() { root.destroy(); materials.forEach((m) => m.destroy()); },
  };
}
