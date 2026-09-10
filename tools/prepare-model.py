"""Open the exported modeling base in a separate Blender process and pack a .blend.

Blender --background --factory-startup --python tools/prepare-model.py -- input.glb output.blend
This never changes an interactive Blender session.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

source, target = [Path(p).resolve() for p in sys.argv[sys.argv.index('--') + 1:]]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
assert meshes, 'The model must contain meshes'
assert all(math.isfinite(v) for obj in meshes for point in obj.data.vertices for v in point.co)

notes = bpy.data.texts.new('READ_ME')
notes.write('墨刃 · 主角参考模型\n\n')
notes.write('按用户提供的 hero-direction.png 重塑的基础模型。\n')
notes.write('包含分层网格和关节父子结构；没有蒙皮骨骼、动画片段或面部表情。\n')
notes.write('游戏动画与布料变形仍由 src/warrior.js 驱动；本文件为待精修的静态建模底稿。\n')
notes.write('GLB 使用标准材质近似颜色，游戏中的卡通光照与后期不包含在本文件中。\n')

scene = bpy.context.scene
scene.world.color = (0.17, 0.19, 0.21)
bpy.ops.object.camera_add(location=(5.4, -7.2, 3.3))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, 1.0)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 3.4
scene.camera = camera
for location, energy, size in [((4, -4, 6), 650, 5), ((-2, 3, 4), 850, 4)]:
    bpy.ops.object.light_add(type='AREA', location=location)
    light = bpy.context.object
    light.data.energy = energy
    light.data.shape = 'DISK'
    light.data.size = size
    light.rotation_euler = (Vector((0, 0, 1)) - light.location).to_track_quat('-Z', 'Y').to_euler()
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_distance = 3.6
            area.spaces.active.region_3d.view_location = Vector((0, 0, 1.0))
            area.spaces.active.shading.type = 'MATERIAL'
bpy.ops.file.pack_all()
target.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(target), compress=True)
print(json.dumps({'file': str(target), 'meshes': len(meshes),
                  'vertices': sum(len(obj.data.vertices) for obj in meshes),
                  'polygons': sum(len(obj.data.polygons) for obj in meshes)}, ensure_ascii=False))
