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
    target.write_text(json.dumps(dict(version=f"{name}-v2", rows=["".join(r) for r in rows], ports=ports), indent=2) + "\n", encoding="utf-8")
    print(f"{name}: {len(water)} sailing hexes; harbor sizes {list(map(len, harbors))}")


def narrows():
    rows = coast(
        [32, 8, 6, 4, 5, 3, 5, 6, 5, 3, 1, 1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 4, 5, 6, 5, 3, 2, 2, 3, 5, 32],
        [0, 25, 27, 28, 28, 30, 30, 29, 27, 26, 27, 29, 30, 31, 30, 28, 29, 30, 30, 29, 28, 29, 31, 31, 30, 29, 29, 30, 29, 27, 0],
    )
    # Crooked northern headland ends at a tight cut above the long central island.
    land(rows, 1, [(14, 23), (15, 22), (15, 21), (14, 20), (14, 18),
                   (13, 18), (12, 16), (13, 15), (13, 14)])
    # The spine bends east, leaving unequal basins and different harbor faces.
    land(rows, 12, [(13, 14), (12, 16), (11, 16), (12, 16), (12, 17),
                    (13, 19), (14, 20), (16, 20), (17, 19), (18, 19)])
    # Offset southern headland opens a broad diagonal route around the spine.
    land(rows, 25, [(14, 15), (13, 16), (12, 19), (10, 18), (10, 20)])
    land(rows, 16, [(7, 8), (7, 9), (8, 9), (8, 8)])
    land(rows, 8, [(23, 24), (22, 24), (23, 23)])
    land(rows, 19, [(24, 25), (23, 25), (24, 24)])
    points = [(5, 4), (13, 9), (4, 14), (9, 18), (6, 23), (10, 28),
              (24, 1), (23, 10), (29, 19), (25, 20), (29, 26), (19, 27), (17, 15)]
    write("narrows", rows, points, ["Westwatch", "Northgate", "Saltmarket", "Low Lantern", "Copper Quay", "Southwatch",
          "Eastwatch", "Highgate", "Moonmarket", "Bright Lantern", "Silver Quay", "Stormwatch", "Gatewatch"])


def shattered_isles():
    rows = coast(
        [32, 9, 7, 5, 3, 2, 2, 1, 2, 3, 4, 5, 4, 2, 1, 1, 2, 3, 4, 4, 3, 3, 2, 1, 2, 3, 4, 5, 7, 9, 32],
        [0, 24, 25, 27, 29, 30, 31, 31, 30, 29, 28, 29, 29, 30, 31, 31, 30, 30, 31, 31, 30, 29, 28, 29, 30, 31, 30, 29, 28, 26, 0],
    )
    land(rows, 1, [(16, 20), (17, 20), (18, 19)])
    # Forked northwestern island: its two ports face different seas.
    land(rows, 5, [(8, 10), (7, 11), (7, 12), (8, 14), (8, 13),
                   (9, 11), (10, 12), (11, 12)])
    land(rows, 8, [(15, 15), (14, 15)])
    # Smaller northeastern crescent, with a bay open to the south.
    land(rows, 5, [(24, 26), (23, 26), (23, 25), (24, 24)])
    # Broad eastern island with three port faces and an indentation on the east.
    land(rows, 13, [(21, 22), (19, 23), (18, 24), (19, 24), (20, 24),
                    (20, 26), (21, 25), (20, 24), (20, 23), (21, 24), (21, 22)])
    # Southwest island is long, thin, and hooked rather than a stamped cay.
    land(rows, 20, [(9, 10), (8, 11), (8, 10), (9, 12), (10, 12), (9, 11), (10, 10)])
    land(rows, 28, [(15, 17), (14, 19)])
    # Off-center hub: five harbor cells give fast access and little land cover.
    land(rows, 16, [(13, 13)])
    # Rocks create local forks without another complete barrier.
    land(rows, 15, [(7, 8), (8, 8)])
    land(rows, 25, [(24, 25), (25, 25)])
    points = [(8, 5), (19, 3), (26, 6), (29, 12), (25, 17), (21, 23), (15, 28),
              (11, 25), (3, 21), (4, 12), (12, 12), (19, 14), (13, 17)]
    write("shattered-isles", rows, points, ["Dawn Cay", "North Star", "Pearl Key", "Eastwind", "Broken Anchor",
          "Sunset Cay", "South Star", "Turtle Key", "Westwind", "Driftwood", "Whisper Isle", "Ember Isle", "Compass Crown"])


if __name__ == "__main__":
    narrows()
    shattered_isles()
