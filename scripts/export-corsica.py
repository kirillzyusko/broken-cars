"""Run in Blender background. Export the authored map without changing its .blend file."""
import bpy,math,pathlib,json,collections
from mathutils import Vector,Matrix
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'.cache/corsica-gp';OUT.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene
if bpy.context.object and bpy.context.object.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
road=bpy.data.objects['TRACK / one closed seamless driving surface'];W=road.matrix_world.copy()
P=[W@((road.data.vertices[i].co+road.data.vertices[i+1].co)/2) for i in range(0,len(road.data.vertices),2)]
length=sum((b-a).length for a,b in zip(P,P[1:]+P[:1]));scale=500/length
markers=[o for o in scene.objects if o.name.startswith('Finish / chequer')];origin=sum((o.matrix_world.translation for o in markers),Vector())/len(markers);origin.z=P[0].z
j=min(range(len(P)),key=lambda i:(P[i]-origin).length);forward=(P[(j+1)%len(P)]-P[j-1]).normalized();angle=math.pi/2-math.atan2(forward.y,forward.x)
T=Matrix.Diagonal(Vector((scale,scale,scale,1)))@Matrix.Rotation(angle,4,'Z')@Matrix.Translation(-origin)
def yup(p):return [round(p.x,5),round(p.z,5),round(-p.y,5)]
# Begin at the exact finish-line projection, followed by the complete loop.
route=[T@origin]+[T@P[(j+k)%len(P)] for k in range(1,len(P))]+[T@origin]
cumulative=[0]
for a,b in zip(route,route[1:]):cumulative.append(cumulative[-1]+(b-a).length)
soft={'grass','grass-plant','grass-patch','plant','flowers','flowers-tall','mushrooms','patch-grass','patch-grass-foliage','patch-sand','patch-dirt','patch-earth','fern','bush','hedge','hedge-corner'}
def category(o):
 asset=o.get('source_asset','');name=o.name;groups=[c.name for c in o.users_collection]
 if asset in soft or asset.startswith(('patch-','flower','grass-')):return 'decoration'
 if name.startswith(('White edge line','Road centre dash','Finish / chequer','Start / grid','Start / stripe','Start / board checker','Start / CORSICA GP','Start / start label','Sponsor /')) and ('artwork' in name or not name.startswith('Sponsor /')):return 'decoration'
 if name=='Ocean' or 'waterfall' in name.lower() or any(g.startswith('12 /') for g in groups):return 'decoration'
 if o.type=='FONT':return 'decoration'
 return 'solid'
objects=[o for o in scene.objects if o.type in ['MESH','FONT','CURVE'] and not o.name.startswith('SOURCE /') and not o.hide_render]
# Ignore viewport visibility: the entire authored map ships, including hidden presentation groups.
for c in bpy.data.collections:c.hide_viewport=False;c.hide_render=False
for o in objects:o.hide_set(False);o.hide_viewport=False
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
collision=collections.defaultdict(lambda:{'vertices':[],'faces':[],'sources':[]});excluded=[];solid=[];triangles=0
# Static terrain and props keep their actual triangle shapes, merged into nearby cells.
for o in objects:
 kind=category(o)
 if kind=='decoration':excluded.append({'name':o.name,'asset':o.get('source_asset','')});continue
 ev=o.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles();M=T@o.matrix_world;p=M.translation
 key='road' if o==road else f'{math.floor(p.x/32)}_{math.floor(p.y/32)}'
 b=collision[key];off=len(b['vertices']);b['vertices'].extend(tuple(M@v.co) for v in me.vertices);b['faces'].extend(tuple(off+i for i in tri.vertices) for tri in me.loop_triangles);b['sources'].append(o.name);triangles+=len(me.loop_triangles);solid.append({'name':o.name,'asset':o.get('source_asset',''),'chunk':'COL_'+key});ev.to_mesh_clear()
# Transform object nodes, preserving reusable meshes for GPU instancing in the optimizer.
for o in objects:o.matrix_world=T@o.matrix_world
bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
# The distant ocean is matte and opaque; no screen-space reflection dependency is needed.
for m in bpy.data.materials:
 if m.use_nodes:
  p=m.node_tree.nodes.get('Principled BSDF')
  if p and ('water' in m.name.lower() or 'ocean' in m.name.lower()):
   p.inputs['Roughness'].default_value=.68;p.inputs['Metallic'].default_value=0;p.inputs['Transmission Weight'].default_value=0
bpy.ops.export_scene.gltf(filepath=str(OUT/'visual.glb'),export_format='GLB',use_selection=True,export_apply=True,export_extras=False,export_cameras=False,export_lights=False,export_animations=False,export_yup=True)
# Collision GLB has positions and triangle indices only; no grass/clutter geometry or materials.
bpy.ops.object.select_all(action='DESELECT');col=bpy.data.collections.new('Export collision');scene.collection.children.link(col)
chunks=[]
for key,b in collision.items():
 name='COL_'+key;me=bpy.data.meshes.new(name);me.from_pydata(b['vertices'],[],b['faces']);o=bpy.data.objects.new(name,me);col.objects.link(o);o.select_set(True);chunks.append({'name':name,'triangles':len(b['faces']),'sourceCount':len(b['sources'])})
bpy.ops.export_scene.gltf(filepath=str(OUT/'collision.glb'),export_format='GLB',use_selection=True,export_normals=False,export_texcoords=False,export_materials='NONE',export_animations=False,export_yup=True)
points=[yup(p) for p in route];road_half=(W.to_scale().x*3.15)*scale
manifest={'name':'Corsica GP','version':1,'units':'meters','upAxis':'Y','lapLength':cumulative[-1],'serverRaceDistance':500,'roadHalfWidth':road_half,'points':points,'distances':[round(d,5) for d in cumulative],'startPosition':[0,0,0],'startForward':[0,0,-1],'visualUrl':'/maps/corsica-gp/visual.glb','collisionUrl':'/maps/corsica-gp/collision.glb','collisionChunks':chunks,'collisionExcludedAssets':sorted(soft),'sourceFile':'art/monza-island/isola-grand-prix-platforms.blend'}
(OUT/'track.json').write_text(json.dumps(manifest,separators=(',',':')))
(OUT/'export-report.json').write_text(json.dumps({'objects':len(objects),'solidObjects':solid,'nonCollidingObjects':excluded,'collisionTriangles':triangles,'collisionChunks':len(chunks),'sourceLapLength':length,'uniformScale':scale},indent=2));print('CORSICA EXPORT',len(objects),'objects',triangles,'collision triangles',len(chunks),'chunks',flush=True)
