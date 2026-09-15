"""
Generates classify_result.png — the composite image used in the codelab screenshot.
Shows the test photo alongside a MobileNetV2 top-5 bar chart.

Usage:
    python3 classify_viz.py [image] [output]

Defaults:
    image  = test.jpg
    output = classify_result.png

Dependencies: tflite_runtime, numpy, Pillow (all installed by the codelab apk add line)
"""

import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import tflite_runtime.interpreter as tflite

IMAGE  = sys.argv[1] if len(sys.argv) > 1 else 'test.jpg'
OUTPUT = sys.argv[2] if len(sys.argv) > 2 else 'classify_result.png'
MODEL  = 'mobilenet_v2.tflite'
LABELS = 'labels_imagenet.txt'

with open(LABELS) as f:
    labels = [l.strip() for l in f]

interp = tflite.Interpreter(model_path=MODEL, num_threads=4)
interp.allocate_tensors()
inp = interp.get_input_details()[0]
out = interp.get_output_details()[0]
h, w = inp['shape'][1], inp['shape'][2]

photo = Image.open(IMAGE).convert('RGB')
data  = np.expand_dims(np.array(photo.resize((w, h)), dtype=np.float32) / 255.0, axis=0)
interp.set_tensor(inp['index'], data)
interp.invoke()

scores = interp.get_tensor(out['index'])[0]
top5   = np.argsort(scores)[::-1][:5]

# Layout: photo on left, bar chart on right
PANEL_H  = 400
CHART_W  = 480
PADDING  = 20
BAR_H    = 30
BAR_GAP  = 18

ph = PANEL_H
pw = int(ph * photo.width / photo.height)
canvas = Image.new('RGB', (pw + CHART_W, ph), (30, 30, 30))
canvas.paste(photo.resize((pw, ph)), (0, 0))

draw = ImageDraw.Draw(canvas)
try:
    font_lg = ImageFont.truetype('/system/lib/fonts/vera/Vera.ttf', 18)
    font_sm = ImageFont.truetype('/system/lib/fonts/vera/Vera.ttf', 14)
except OSError:
    font_lg = ImageFont.load_default()
    font_sm = font_lg

draw.text((pw + PADDING, PADDING), 'MobileNetV2 — Top-5', fill=(220, 220, 220), font=font_lg)

bar_x   = pw + PADDING
bar_top = 60
max_bar = CHART_W - PADDING * 3

for rank, idx in enumerate(top5, 1):
    name  = labels[idx] if idx < len(labels) else f'class_{idx}'
    score = scores[idx] * 100
    y     = bar_top + (rank - 1) * (BAR_H + BAR_GAP)
    bw    = int(score / 100 * max_bar)
    colour = (100, 180, 100) if rank == 1 else (80, 130, 180)
    draw.rectangle([bar_x, y, bar_x + bw, y + BAR_H], fill=colour)
    draw.text((bar_x + 8, y + 6), f'{rank}. {name}', fill=(255, 255, 255), font=font_sm)
    draw.text((bar_x + max_bar + 8, y + 6), f'{score:.2f}%', fill=(200, 200, 200), font=font_sm)

canvas.save(OUTPUT)
print(f'Saved: {OUTPUT}')
