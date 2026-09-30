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
    target.write_text(json.dumps(dict(version=f"{name}-v7", rows=["".join(r) for r in rows], ports=ports), indent=2) + "\n", encoding="utf-8")
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
    # A northern island in the western bay and a southern one in the eastern
    # bay create flanking routes while leaving the central crossing untouched.
    land(rows, 9, [(8, 9), (7, 9), (7, 10), (8, 9)])
    land(rows, 17, [(24, 25), (23, 26), (23, 25), (24, 24)])
    # Six ports ring each bay. Northgate is the lone central port and remains
    # the neutral thirteenth port during setup.
    points = [(5, 14), (9, 4), (14, 9), (14, 23), (8, 28),
              (24, 4), (18, 8), (29, 14), (28, 22), (24, 28), (18, 23),
              (16, 13), (5, 21)]
    write("narrows", rows, points, ["Westwatch", "Saltmarket", "Low Lantern", "Copper Quay", "Southwatch",
          "Eastwatch", "Highgate", "Moonmarket", "Bright Lantern", "Silver Quay", "Stormwatch",
          "Northgate", "Dusk Harbor"])




if __name__ == "__main__":
    narrows()
