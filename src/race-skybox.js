import * as pc from "playcanvas";

export async function loadRaceSkybox(app, isCancelled) {
  const asset = await new Promise((resolve, reject) => {
    app.assets.loadFromUrl("/skyboxes/tokyo-blur.png", "texture", (error, loaded) => {
      if (error) reject(new Error(`Could not load the Tokyo Blur skybox: ${error}`));
      else resolve(loaded);
    });
  });
  if (isCancelled()) return null;

  // This 4:1 strip covers the upper hemisphere. Pad below its horizon rather
  // than stretching the clouds across a full sphere.
  const source = asset.resource.getSource();
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.width / 2;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare the sky panorama.");
  const horizonY = canvas.height / 2;
  context.drawImage(source, 0, 0, canvas.width, horizonY);
  const pixels = context.getImageData(0, horizonY - 8, canvas.width, 8).data;
  const channels = [0, 0, 0];
  for (let i = 0; i < pixels.length; i += 4) {
    channels[0] += pixels[i];
    channels[1] += pixels[i + 1];
    channels[2] += pixels[i + 2];
  }
  const count = pixels.length / 4;
  const rgb = channels.map((sum) => Math.round(sum / count));
  const horizonColor = `rgb(${rgb.join(",")})`;
  context.fillStyle = horizonColor;
  context.fillRect(0, horizonY, canvas.width, canvas.height - horizonY);
  const fade = context.createLinearGradient(0, horizonY - 24, 0, horizonY);
  fade.addColorStop(0, `rgba(${rgb.join(",")},0)`);
  fade.addColorStop(1, horizonColor);
  context.fillStyle = fade;
  context.fillRect(0, horizonY - 24, canvas.width, 24);

  app.scene.fog.color.set(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
  const panorama = new pc.Texture(app.graphicsDevice, {
    name: "Tokyo Blur / full panorama", projection: pc.TEXTUREPROJECTION_EQUIRECT,
    mipmaps: false, addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
  });
  panorama.setSource(canvas);
  let cubemap;
  try {
    cubemap = pc.EnvLighting.generateSkyboxCubemap(panorama, 512);
  } finally {
    panorama.destroy();
  }
  cubemap.name = "Tokyo Blur / skybox";
  app.scene.skybox = cubemap;
  app.scene.skyboxIntensity = 1;
  return cubemap;
}
