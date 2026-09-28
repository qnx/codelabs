"""
Generates segment_result.png — side-by-side original photo and colour-coded
segmentation overlay with a class legend, as shown in the codelab screenshot.

Usage:
    python3 segment_viz.py [image] [output]

Defaults:
    image  = test.jpg
    output = segment_result.png

Dependencies: tflite_runtime, numpy, Pillow (all installed by the codelab apk add line)
"""

import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import tflite_runtime.interpreter as tflite

IMAGE  = sys.argv[1] if len(sys.argv) > 1 else 'test.jpg'
OUTPUT = sys.argv[2] if len(sys.argv) > 2 else 'segment_result.png'
MODEL  = 'deeplabv3_257.tflite'

PASCAL = [
    'background', 'aeroplane', 'bicycle', 'bird', 'boat', 'bottle',
    'bus', 'car', 'cat', 'chair', 'cow', 'diningtable', 'dog', 'horse',
    'motorbike', 'person', 'pottedplant', 'sheep', 'sofa', 'train', 'tvmonitor'
]

COLOURS = np.array([
    (0,0,0),(128,0,0),(0,128,0),(128,128,0),(0,0,128),(128,0,128),
    (0,128,128),(128,128,128),(64,0,0),(192,0,0),(64,128,0),(192,128,0),
    (64,0,128),(192,0,128),(64,128,128),(192,128,128),(0,64,0),(128,64,0),
    (0,192,0),(128,192,0),(0,64,128),
], dtype=np.uint8)

interp = tflite.Interpreter(model_path=MODEL, num_threads=4)
interp.allocate_tensors()
inp = interp.get_input_details()[0]
out = interp.get_output_details()[0]
_, mh, mw, _ = inp['shape']

photo = Image.open(IMAGE).convert('RGB')
data  = np.expand_dims((np.array(photo.resize((mw, mh)), dtype=np.float32) / 127.5) - 1.0, axis=0)
interp.set_tensor(inp['index'], data)
interp.invoke()

seg_map = np.argmax(interp.get_tensor(out['index'])[0], axis=-1)   # [257, 257]
seg_rgb = COLOURS[seg_map]                                          # [257, 257, 3]

# Resize both to a common display height
DISPLAY_H = 400
pw = int(DISPLAY_H * photo.width / photo.height)
orig_disp = photo.resize((pw, DISPLAY_H))
seg_disp  = Image.fromarray(seg_rgb).resize((pw, DISPLAY_H), Image.NEAREST)

# Blend overlay: original tinted with segmentation colours
overlay = Image.blend(orig_disp, seg_disp, alpha=0.5)

# Legend: classes that actually appear in this image
LEGEND_W = 160
total    = seg_map.size
unique, counts = np.unique(seg_map, return_counts=True)
present  = sorted(zip(counts, unique), reverse=True)

try:
    font = ImageFont.truetype('/system/lib/fonts/vera/Vera.ttf', 13)
except OSError:
    font = ImageFont.load_default()

canvas_w = pw * 2 + LEGEND_W
canvas   = Image.new('RGB', (canvas_w, DISPLAY_H), (20, 20, 20))

# Left panel: original, Right panel: overlay
canvas.paste(orig_disp, (0, 0))
canvas.paste(overlay,   (pw, 0))

draw = ImageDraw.Draw(canvas)
draw.text((8, 4),      'Original',           fill=(200, 200, 200), font=font)
draw.text((pw + 8, 4), 'Segmentation overlay', fill=(200, 200, 200), font=font)

# Legend column on the far right
lx = pw * 2 + 8
ly = 20
for n, cls_id in present[:8]:
    if cls_id >= len(PASCAL):
        continue
    r, g, b = COLOURS[cls_id]
    pct = n / total * 100
    draw.rectangle([lx, ly, lx + 14, ly + 14], fill=(int(r), int(g), int(b)))
    draw.text((lx + 18, ly), f'{PASCAL[cls_id]}  {pct:.1f}%', fill=(200, 200, 200), font=font)
    ly += 20

canvas.save(OUTPUT)
print(f'Saved: {OUTPUT}')
