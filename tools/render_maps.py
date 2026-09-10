"""Render shareable alternate-map previews directly from the playable JSON.

Requires Pillow (also used by map_board.py). Outputs to artifacts/maps/.
"""
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from create_alternate_maps import ROOT, axial, neighbors

PALETTE = {"water": "#2d6890", "harbor": "#153657", "port": "#111a1b",
           "land": "#526d50", "coast": "#c3b58d"}
COPY = {
    "narrows": ("THE NARROWS", "A crooked divide. Two very different ways through.", [
        "Northgate: short northern crossing, exposed harbor.",
        "Gatewatch: sheltered eastern berth; the island blocks a direct trip west.",
        "Southern passage: more room to maneuver, a longer trip from the north.",
    ]),
    "shattered-isles": ("SHATTERED ISLES", "Unequal islands. Sheltered coves. Exposed shortcuts.", [
        "Eastwind & Westwind: small coastal harbors, away from the inner routes.",
        "Ember Isle & Broken Anchor: close on the chart, separated by a large island.",
        "Compass Crown: five harbor hexes and fast access, with little land cover.",
    ]),
}


def font(size, bold=False, serif=False):
    windows = Path("C:/Windows/Fonts")
    name = "georgiab.ttf" if serif else "segoeuib.ttf" if bold else "segoeui.ttf"
    path = windows / name
    return ImageFont.truetype(str(path), size) if path.exists() else ImageFont.load_default(size=size)


def render(map_id):
    source = json.loads((ROOT / "server" / "maps" / f"{map_id}.json").read_text(encoding="utf-8"))
    title, subtitle, notes = COPY[map_id]
    image = Image.new("RGB", (1440, 1580), "#102830")
    draw = ImageDraw.Draw(image)
    draw.text((54, 24), title, font=font(43, serif=True), fill="#f2ddad")
    draw.text((56, 82), subtitle, font=font(23), fill="#bfd0d2")
    draw.text((1384, 44), "13 PORTS / V2", font=font(19, bold=True), fill="#c3b58d", anchor="ra")
    rows = source["rows"]
    ports = {(p["col"], p["row"]): i for i, p in enumerate(source["ports"], 1)}
    water = {(c, r) for r, row in enumerate(rows) for c, value in enumerate(row) if value == "."}
    harbor = {h for p in ports for h in neighbors(*p) if h in water}
    radius = 23
    for r, row in enumerate(rows):
        for c, value in enumerate(row):
            q, _ = axial(c, r)
            x, y = 85 + math.sqrt(3) * radius * (q + r / 2), 153 + 1.5 * radius * r
            points = [(x + radius * math.cos(math.radians(i * 60 - 30)),
                       y + radius * math.sin(math.radians(i * 60 - 30))) for i in range(6)]
            terrain = "port" if (c, r) in ports else "harbor" if (c, r) in harbor else "water" if value == "." else "land"
            if terrain == "land" and any(h in water or h in ports for h in neighbors(c, r)):
                terrain = "coast"
            draw.polygon(points, fill=PALETTE[terrain], outline="#739395", width=1)
            if terrain == "port":
                draw.text((x, y - 1), str(ports[c, r]), font=font(22, bold=True), fill="#ffe4a0", anchor="mm")
            elif terrain == "harbor":
                draw.ellipse((x - 2, y - 2, x + 2, y + 2), fill="#8baaba")
            elif terrain == "land" and (q + r) % 3 == 0:
                draw.line([(x - 7, y + 4), (x, y - 7), (x + 7, y + 4)], fill="#7c9470", width=1)
    legend_y = 1231
    for x, terrain, label in [(56, "water", "Open water"), (282, "harbor", "Harbor"),
                               (465, "port", "Port"), (610, "coast", "Coast / land")]:
        draw.rounded_rectangle((x, legend_y, x + 24, legend_y + 24), radius=3, fill=PALETTE[terrain], outline="#8dada5")
        draw.text((x + 34, legend_y - 3), label, font=font(21), fill="#d4dedd")
    draw.line((56, 1275, 1384, 1275), fill="#446064")
    for i, p in enumerate(source["ports"]):
        col, row = divmod(i, 5)
        draw.text((56 + col * 450, 1291 + row * 29), f"{i + 1:02}  {p['name']}", font=font(20), fill="#d4dedd")
    for i, note in enumerate(notes):
        draw.text((56, 1455 + i * 30), note, font=font(20), fill="#bfcfcf")
    output = ROOT / "artifacts" / "maps"
    output.mkdir(parents=True, exist_ok=True)
    target = output / f"{map_id}-v2.png"
    image.save(target)
    print(target)


if __name__ == "__main__":
    for map_id in COPY:
        render(map_id)
