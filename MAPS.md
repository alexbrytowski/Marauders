# Marauders maps

All three maps have thirteen ports, snake-draft setup, two starting ships per port,
and the same combat, population, perk, and construction rules. Map choice is
independent of first-player selection. A reset starts a fresh ballot.

## Classic

The unchanged original layout, in `server/board.json`, with board version
`original-map-v2`. Its coastal classification still awaits final owner review
against the physical board. See BOARD_MAPPING.md. Existing saves default here.

## The Narrows

`server/maps/narrows.json` · `narrows-v1`

A long island spine divides the sea into western and eastern basins. Two
three-row passages connect the basins in the north and south. Twelve ports are
paired across the spine, with Gatewatch in the middle. Its two harbor cells
overlook opposite basins; the port tile itself cannot be crossed.

This layout invites captains to contest passages, hold ports near a gate, or
send a fleet around through the other crossing. More sheltered home waters make
expansion choices consequential. It is intentionally different from Classic's
irregular coastlines, while preserving multiple ways to reach the other basin.

## Shattered Isles

`server/maps/shattered-isles.json` · `shattered-isles-v1`

Small coastal islands ring a broad sea, with inner ports and reef-like land
clusters breaking up straight routes. Compass Crown sits in the center with a
full harbor ring. Captains can spread out along the outside or cut inward to
contest the central routes. There is no single crossing that seals the whole map.

This favors maneuvering and multiple threats. Central access is useful, but also
exposes ships and ports to several approaches. Island size and routes are initial
designs for playtesting, not a claim that the map is competitively balanced.

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

## Reproduce and verify

Run `python tools/create_alternate_maps.py` to reproduce the two new designs. It
writes only their JSON files; it never edits Classic or the reference photo.
Rows use `#` for land, `.` for water, and `P` for ports. First-ring water around
ports becomes dark-blue harbor water. Coordinates follow the same even-row
offset-to-axial conversion as Classic.

Server tests check weighted draw ticket boundaries, vote permissions/locking,
thirteen distinct ports, at least two harbor cells per port, routes between every
harbor, full four-captain setup, legal movement on the selected map, construction
spillover, and randomized perk layouts independent of draft ownership. Browser tests
exercise public votes, both new boards, predraft perks, automatic fleets, sailing, and persistence.

Playtest remaining: choke-point congestion in The Narrows, central-port strength
in Shattered Isles, how draft position affects each layout, and perk access under
real contested movement. Feedback should guide terrain edits. Bump the map version
when changing its geometry so existing games cannot silently switch underneath ships.
