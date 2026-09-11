# Marauders maps

New matches offer **Classic**, **The Choke**, and **Serpent's Coil**. All start
with thirteen ports, the same snake draft, two ships per owned port, and the same
rules. Captains vote before the draft; each vote is one
ticket in a server-drawn lottery. With no votes, all three maps have equal odds.

## Classic

The original `server/board.json`, version `original-map-v2`, is unchanged. The
source JPEG is untouched. See BOARD_MAPPING.md for the remaining owner review
of photo-derived harbor membership.

## The Choke

The owner's September 10 concept and name replace The Narrows. Two large bodies
of water fill the western and eastern halves of the board. A continuous land
divide reaches both boundaries; the **only crossing is three hexes wide** at
the center. Three ships can seal it, while any one open lane permits passage.
Northgate (12) and Southgate (13) occupy opposite banks of the passage with two
harbor hexes each. The other eleven ports form an oval around each bay, with
five in the west and six in the east. Ports occupy the inner shores and the
northern and southern ends as well as the outer shores.

A small island in the north of the western bay and one in the south of the
eastern bay split open-water routes. Sail around either side to approach the
ring of ports; neither island creates another crossing or adds a port.

Drafting both sides protects access if a rival blocks the crossing. Drafting
near a gate gives direct pressure on it, at the cost of a small harbor and
potential contact with enemy ships coming through. Whirlpools can temporarily
change access across the land divide.

The playable file is `server/maps/narrows.json`, version `narrows-v5`; its stable
internal ID remains `narrows` for saved ballots. It has 579 sailable hexes.

## Serpent's Coil

The third map replaces Shattered Isles with a distinct route concept. A spiral
peninsula wraps around a winding inner sea. Outer ports face open sailing
water; inner ports sit deeper in the coil. A two-hex-wide breach in the eastern
arm offers a shortcut to the middle passage. A second, two-hex-wide northern
cut through the inner arm opens another approach close to Serpent's Heart (13),
so its owner must defend more than the winding route.

A new two-hex-wide southern entrance opens the outer arm to the middle circuit.
Across the wall at offset column 18, the route from row 26 to row 21 drops from
29 movement to five. Turtle Quay's shortest harbor-to-harbor journey to
Scalehaven drops from 36 to 17. Southern captains can contest interior ports
sooner; the inner wall and winding route still matter on the way to the Heart.
A small northwest island offers routes around either side between Dawn Watch,
Serpent's Jaw, and the western approach.

Breachwatch (9) and Scalehaven (10) sit inside the outer arm. Coil's Reach (11)
and Fang Harbor (12) contest the approach to the heart. Distance across land
can be small even when sailing distance is long, so nearby ports need not be
easy to reinforce. Blocking the eastern breach lengthens the tested crossing
by more than twenty movement points. The northern cut independently shortens
one approach to the heart's harbor from 36 steps to six; closing the eastern
breach does not close that approach. The longer winding route remains available.

The playable file is `server/maps/shattered-isles.json`, version
`shattered-isles-v5`; its internal ID remains `shattered-isles`. It has 593
sailable hexes. The islands are terrain, while ports supply capacity, rebuilding
positions, and elimination objectives. The Heart has the same value as any
other port. These strategic tradeoffs still need four-player balance play.

## Existing matches

Versions 2, 3, and 4 are preserved in the corresponding `narrows-v*.json` and
`shattered-isles-v*.json` files. Saved matches keep
their exact terrain, with a legacy label. Version 2 retains the names The
Narrows and Shattered Isles; version 3 retains The Choke and Serpent's Coil.
They can continue without moving ships or resetting saves. New drafts use
version 5. Unknown versions and versions belonging to another map fail
explicitly. The API and client load the version saved in the match;
perk-placement caches are also version-specific. No live save is reset.

## Reproduce and verify

Run `python tools/create_alternate_maps.py`, then `python tools/render_maps.py`
(Pillow required). They reproduce the current JSON and labeled PNG previews in
`artifacts/maps/`. The generator leaves Classic, the source photo, and legacy
JSON untouched. Coordinates use Classic's even-row hex grid; first-ring water
around ports forms their harbors.

Checks cover connected water and harbors, thirteen distinct ports, at least
two launch hexes each, automatic fleets, spillover, perk access, lottery rules,
and saved versions. The Choke has an explicit three-cell cut test; the Coil has
distance tests for all three cuts, including passage past one blocked southern
entrance hex. Island tests preserve all port positions and harbor cells. The five-browser map scenario
covers voting, drafting, sailing, shared state, and restart persistence on both
maps, plus loading all six legacy layouts.
