import * as pc from "playcanvas";

// Grade green pixels in the scenery palettes, leaving whites and other colors alone.
const foliageDiffuse = /* glsl */ `
uniform vec3 material_diffuse;
void getAlbedo() {
    dAlbedo = material_diffuse.rgb;
    #ifdef STD_DIFFUSE_TEXTURE
        dAlbedo *= {STD_DIFFUSE_TEXTURE_DECODE}(texture2DBias({STD_DIFFUSE_TEXTURE_NAME}, {STD_DIFFUSE_TEXTURE_UV}, textureBias)).{STD_DIFFUSE_TEXTURE_CHANNEL};
    #endif
    #ifdef STD_DIFFUSE_VERTEX
        dAlbedo *= saturate(vVertexColor.{STD_DIFFUSE_VERTEX_CHANNEL});
    #endif
    float greenMask = smoothstep(0.015, 0.12, dAlbedo.g - max(dAlbedo.r, dAlbedo.b));
    vec3 warmGreen = vec3(dAlbedo.r * 1.14 + dAlbedo.g * 0.035, dAlbedo.g, dAlbedo.b * 0.72);
    dAlbedo = mix(dAlbedo, warmGreen, greenMask);
}
`;

export function warmMapFoliage(visual) {
  const materials = new Set(visual.findComponents("render").flatMap((render) => render.meshInstances.map((mesh) => mesh.material)));
  for (const material of materials) {
    if (!/^(Kenney \/ (platformer|pirate|town|forest) \/ colormap|Meadow \/)/.test(material.name)) continue;
    material.shaderChunksVersion = "2.22";
    material.getShaderChunks(pc.SHADERLANGUAGE_GLSL).set("diffusePS", foliageDiffuse);
    material.update();
  }
}
