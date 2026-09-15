import { Mat4, Vec3 } from "playcanvas";

// glTF mesh bounds alone ignore skinning. Measure the exported rest pose in world space.
export function measureKart(document) {
  const nodes = document.getRoot().listNodes();
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const position = new Vec3();
  const transformed = new Vec3();
  const result = new Vec3();
  for (const node of nodes) {
    if (!node.getMesh()) continue;
    const world = new Mat4().set(node.getWorldMatrix());
    const skin = node.getSkin();
    const matrices = skin?.listJoints().map((joint, index) => new Mat4().mul2(
      new Mat4().set(joint.getWorldMatrix()),
      new Mat4().set(skin.getInverseBindMatrices().getElement(index, [])),
    ));
    for (const primitive of node.getMesh().listPrimitives()) {
      const positions = primitive.getAttribute("POSITION");
      const joints = primitive.getAttribute("JOINTS_0");
      const weights = primitive.getAttribute("WEIGHTS_0");
      for (let index = 0; index < positions.getCount(); index++) {
        position.set(...positions.getElement(index, []));
        if (skin) {
          result.set(0, 0, 0);
          const indices = joints.getElement(index, []);
          weights.getElement(index, []).forEach((weight, slot) => {
            if (weight) result.add(matrices[indices[slot]].transformPoint(position, transformed).mulScalar(weight));
          });
        } else {
          world.transformPoint(position, result);
        }
        [result.x, result.y, result.z].forEach((value, axis) => {
          min[axis] = Math.min(min[axis], value);
          max[axis] = Math.max(max[axis], value);
        });
      }
    }
  }
  const frontMounts = ["WheelMount.FL", "WheelMount.FR"].map((name) => {
    const node = nodes.find((entry) => entry.getName() === name);
    if (!node) throw new Error(`Missing kart mount: ${name}`);
    return node.getWorldTranslation();
  });
  return {
    bounds: { min, max },
    frontAxle: frontMounts[0].map((value, axis) => (value + frontMounts[1][axis]) / 2),
  };
}
