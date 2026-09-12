# The eight captains

The owner's supplied portraits are installed from `Characters/`. The default
server catalog uses the exact names below, with stable IDs for existing saves.

| Saved ID | Character | Web portrait |
| --- | --- | --- |
| navigator | Alex the Merciless | alex-the-merciless.jpg |
| corsair | Alyssa the Sea Witch | alyssa-the-witch.jpg |
| privateer | Dylan the Salty Dog | dylan-the-salty-dog.jpg |
| buccaneer | Hayven the Merchant | hayven-the-merchant.jpg |
| captain-5 | Jacob the Vengeful | jacob-the-vengeful.jpg |
| captain-6 | Jared the Oil Baron | jared-the-oil-baron.jpg |
| captain-7 | Josh the Phantom | josh-the-phantom.jpg |
| captain-8 | Steven the Cruel | steven-the-cruel.jpg |

Joining requires a name and an explicit choice of both character and color.
Neither is preselected. Each character and color can be claimed once per lobby;
the server checks simultaneous claims atomically. Taken choices identify their
owner and cannot be selected. Leaving the lobby releases both; refreshing,
disconnecting, or restarting preserves them. Characters grant no perks.

Existing saved seats keep their IDs and choices, including any shared profiles
from the former rules. Use the game controller's empty-lobby reset if that crew
wants to choose afresh. A rematch retaining seats retains their choices.

## Preparing the supplied images

Alyssa's source file is `Alyssa the Sea Witch.png`; her existing web portrait
filename remains unchanged after the display-name correction.

Run `python tools/prepare_characters.py` with Pillow installed. On this local
workspace, `.tools/python/python.exe tools/prepare_characters.py` is available.
The script reads all eight original PNG/JPEG files and writes optimized JPEGs,
at most 640 by 800 pixels, under `server/wwwroot/characters/`. Originals remain
intact. The site serves the copies at `/characters/`; Vite proxies that path to
the API during development. Missing images fall back to a named compass.

The owner approved the eight optimized web JPEGs for public distribution on
September 11. They are included in Git and release builds, so a fresh checkout
can serve every portrait. The original `Characters/` folder remains Git-ignored
and untouched. Release publishing with `RequireReleaseAssets=true` rejects a
missing portrait. Everyone with access to the game can view the names/photos.

## Optional local overrides

`server/characters.local.json` still overrides the default catalog. It must list
all eight stable IDs, names up to 40 characters, and optional image paths using
`/characters/filename.jpg` or `.jpeg` (letters, digits, hyphens, underscores).
For example, an entry is:

```json
{ "id": "navigator", "name": "Alex the Merciless", "imageUrl": "/characters/alex-the-merciless.jpg" }
```

The override file stays Git-ignored and is excluded from automatic publish;
copy it beside the deployed server DLL if using custom overrides. Restart the
server and reload clients after changing the catalog.
