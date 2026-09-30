# Marauders maps

New matches offer **Classic**, **The Choke**, and **Delta**. Every map has 13 ports. Each captain receives three geographically balanced random ports and two starting ships per owned port. One central port begins neutral. Captains vote before play; each vote is one ticket in the server's map draw. With no votes, all three maps have equal odds.

## Classic

The original `server/board.json`, version `original-map-v2`, is unchanged. The source JPEG is untouched. See `BOARD_MAPPING.md` for the remaining review of the photo-derived harbor membership. Blackwater (port 7) starts neutral.

## The Choke

Two large seas meet at a three-hex-wide crossing. Six ports ring each sea, with neutral Northgate (port 12) on the crossing's northern bank. A small island in each bay divides local routes without adding another crossing. See `server/maps/narrows.json`, version `narrows-v7`.

Saved Choke matches using versions 2 through 6 retain their geometry in `narrows-v*.json`. New matches use version 7.

## Delta

Delta is a playable tracing of the supplied `Delta.png`, with 34 columns and 31 rows. A broad central sea wraps around a large northern peninsula and a southern coast. Small islands, island ports, and a narrow eastern channel create several approaches. Its 13 ports keep the image's numbers; Port 11, the nearest to the center, starts neutral.

The screenshot contains hand-drawn markup and an editor toolbar. Neither is terrain. The southern coast hidden under the toolbar is inferred from adjacent visible rows. Some port tiles are moved one hex toward their shore so each has at least two connected harbor hexes. The source PNG is untouched and is not a runtime asset. The playable file is `server/maps/delta.json`, version `delta-v1`. Serpent's Coil has been retired; its saved matches are no longer supported, as requested by the owner.

## Reproduce and verify

`python tools/create_alternate_maps.py` regenerates The Choke; `python tools/render_maps.py` renders map previews from the playable JSON (Pillow required). Delta's terrain was traced from the supplied screenshot and is reviewed directly in its JSON, not regenerated from the screenshot.

Automated checks cover connected sailing water and harbors, thirteen distinct ports, launch and spillover hexes, automatic fleets, balanced starting deals, perk and NPC placement, and server-authoritative map voting. The five-browser map scenario covers both alternate maps through voting, setup, sailing, synchronization, and restart.
