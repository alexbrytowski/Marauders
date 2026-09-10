# Marauders maps

All three maps have thirteen ports, snake-draft setup, two starting ships per port,
and the same combat, population, perk, and construction rules. Map choice is
independent of first-player selection. A reset starts a fresh ballot.

## Classic

The unchanged original layout, in `server/board.json`, with board version
`original-map-v2`. Its coastal classification still awaits final owner review
against the physical board. See BOARD_MAPPING.md. Existing saves default here.

## September 9 design pass

The owner found the first alternatives too symmetrical and uniform. Version 2
replaces mirrored ports and repeated island shapes with authored coastlines,
uneven port spacing, bays, headlands, and different harbor exposures. The useful
lesson from Classic is that proximity on the chart need not mean easy access by
sea. These are geographic tradeoffs for the snake draft, not claims of equal
port strength or certified four-player balance.

## The Narrows

`server/maps/narrows.json` · `narrows-v2`

A crooked northern headland, a large island bending southeast, and an offset
southern peninsula divide unequal basins. The northern crossing has two rows of
water; the southern passage has three clear rows and a wider diagonal approach.
Both remain independently usable if ships block the other crossing.

- Northgate (2) faces the northern crossing with four harbor hexes. It can reach
  the shortcut quickly, but has more room for enemy ships to enter its harbor.
- Eastwatch (7) sits deep in the northern bay with only two harbor hexes. Its
  shelter comes with a long trip to the ports around the southern passage.
- Gatewatch (13) has a two-hex berth on the east of the large island. Its central
  position does not provide a direct crossing to the west: ships must round the
  island, and it no longer has disconnected harbors in opposite basins.
- Moonmarket (9) and Bright Lantern (10) are close neighbors in the southeast,
  creating local pressure; the western ports are more spread out. Silver Quay
  (11) offers a smaller harbor farther down the coast.

The sea contains 542 sailable hexes. Harbors vary from two to five hexes.

## Shattered Isles

`server/maps/shattered-isles.json` · `shattered-isles-v2`

An unequal archipelago replaces the ring of identical cays. A forked northwest
island, a small northeast island, a broad eastern island, and a hooked southwest
island create different route lengths. Coastal pockets and isolated rocks break
up the outer route without sealing the interior sea.

- Dawn Cay (1) and Whisper Isle (11) face opposite sides of the northwest island.
  Ships must sail around the coastline to reinforce one another.
- Ember Isle (12), Broken Anchor (5), and Sunset Cay (6) share the large eastern
  island but have different access. Broken Anchor occupies a two-hex cove on its
  east; Ember faces northwest, separated from it by land.
- Eastwind (4), Westwind (9), and Turtle Key (8) also have two-hex harbors. They
  offer limited harbor entry space at the expense of immediate central access.
- Compass Crown (13) is off-center in open water. Its five-hex harbor and access
  to several nearby routes come with little land cover.

The sea contains 564 sailable hexes. Harbors vary from two to five hexes.

## Votes and map integrity

Each signed captain owns one public vote. The server validates map IDs, derives
the voter from the browser seat, and draws once when the host starts the draft.
Every vote contributes one ticket; with no votes, every map gets one ticket.
The selected map, counts, draw ticket, and map version persist through restarts.

The client preloads all three immutable boards for previews and immediate map
switching. Actual play renders the board matching the saved map ID and version.
All server movement, harbor, construction, and combat checks use that map instance;
there is no mutable process-global "current board." Perk candidate distances are
cached separately for each map. Unknown IDs and incompatible versions are rejected.

The v2 terrain requires a fresh match. A v1 alternate-map save is intentionally
rejected by the existing version guard; ships cannot silently move onto revised
terrain. Finish or archive/reset that match using the old build before upgrading.
Classic saves are unaffected. This revision does not reset or migrate live saves.

## Reproduce and verify

Run `python tools/create_alternate_maps.py` to reproduce the two designs. It
writes only their JSON files, and checks connected water, thirteen distinct ports,
nonoverlapping harbors, and capacity for at least two starting ships at every port.
Rows use `#` for land, `.` for water, and `P` for ports. First-ring water around
ports becomes dark-blue harbor water. Coordinates follow Classic's even-row grid.

Run `python tools/render_maps.py` with Pillow installed to export labeled PNGs to
`artifacts/maps/`. They are drawn from the playable JSON, with the same terrain
and harbor membership. The original JPEG is never edited.

Server tests cover lottery/vote rules, all harbors and water connected, contiguous
alternate-map harbors, independent Narrows crossings, automatic fleets,
construction spillover, legal movement/combat, randomized predraft perks, and
saved map identity. The five-browser map scenario covers ballots, both layouts,
automatic setup, sailing, synchronization, and persistence through restarts.

Playtest remaining: northern passage congestion, the cost of secluded harbors,
the southeast cluster in The Narrows, Compass Crown's access, coordinated drafts
around multi-port islands, and perk access under contested movement.
