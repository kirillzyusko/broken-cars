import * as pc from "playcanvas";

export async function loadRaceSkybox(app, isCancelled) {
  const asset = await new Promise((resolve, reject) => {
    app.assets.loadFromUrl("/skyboxes/skybox-day.png", "texture", (error, loaded) => {
      if (error) reject(new Error(`Could not load the day skybox: ${error}`));
      else resolve(loaded);
    });
  });
  if (isCancelled()) return null;

  // The Kenney image is a 2:1 panorama. Convert it to the six skybox faces.
  asset.resource.projection = pc.TEXTUREPROJECTION_EQUIRECT;
  const cubemap = pc.EnvLighting.generateSkyboxCubemap(asset.resource, 512);
  cubemap.name = "Kenney / day skybox";
  app.scene.skybox = cubemap;
  app.scene.skyboxIntensity = 1;
  return cubemap;
}
