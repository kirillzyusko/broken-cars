import * as pc from "playcanvas";

// A fixed pool avoids allocations and caps simultaneous sparks across all views.
export function createKartImpactEffects(app) {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.emissive.set(1, 0.65, 0.08);
  material.update();
  const pool = Array.from({ length: 48 }, () => {
    const entity = new pc.Entity("Impact spark");
    entity.addComponent("render", { type: "box", material, castShadows: false, receiveShadows: false });
    entity.enabled = false;
    app.root.addChild(entity);
    return { entity, remaining: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  });
  return {
    burst(pose, hit) {
      if (!(hit?.impactSpeed > 1)) return;
      let count = 0;
      for (const spark of pool) {
        if (spark.remaining > 0) continue;
        if (++count > 8) break;
        const angle = count * 2.399;
        spark.x = pose.x - (hit.normal?.x ?? 0) * 0.45;
        spark.y = pose.y + 0.15;
        spark.z = pose.z - (hit.normal?.z ?? 0) * 0.45;
        spark.vx = Math.cos(angle) * 1.4;
        spark.vy = 0.8 + count * 0.12;
        spark.vz = Math.sin(angle) * 1.4;
        spark.remaining = 0.25 + count * 0.02;
        spark.entity.setPosition(spark.x, spark.y, spark.z);
        spark.entity.setLocalScale(0.025, 0.025, 0.08);
        spark.entity.setEulerAngles(count * 37, count * 61, 0);
        spark.entity.enabled = true;
      }
    },
    update(dt) {
      for (const spark of pool) {
        if (spark.remaining <= 0) continue;
        spark.remaining -= dt;
        spark.entity.enabled = spark.remaining > 0;
        spark.vy -= 6 * dt;
        spark.x += spark.vx * dt; spark.y += spark.vy * dt; spark.z += spark.vz * dt;
        spark.entity.setPosition(spark.x, spark.y, spark.z);
        const size = Math.min(1, spark.remaining / 0.1);
        if (size > 0) spark.entity.setLocalScale(0.025 * size, 0.025 * size, 0.08 * size);
      }
    },
    destroy() { for (const spark of pool) spark.entity.destroy(); material.destroy(); },
  };
}
