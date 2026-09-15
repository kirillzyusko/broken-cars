import { readFile } from "node:fs/promises";
import * as pc from "playcanvas";
import { GlbParser } from "../../node_modules/playcanvas/build/playcanvas/src/framework/parsers/glb-parser.js";
import { GlbContainerResource } from "../../node_modules/playcanvas/build/playcanvas/src/framework/parsers/glb-container-resource.js";

export function createKartTestApp() {
  const canvas = { id: "kart-test", width: 1, height: 1, addEventListener() {}, removeEventListener() {} };
  const app = new pc.AppBase(canvas);
  app.init({
    graphicsDevice: new pc.NullGraphicsDevice(canvas),
    componentSystems: [pc.RenderComponentSystem, pc.AnimComponentSystem, pc.CollisionComponentSystem, pc.RigidBodyComponentSystem],
    resourceHandlers: [],
  });
  return app;
}

export async function readKartContainer(app, file) {
  const bytes = await readFile(new URL(`../../public/models/kart/${file}`, import.meta.url));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const data = await new Promise((resolve, reject) => {
    GlbParser.parse(file, "", buffer, app.graphicsDevice, app.assets, {
      image: {
        // Exercise the real mesh, skin and animation parser without a GPU or image decoder.
        processAsync(image, done) {
          const asset = new pc.Asset(image.name, "texture");
          asset.resource = new pc.Texture(app.graphicsDevice, { width: 512, height: 512 });
          asset.loaded = true;
          app.assets.add(asset);
          done(null, asset);
        },
      },
    }, (error, result) => error ? reject(error) : resolve(result));
  });
  return new GlbContainerResource(data, new pc.Asset(file, "container"), app.assets, new pc.StandardMaterial());
}
