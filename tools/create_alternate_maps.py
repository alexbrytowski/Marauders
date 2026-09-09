"""Reproduce the two designed hex boards without changing Classic or its photo."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT = 33, 31
DIRECTIONS = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]


def axial(col, row):
    return col - (row + 1) // 2, row


def offset(q, r):
    return q + (r + 1) // 2, r


def ocean():
    return [["#" if c in (0, WIDTH - 1) or r in (0, HEIGHT - 1) else "."
             for c in range(WIDTH)] for r in range(HEIGHT)]


def set_hex(rows, q, r, value="#"):
    c, r = offset(q, r)
    if 0 <= c < WIDTH and 0 <= r < HEIGHT:
        rows[r][c] = value


def coast_island(rows, col, row):
    # Land behind the port, with a broad harbor facing the center of the sea.
    q, r = axial(col, row)
    center_q, center_r = axial(16, 15)
    vx, vy = q + r / 2 - center_q - center_r / 2, (r - center_r) * .866
    outward = sorted(DIRECTIONS, key=lambda d: (d[0] + d[1] / 2) * vx + d[1] * .866 * vy, reverse=True)
    for dq, dr in outward[:3]:
        set_hex(rows, q + dq, r + dr)
    dq, dr = outward[0]
    set_hex(rows, q + 2 * dq, r + 2 * dr)


def write(name, rows, points, names):
    ports = []
    for i, ((c, r), title) in enumerate(zip(points, names)):
        rows[r][c] = "P"
        ports.append(dict(id=f"port-{i + 1}", name=title, col=c, row=r))
    target = ROOT / "server" / "maps" / f"{name}.json"
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(dict(version=f"{name}-v1", rows=["".join(r) for r in rows], ports=ports), indent=2) + "\n", encoding="utf-8")


def narrows():
    rows = ocean()
    for r in range(HEIGHT):
        if r not in (7, 8, 9, 21, 22, 23):
            for c in (15, 16, 17):
                rows[r][c] = "#"
    left = [(5, 4), (11, 8), (5, 12), (10, 18), (5, 23), (11, 27)]
    points = left + [(32 - c, r) for c, r in left] + [(16, 15)]
    for c, r in points[:-1]:
        coast_island(rows, c, r)
    # Gatewatch overlooks both basins; its port tile still blocks the crossing.
    rows[15][15] = rows[15][17] = "."
    write("narrows", rows, points, ["Westwatch", "Northgate", "Saltmarket", "Low Lantern", "Copper Quay", "Southwatch",
          "Eastwatch", "Highgate", "Moonmarket", "Bright Lantern", "Silver Quay", "Stormwatch", "Gatewatch"])


def shattered_isles():
    rows = ocean()
    points = [(8, 5), (16, 4), (24, 5), (28, 10), (27, 17), (24, 24), (16, 26),
              (8, 24), (4, 19), (4, 11), (10, 13), (22, 14), (16, 15)]
    for c, r in points[:-1]:
        coast_island(rows, c, r)
    for c, r in [(13, 8), (19, 22), (9, 18), (23, 9)]:
        q, r = axial(c, r)
        for dq, dr in [(0, 0), (1, 0), (0, 1)]:
            set_hex(rows, q + dq, r + dr)
    write("shattered-isles", rows, points, ["Dawn Cay", "North Star", "Pearl Key", "Eastwind", "Broken Anchor",
          "Sunset Cay", "South Star", "Turtle Key", "Westwind", "Driftwood", "Whisper Isle", "Ember Isle", "Compass Crown"])


if __name__ == "__main__":
    narrows()
    shattered_isles()
