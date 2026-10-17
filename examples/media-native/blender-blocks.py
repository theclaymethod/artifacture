"""Original editable GLB starter. Run in Blender, not the browser.

blender --background --python blender-blocks.py -- --out public/models/blocks
"""
import argparse
import pathlib
import sys
import bpy

arguments = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument('--out', required=True, help='Output basename for .blend and .glb')
args = parser.parse_args(arguments)
destination = pathlib.Path(args.out).resolve()
destination.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color):
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    shader = value.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = color
    shader.inputs['Roughness'].default_value = 0.8
    return value

graphite = material('Graphite', (0.18, 0.2, 0.22, 1))
accent = material('Cyan', (0.01, 0.55, 0.66, 1))
for index in range(7):
    height = 0.55 + (index % 3) * 0.42
    bpy.ops.mesh.primitive_cube_add(size=1, location=((index % 3 - 1) * 0.7, (index // 3 - 1) * 0.7, height / 2))
    block = bpy.context.object
    block.name = f'Block-{index + 1}'
    block.dimensions = (0.55, 0.55, height)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel = block.modifiers.new('Edge radius', 'BEVEL')
    bevel.width = 0.018
    bevel.segments = 2
    block.data.materials.append(accent if index == 4 else graphite)

bpy.ops.wm.save_as_mainfile(filepath=str(destination.with_suffix('.blend')))
bpy.ops.export_scene.gltf(filepath=str(destination.with_suffix('.glb')), export_format='GLB', export_apply=True, export_animations=False)
print(f'Saved editable source and embedded GLB: {destination}')
