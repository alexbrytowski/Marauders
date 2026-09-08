# Board mapping

The original JPEG is preserved. `server/board.json` defines the playable hex grid;
the API returns its terrain to the SVG client. The same server definition validates
movement, harbor entry, combat, attacks, setup placement, and construction spillover.

`tools/map_board.py` samples the source image using a perspective calibration and
a curved-paper correction fitted to detected blue hex centers. It writes a labeled
calibration image and draft terrain under `artifacts/mapping/` for visual review.
Requires Python with Pillow, NumPy, and OpenCV; these are mapping tools, not runtime
dependencies of the game.

The derived board uses even-row offset coordinates converted to axial coordinates.
Rows in `board.json` run north to south. `.` is navigable water, `#` is land, and `P`
marks a port. Port IDs remain in the original prototype's geographic order. Port
names are provisional nautical names added for easier discussion during play.

The reference's dark-blue harbor tiles appear to be the navigable first-ring cells
around each black port. These are currently identified from terrain and adjacency.
Automated checks require at least two harbor cells at every port and a legal route
between all harbors. A final owner review of dark-blue membership and any glare-
obscured terrain is still open; the mapping is not certified exact.

Reviewed extraction corrections:

- The blue sticky note touching the left boundary is not water: offset `(0, 9)`
  is land.
- The physical construction trackers are land in the digital map. Actual builds
  appear in the captain cards and Shipyards tab.
- Partial edge fragments are treated as boundary. Odd rows retain an extra right
  boundary land cell to keep the staggered outline.

The browser's water highlights and route preview are advisory. The server checks
every traversed cell and stops movement at the first automatic combat trigger.
