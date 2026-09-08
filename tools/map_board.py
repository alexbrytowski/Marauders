"""Derive reviewable terrain data from the untouched physical-board reference.

Run with Pillow, numpy and OpenCV installed. Output is derived artwork/data only.
Photo coordinates and the small list of reviewed corrections are explicit here.
"""
from pathlib import Path
import json
import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
photo = Image.open(ROOT / "Original Marauders Board.jpeg").convert("RGB")
print("Image size", photo.size)
# Coordinate calibration uses the displayed 1824 x 1368 reference.
photo = photo.resize((1824, 1368))
corners = np.float32([[233, 52], [1505, 79], [149, 1206], [1574, 1190]])
grid = np.float32([[0, 0], [32, 0], [0, 30], [32, 30]])
transform = cv2.getPerspectiveTransform(grid, corners)
inverse = cv2.getPerspectiveTransform(corners, grid)
ports_photo = [(559, 131), (1312, 149), (876, 352), (1322, 425),
               (221, 517), (654, 523), (1023, 679), (1453, 644),
               (244, 830), (622, 865), (1134, 948), (332, 1203), (1400, 1190)]
ports = {}
for i, (x, y) in enumerate(ports_photo, 1):
    gx, gy = cv2.perspectiveTransform(np.float32([[[x, y]]]), inverse)[0, 0]
    row = round(float(gy))
    col = round(float(gx) + (0.5 if row % 2 else 0))
    ports[(col, row)] = f"port-{i}"
    print(f"port-{i}: col={col} row={row}, fit=({gx:.2f}, {gy:.2f})")

overlay = photo.copy()
draw = ImageDraw.Draw(overlay)
hsv = cv2.cvtColor(np.array(photo), cv2.COLOR_RGB2HSV)
blue_mask = (((hsv[:, :, 0] >= 90) & (hsv[:, :, 0] <= 125) & (hsv[:, :, 1] > 80)) * 255).astype(np.uint8)
contours, _ = cv2.findContours(blue_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
centers = []
for contour in contours:
    area = cv2.contourArea(contour)
    if not 650 < area < 1900:
        continue
    m = cv2.moments(contour)
    x, y = m['m10'] / m['m00'], m['m01'] / m['m00']
    centers.append((x, y))
print('Blue centers', len(centers))
def features(x, y):
    return [1, x, y, x*x, x*y, y*y, x*x*x, x*x*y, x*y*y, y*y*y]

# The paper is creased and slightly curved. Fit a smooth lattice to detected
# individual blue hex centroids instead of treating it as a flat photograph.
samples, locations = [], []
for x, y in centers:
    gx, gy = cv2.perspectiveTransform(np.float32([[[x, y]]]), inverse)[0, 0]
    row = round(float(gy))
    col = round(float(gx) + (0.5 if row % 2 else 0))
    logical_x = col - (0.5 if row % 2 else 0)
    if abs(gy-row) < 0.45 and abs(gx-logical_x) < 0.45:
        samples.append(features(logical_x, row))
        locations.append([x, y])
fit = np.linalg.lstsq(samples, locations, rcond=None)[0]
def project(col, row):
    return np.array(features(col - (0.5 if row % 2 else 0), row)) @ fit
cells = []
rows = []
for row in range(31):
    line = ""
    for col in range(33):
        gx = col - (0.5 if row % 2 else 0)
        x, y = project(col, row)
        x, y = round(float(x)), round(float(y))
        samples = hsv[y-7:y+8, x-7:x+8].reshape(-1, 3)
        water = ((samples[:, 0] >= 90) & (samples[:, 0] <= 125) & (samples[:, 1] > 80)).mean() > 0.5
        terrain = "water" if water else "land"
        port = ports.get((col, row))
        if port:
            terrain = "port"
        # even-r offset -> axial, with odd rows shifted left in the photograph.
        cell = {"q": col - (row + 1) // 2, "r": row, "terrain": terrain}
        if port:
            cell["portId"] = port
        cells.append(cell)
        symbol = "P" if port else "." if water else "#"
        line += symbol
        draw.ellipse((x-3,y-3,x+3,y+3), fill="#ffcd56" if water else "#fa69ec")
        draw.text((x-10,y-12), f"{col},{row}", fill="white", stroke_width=1, stroke_fill="black")
    rows.append(line)

# Harbor membership is reviewed separately against the visibly darker tiles.
output = ROOT / "artifacts" / "mapping"
output.mkdir(parents=True, exist_ok=True)
overlay.save(output / "calibration.png")
(output / "terrain-draft.json").write_text(json.dumps({"cells": cells}, indent=2) + "\n")
print("\n".join(f"{r:02} {line}" for r, line in enumerate(rows)))
