"""Run with Blender --background --factory-startup --python scripts/prepare-kart.py."""

import json
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector


PROJECT = Path(__file__).resolve().parents[1]
ART = PROJECT.parent / "art" / "kart"
SOURCE = ART / "source"
OUTPUT = PROJECT / "public" / "models" / "kart"
ENGINE_BONES = {"Engine", "BeltTop", "BeltBot", "Exhaust.L", "Exhaust.R"}
WHEELS = {"FL": "FWheel.L", "FR": "FWheel.R", "RL": "RWheel.L", "RR": "RWheel.R"}


def active_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def descendants(obj):
    return [obj] + [child for item in obj.children for child in descendants(item)]


def world_vertices(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    result = [evaluated.matrix_world @ v.co for v in mesh.vertices]
    evaluated.to_mesh_clear()
    return result


def make_material():
    material = bpy.data.materials.new("Kart.Atlas")
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    color = nodes.new("ShaderNodeTexImage")
    color.image = bpy.data.images.load(str(SOURCE / "Texture" / "Kart_BaseColor.png"), check_existing=True)
    color.image.colorspace_settings.name = "sRGB"
    links.new(color.outputs["Color"], shader.inputs["Base Color"])
    orm = nodes.new("ShaderNodeTexImage")
    orm.image = bpy.data.images.load(str(SOURCE / "Texture" / "Kart_ORM.png"), check_existing=True)
    orm.image.colorspace_settings.name = "Non-Color"
    separate = nodes.new("ShaderNodeSeparateColor")
    links.new(orm.outputs["Color"], separate.inputs["Color"])
    links.new(separate.outputs["Green"], shader.inputs["Roughness"])
    links.new(separate.outputs["Blue"], shader.inputs["Metallic"])
    group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    group.nodes.new("NodeGroupInput")
    occlusion = nodes.new("ShaderNodeGroup")
    occlusion.node_tree = group
    links.new(separate.outputs["Red"], occlusion.inputs["Occlusion"])
    for image in (color.image, orm.image):
        image.pack()
    color.location = (-650, 180)
    orm.location = (-650, -150)
    separate.location = (-400, -150)
    occlusion.location = (-150, -250)
    shader.location = (-100, 150)
    output.location = (230, 150)
    return material


def split_part(source, name, keep, material):
    obj = source.copy()
    obj.data = source.data.copy()
    bpy.context.collection.objects.link(obj)
    obj.name = name
    obj.data.name = name + ".Mesh"
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    original = bm.verts.layers.int["source_vertex"]
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v[original] not in keep], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.materials.clear()
    obj.data.materials.append(material)
    return obj


def rounded_square_radius(dx, dz, half_extent, corner):
    x, z = abs(dx), abs(dz)
    straight = half_extent / max(x, z)
    if min(x, z) * straight <= half_extent - corner:
        return straight
    center = half_extent - corner
    projection = center * (x + z)
    discriminant = projection * projection - (2 * center * center - corner * corner)
    return projection + math.sqrt(max(0, discriminant))


def square_tire(round_mesh):
    mesh = round_mesh.copy()
    mesh.name = "Wheel.Square.Mesh"
    bm = bmesh.new()
    bm.from_mesh(mesh)
    radius_layer = bm.verts.layers.float.new("original_radius")
    for vertex in bm.verts:
        vertex[radius_layer] = math.hypot(vertex.co.x, vertex.co.z)
    # Add samples around each ring. Leave the axle profile and hub topology intact.
    ring_edges = [e for e in bm.edges if
                  abs(e.verts[0][radius_layer] - e.verts[1][radius_layer]) < 0.00001
                  and abs(e.verts[0].co.y - e.verts[1].co.y) < 0.00001]
    bmesh.ops.subdivide_edges(bm, edges=ring_edges, cuts=7, use_grid_fill=True)
    for vertex in bm.verts:
        radius = vertex[radius_layer]
        direction_length = math.hypot(vertex.co.x, vertex.co.z)
        if direction_length < 0.000001 or radius < 0.000001:
            continue
        dx, dz = vertex.co.x / direction_length, vertex.co.z / direction_length
        # Keep the metal hub circular, blend across the sidewall into the square tread.
        blend = max(0, min(1, (radius - 0.13) / (0.227 - 0.13)))
        blend = blend * blend * (3 - 2 * blend)
        square_radius = rounded_square_radius(dx, dz, radius, radius * 0.105)
        new_radius = radius + blend * (square_radius - radius)
        vertex.co.x, vertex.co.z = dx * new_radius, dz * new_radius
    bm.verts.layers.float.remove(radius_layer)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    mesh.normals_split_custom_set([(0.0, 0.0, 0.0)] * len(mesh.loops))
    return mesh


def export_glb(path, objects, animations):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_animations=animations, export_animation_mode="ACTIONS",
        export_frame_range=True, export_force_sampling=True,
        export_def_bones=False, export_leaf_bone=False,
        export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=False,
        export_optimize_animation_keep_anim_object=False,
        export_extras=True, export_yup=True, export_skins=True,
        export_morph=False, export_cameras=False, export_lights=False,
    )


def main():
    ART.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    bpy.ops.import_scene.fbx(filepath=str(SOURCE / "Kart_Prototype_Rigged.fbx"))
    source = next(o for o in scene.objects if o.type == "MESH")
    rig = next(o for o in scene.objects if o.type == "ARMATURE")
    rig.name = "Kart.Rig"
    action = rig.animation_data.action
    action.name = "Idle"
    scene.frame_start, scene.frame_end = 1, 30
    frames = list(range(1, 31))
    reference = {}
    for frame in frames:
        scene.frame_set(frame)
        reference[frame] = world_vertices(source)
    scene.frame_set(1)
    # Normalize the FBX armature from centimeters to meters, including the existing
    # location keys. Keeping 100x child scales breaks bone attachments on re-import.
    unit_scale = rig.scale.x
    assert max(abs(s - unit_scale) for s in rig.scale) < 0.000001
    active_only(rig)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for layer in action.layers:
        for strip in layer.strips:
            for slot in action.slots:
                bag = strip.channelbag(slot)
                if bag:
                    for curve in bag.fcurves:
                        factor = None
                        if curve.data_path.startswith('pose.bones[') and curve.data_path.endswith('.location'):
                            factor = unit_scale
                        elif curve.data_path == 'scale':
                            factor = 1 / unit_scale
                        if factor is not None:
                            for key in curve.keyframe_points:
                                key.co.y *= factor
                                key.handle_left.y *= factor
                                key.handle_right.y *= factor
    scene.frame_set(1)
    source_uvs = len(source.data.uv_layers.active.data)
    source_polygons = len(source.data.polygons)
    attribute = source.data.attributes.new("source_vertex", "INT", "POINT")
    for i, value in enumerate(attribute.data):
        value.value = i
    members = {"Part.Chassis": set(), "Part.EngineAssembly": set(), "Part.SteeringWheel": set()}
    for vertex in source.data.vertices:
        names = {source.vertex_groups[g.group].name for g in vertex.groups if g.weight > 0.0001}
        if names <= ENGINE_BONES:
            members["Part.EngineAssembly"].add(vertex.index)
        elif names == {"SteeringWheel"}:
            members["Part.SteeringWheel"].add(vertex.index)
        else:
            members["Part.Chassis"].add(vertex.index)
    # Reject splits that cut a face, including faces shared by exhaust and engine bones.
    owners = {index: name for name, indices in members.items() for index in indices}
    assert all(len({owners[i] for i in p.vertices}) == 1 for p in source.data.polygons)
    material = make_material()
    parts = [split_part(source, name, indices, material) for name, indices in members.items()]
    bpy.data.objects.remove(source, do_unlink=True)

    # A fixed mount above the animated engine branch permits a backwards installation.
    active_only(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    engine = rig.data.edit_bones["Engine"]
    mount = rig.data.edit_bones.new("EngineMount")
    mount.head, mount.tail = engine.head.copy(), engine.tail.copy()
    mount.roll = engine.roll
    mount.parent = engine.parent
    mount.use_deform = False
    engine.parent = mount
    bpy.ops.object.mode_set(mode="OBJECT")

    errors = []
    for frame in frames:
        scene.frame_set(frame)
        for part in parts:
            coordinates = world_vertices(part)
            indices = part.data.attributes["source_vertex"].data
            errors.extend((position - reference[frame][indices[i].value]).length
                          for i, position in enumerate(coordinates))
    max_error = max(errors)
    assert max_error < 0.00002, f"The split changed the supplied animation: {max_error} m"
    assert sum(len(p.data.polygons) for p in parts) == source_polygons
    assert sum(len(p.data.uv_layers.active.data) for p in parts) == source_uvs
    for part in parts:
        part.data.attributes.remove(part.data.attributes["source_vertex"])
        part["part"] = part.name.removeprefix("Part.")

    scene.frame_set(1)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(SOURCE / "Standard_Tire.fbx"))
    tire = next(o for o in bpy.data.objects if o not in before and o.type == "MESH")
    tire.data.transform(tire.matrix_world)
    tire.matrix_world = Matrix.Identity(4)
    # Preserve the original inboard mounting face; center the axle vertically.
    z_center = (max(v.co.z for v in tire.data.vertices) + min(v.co.z for v in tire.data.vertices)) / 2
    for vertex in tire.data.vertices:
        vertex.co.z -= z_center
    tire.data.name = "Wheel.Round.Mesh"
    tire.data.materials.clear()
    tire.data.materials.append(material)
    round_mesh = tire.data
    square_mesh = square_tire(round_mesh)
    # The source already has rounded shoulders across the tire width. The new profile
    # adds a 25.8 mm corner radius in the square silhouette without beveling the hub.
    for mesh in (round_mesh, square_mesh):
        mesh.asset_mark()
        mesh.use_fake_user = True

    wheels = []
    mounts = []
    for slot, bone_name in WHEELS.items():
        bone = rig.pose.bones[bone_name]
        socket = bpy.data.objects.new("WheelMount." + slot, None)
        scene.collection.objects.link(socket)
        socket.empty_display_type = "ARROWS"
        socket.empty_display_size = 0.13
        socket.parent = rig
        socket.parent_type = "BONE"
        socket.parent_bone = bone_name
        # Blender bone children start at the tail. Cancel that offset so every wheel
        # shares a mount at the bone head, with both rig and meshes in meters.
        socket.matrix_parent_inverse = Matrix.Translation((0, -bone.length, 0))
        socket.matrix_basis = Matrix.Identity(4)
        socket["slot"] = slot
        socket["axle_axis_blender"] = "+Y"
        wheel = bpy.data.objects.new("Part.Wheel." + slot, round_mesh)
        scene.collection.objects.link(wheel)
        wheel.parent = socket
        wheels.append(wheel)
        mounts.append(socket)
    bpy.data.objects.remove(tire, do_unlink=True)
    bpy.context.view_layer.update()
    mount_errors = {slot: (socket.matrix_world.translation - rig.matrix_world @ rig.pose.bones[bone].head).length
                    for (slot, bone), socket in zip(WHEELS.items(), mounts)}
    assert max(mount_errors.values()) < 0.00002, mount_errors

    root = bpy.data.objects.new("Kart", None)
    scene.collection.objects.link(root)
    rig.parent = root
    # Source forward is +X, Blender forward becomes +Y, GLB forward becomes -Z.
    root.rotation_euler.z = math.pi / 2
    root["forward_gltf"] = "-Z"
    root["animation"] = "Original Idle only; no wheel spin or steering animation"
    scene.frame_set(1)
    rig.show_in_front = True
    rig.data.display_type = "STICK"
    rig.hide_set(True)

    library = bpy.data.collections.new("Wheel library")
    scene.collection.children.link(library)
    library_objects = []
    for variant, mesh in (("Round", round_mesh), ("Square", square_mesh)):
        obj = bpy.data.objects.new("Wheel." + variant + ".Source", mesh)
        library.objects.link(obj)
        obj["mount"] = "Origin is the inboard axle mount; Blender +Y points outwards"
        library_objects.append(obj)
        export_glb(OUTPUT / ("wheel-" + variant.lower() + ".glb"), [obj], False)
        obj.hide_render = True
        obj.hide_set(True)

    kart_objects = descendants(root)
    export_glb(OUTPUT / "kart-round.glb", kart_objects, True)
    for wheel in wheels:
        wheel.data = square_mesh
    export_glb(OUTPUT / "kart-square.glb", kart_objects, True)
    for wheel in wheels:
        wheel.data = round_mesh
    for obj in library_objects:
        obj.hide_set(True)
    rig.hide_set(True)
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.shading.type = "MATERIAL"
                area.spaces.active.region_3d.view_distance = 4.0
                area.spaces.active.region_3d.view_location = (0, 0, 0.35)
    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(ART / "kart-modular.blend"))
    report = {
        "source_vertices": sum(len(indices) for indices in members.values()),
        "parts": {p.name: len(p.data.vertices) for p in parts},
        "source_faces": source_polygons,
        "split_faces": sum(len(p.data.polygons) for p in parts),
        "animation_frames_compared": len(frames),
        "max_animation_vertex_error_m": max_error,
        "wheel_mount_errors_m": mount_errors,
        "round_wheel_vertices": len(round_mesh.vertices),
        "square_wheel_vertices": len(square_mesh.vertices),
        "square_corner_radius_m": 0.2454829 * 0.105,
        "new_animation_keyframes": 0,
    }
    (ART / "preparation-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
