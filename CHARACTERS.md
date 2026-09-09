# Eight personal profiles

The server offers eight cosmetic profiles. Until names/photos are supplied, they
show as Captain 1–8 with a compass placeholder. Profiles do not grant perks and
can be shared by players. Old saved character IDs remain valid.

Create `server/characters.local.json` using this structure, replacing the names
and adding an optional JPEG path for each portrait:

```json
[
  { "id": "navigator", "name": "Captain 1", "imageUrl": "/characters/navigator.jpg" },
  { "id": "corsair", "name": "Captain 2", "imageUrl": null },
  { "id": "privateer", "name": "Captain 3", "imageUrl": null },
  { "id": "buccaneer", "name": "Captain 4", "imageUrl": null },
  { "id": "captain-5", "name": "Captain 5", "imageUrl": null },
  { "id": "captain-6", "name": "Captain 6", "imageUrl": null },
  { "id": "captain-7", "name": "Captain 7", "imageUrl": null },
  { "id": "captain-8", "name": "Captain 8", "imageUrl": null }
]
```

Put JPEGs under `server/wwwroot/characters/` (for example `navigator.jpg`). Names
may contain up to 40 characters. Image filenames use letters, digits, hyphens,
or underscores and `.jpg`/`.jpeg`. Keep all eight stable IDs. Restart the server
after changing the catalog; reload clients to refresh it. Missing images fall
back to a compass. Portraits appear in the selection grid and captain cards.

The local catalog and personal photos are Git-ignored and excluded from automatic
publish output. For a deployed build, copy the catalog next to the server DLL and
copy portraits into that deployment's `wwwroot/characters/` directory separately.
Everyone able to access the game can view its profile names and photos.
