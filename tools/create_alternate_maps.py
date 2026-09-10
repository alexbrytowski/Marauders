"""Reproduce authored alternate coastlines without changing Classic or its photo.

Each shoreline is explicit: no mirrored ports, repeated island stamps, or noise.
Span coordinates are inclusive (column, row), on the game's even-row hex grid.
"""
import json
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT = 33, 31
DIRECTIONS = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]


def axial(col, row):
    return col - (row + 1) // 2, row


def offset(q, r):
    return q + (r + 1) // 2, r


def neighbors(col, row):
    q, r = axial(col, row)
    return [offset(q + dq, r + dr) for dq, dr in DIRECTIONS]


def coast(left, right):
    assert len(left) == len(right) == HEIGHT
    return [["#" if c <= left[r] or c >= right[r] else "."
             for c in range(WIDTH)] for r in range(HEIGHT)]


def land(rows, first_row, spans):
    for r, (start, end) in enumerate(spans, first_row):
        for c in range(start, end + 1):
            rows[r][c] = "#"


def write(name, rows, points, names):
    assert len(points) == len(set(points)) == len(names) == 13
    ports = []
    for i, ((c, r), title) in enumerate(zip(points, names)):
        rows[r][c] = "P"
        ports.append(dict(id=f"port-{i + 1}", name=title, col=c, row=r))
    water = {(c, r) for r, row in enumerate(rows) for c, cell in enumerate(row) if cell == "."}
    harbors = [{h for h in neighbors(*p) if h in water} for p in points]
    assert all(len(h) >= 2 for h in harbors), [(p, len(h)) for p, h in zip(points, harbors)]
    assert sum(map(len, harbors)) == len(set.union(*harbors)), "Harbors overlap"
    reached = {next(iter(water))}
    queue = deque(reached)
    while queue:
        for h in neighbors(*queue.popleft()):
            if h in water and h not in reached:
                reached.add(h)
                queue.append(h)
    assert reached == water, f"Isolated water: {water - reached}"
    target = ROOT / "server" / "maps" / f"{name}.json"
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(dict(version=f"{name}-v4", rows=["".join(r) for r in rows], ports=ports), indent=2) + "\n", encoding="utf-8")
    print(f"{name}: {len(water)} sailing hexes; harbor sizes {list(map(len, harbors))}")


def narrows():
    rows = coast(
        [32, 8, 6, 4, 5, 3, 5, 6, 5, 3, 1, 1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 4, 5, 6, 5, 3, 2, 2, 3, 5, 32],
        [0, 25, 27, 28, 28, 30, 30, 29, 27, 26, 27, 29, 30, 31, 30, 28, 29, 30, 30, 29, 28, 29, 31, 31, 30, 29, 29, 30, 29, 27, 0],
    )
    # One boundary-to-boundary divide: the ONLY crossing is rows 14, 15, 16.
    # At column 16 these are exactly three sailable hexes; three ships can seal it.
    for r in range(1, HEIGHT - 1):
        if r not in (14, 15, 16):
            land(rows, r, [(15 if r % 4 else 14, 17 if r % 5 else 18)])
    # Ring each bay: north/south, outer shore, and both inner-shore shoulders.
    points = [(5, 14), (9, 4), (14, 9), (14, 23), (8, 28),
              (24, 4), (18, 8), (29, 14), (28, 22), (24, 28), (18, 23),
              (16, 13), (16, 17)]
    write("narrows", rows, points, ["Westwatch", "Saltmarket", "Low Lantern", "Copper Quay", "Southwatch",
          "Eastwatch", "Highgate", "Moonmarket", "Bright Lantern", "Silver Quay", "Stormwatch",
          "Northgate", "Southgate"])


def shattered_isles():
    rows = coast(
        [32, 5, 3, 2, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 2, 3, 5, 32],
        [0, 27, 29, 30, 30, 31, 31, 30, 31, 31, 30, 31, 31, 30, 31, 31, 31, 30, 31, 31, 30, 31, 31, 30, 31, 31, 30, 30, 29, 27, 0],
    )
    # A square spiral, two hexes thick, curling into the prize harbor. The
    # eastern outer breach and northern inner cut open two distinct shortcuts.
    land(rows, 1, [(14, 15)] * 5)
    land(rows, 5, [(14, 25)] * 2)
    land(rows, 6, [(24, 25)] * 19)
    land(rows, 23, [(7, 25)] * 2)
    land(rows, 10, [(7, 8)] * 14)
    land(rows, 10, [(7, 20)] * 2)
    land(rows, 11, [(19, 20)] * 9)
    land(rows, 18, [(12, 20)] * 2)
    land(rows, 15, [(12, 13)] * 4)
    land(rows, 15, [(12, 16)])
    for r in (14, 15):
        rows[r][24] = rows[r][25] = "."
    # A second entrance near the heart makes the inner harbor contestable from
    # the north as well as by sailing around the coil's southern arm.
    for r in (10, 11):
        rows[r][14] = rows[r][15] = "."
    points = [(3, 3), (26, 2), (30, 10), (30, 21), (25, 28), (7, 28), (2, 19),
              (14, 6), (23, 9), (23, 21), (9, 14), (18, 12), (16, 15)]
    write("shattered-isles", rows, points, ["Dawn Watch", "North Star", "Eastwind", "Last Light", "South Star",
          "Turtle Quay", "Westwind", "Serpent's Jaw", "Breachwatch", "Scalehaven", "Coil's Reach", "Fang Harbor", "Serpent's Heart"])


if __name__ == "__main__":
    narrows()
    shattered_isles()
