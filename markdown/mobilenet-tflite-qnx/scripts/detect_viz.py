"""
Generates detect_result.png — bounding boxes and labels drawn on the test photo.

Usage:
    python3 detect_viz.py [image] [output]

Defaults:
    image  = test.jpg
    output = detect_result.png

Dependencies: tflite_runtime, numpy, Pillow (all installed by the codelab apk add line)
"""

import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import tflite_runtime.interpreter as tflite

IMAGE    = sys.argv[1] if len(sys.argv) > 1 else 'test.jpg'
OUTPUT   = sys.argv[2] if len(sys.argv) > 2 else 'detect_result.png'
MODEL    = 'detect.tflite'
LABELMAP = 'labelmap.txt'
THRESHOLD = 0.5

with open(LABELMAP) as f:
    coco = [l.strip() for l in f]

interp = tflite.Interpreter(model_path=MODEL, num_threads=4)
interp.allocate_tensors()
inp  = interp.get_input_details()[0]
outs = interp.get_output_details()
_, mh, mw, _ = inp['shape']

photo = Image.open(IMAGE).convert('RGB')
iw, ih = photo.size

data = np.expand_dims(np.array(photo.resize((mw, mh)), dtype=np.uint8), axis=0)
interp.set_tensor(inp['index'], data)
interp.invoke()

boxes   = interp.get_tensor(outs[0]['index'])[0]
classes = interp.get_tensor(outs[1]['index'])[0]
scores  = interp.get_tensor(outs[2]['index'])[0]
count   = int(interp.get_tensor(outs[3]['index'])[0])

COLOURS = [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
    '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4',
]

draw = ImageDraw.Draw(photo)
try:
    font = ImageFont.truetype('/system/lib/fonts/vera/Vera.ttf', max(12, ih // 40))
except OSError:
    font = ImageFont.load_default()

drawn = 0
for i in range(count):
    if scores[i] < THRESHOLD:
        continue
    cls_id = int(classes[i])
    label  = coco[cls_id + 1] if (cls_id + 1) < len(coco) else f'cls_{cls_id}'
    ymin, xmin, ymax, xmax = boxes[i]
    x0, y0 = int(xmin * iw), int(ymin * ih)
    x1, y1 = int(xmax * iw), int(ymax * ih)
    colour = COLOURS[cls_id % len(COLOURS)]
    for t in range(3):
        draw.rectangle([x0 - t, y0 - t, x1 + t, y1 + t], outline=colour)
    tag = f'{label} {scores[i]*100:.0f}%'
    draw.rectangle([x0, y0 - 20, x0 + len(tag) * 7 + 4, y0], fill=colour)
    draw.text((x0 + 2, y0 - 19), tag, fill='white', font=font)
    drawn += 1

photo.save(OUTPUT)
print(f'Saved: {OUTPUT}  ({drawn} detections above {THRESHOLD*100:.0f}% threshold)')
