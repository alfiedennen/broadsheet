# broadsheet â€” settings schema (`broadsheet.json`)

The canonical shape of the curation file. This is Layer 3 (per
`ARCHITECTURE.md`) â€” overrides applied to the discovered
domain model.

The file lives at `/data/broadsheet.json` inside the add-on container,
backed up automatically as part of HA snapshots via the `addon_config`
map.

---

## Top-level shape (v1)

```json
{
  "version": 1,
  "createdAt": "2026-05-13T20:14:00Z",
  "lastModifiedAt": "2026-06-01T08:42:11Z",

  "people": [],
  "floors": {},
  "areas": {},
  "entities": {},
  "labels": {},
  "pagePins": {},
  "pages": {},
  "voice": {},
  "paintings": {},
  "integrations": {},
  "plugins": {}
}
```

All keys are required at the top level (use empty `{}` / `[]` if no
overrides). `version` is the schema version; `createdAt` /
`lastModifiedAt` are ISO timestamps maintained by the sidecar API.

---

## `people`

Per-person presence-sensor picks + device class. Discovered persons
without overrides use the heuristic ranking from
`DISCOVERY-CONTRACT.md`.

```json
"people": [
  {
    "personId": "person.alfie_dennen",
    "presenceSensorId": "sensor.alfie_committed_room",
    "deviceClass": "android",
    "displayNameOverride": null
  },
  {
    "personId": "person.elena",
    "presenceSensorId": "sensor.elena_committed_room",
    "deviceClass": "ios",
    "displayNameOverride": "Elena"
  }
]
```

Fields:
- `personId` (required): HA's `person.X` entity_id
- `presenceSensorId` (required): the entity broadsheet should read
  for this person's location. Can be any `device_tracker.*`,
  `sensor.*`, or `person.*`. Set to `null` to keep heuristic default.
- `deviceClass` (required): `'android'` | `'ios'` | `'unknown'`.
  Affects warnings shown in Settings.
- `displayNameOverride` (optional): rename for display purposes only;
  HA's person name unchanged.

---

## `floors`

Per-floor overrides (when HA has floors configured). Keyed by
HA's `floor_id`.

```json
"floors": {
  "ground_floor": {
    "rename": "Downstairs",
    "iconOverride": "mdi:home-floor-g",
    "hidden": false,
    "navOrder": 1
  },
  "upstairs": {
    "rename": null,
    "iconOverride": null,
    "hidden": false,
    "navOrder": 2
  }
}
```

Fields (all optional):
- `rename`: display name override. `null` = use HA's floor name
- `iconOverride`: mdi: icon override
- `hidden`: hide entire floor (and its areas) from navigation
- `navOrder`: explicit ordering when nav surfaces floors

---

## `areas`

Per-area overrides. Keyed by HA's `area_id` (stable across renames).

```json
"areas": {
  "office": {
    "rename": "Studio",
    "iconOverride": "mdi:pencil",
    "hidden": false,
    "pageOrder": 1,
    "paintingOverride": null
  },
  "cellar": {
    "rename": null,
    "iconOverride": null,
    "hidden": true,
    "pageOrder": 99,
    "paintingOverride": null
  }
}
```

Fields (all optional):
- `rename`: display name override
- `iconOverride`: mdi: icon override
- `hidden`: hide area entirely
- `pageOrder`: explicit ordering within pages (lower = earlier)
- `paintingOverride`: filename in `/data/paintings/` to use instead
  of `<area-id>.png`

---

## `entities`

Per-entity overrides. Keyed by HA's `entity_id`.

```json
"entities": {
  "switch.office_plug": {
    "hidden": true,
    "warningLabel": "desk compute â€” DO NOT toggle",
    "rename": null,
    "iconOverride": null,
    "unhide": false
  },
  "light.0xa4c1381f9e9c73b2": {
    "hidden": false,
    "warningLabel": null,
    "rename": "Hallway Spot 1",
    "iconOverride": null,
    "unhide": false
  },
  "binary_sensor.network_uplink": {
    "hidden": false,
    "warningLabel": null,
    "rename": null,
    "iconOverride": null,
    "unhide": true
  }
}
```

Fields (all optional):
- `hidden`: user-set hide
- `unhide`: explicitly show entities HA's `hidden_by` would have hidden
  (e.g. integration thinks it's internal but user wants it visible)
- `warningLabel`: caution text shown next to controls (the office-plug
  pattern)
- `rename`: display name override
- `iconOverride`: mdi: icon override

---

## `labels`

Per-label overrides for orthogonal-tag styling and behaviour.

```json
"labels": {
  "critical": {
    "iconOverride": "mdi:alert-circle",
    "colorOverride": "#c08a4a",
    "hideEntitiesByDefault": false,
    "pinAllToPage": null
  },
  "christmas": {
    "iconOverride": "mdi:string-lights",
    "colorOverride": "#bf3a30",
    "hideEntitiesByDefault": true,
    "pinAllToPage": null
  }
}
```

Fields (all optional):
- `iconOverride`: mdi: icon override
- `colorOverride`: hex color override
- `hideEntitiesByDefault`: hide every entity carrying this label
- `pinAllToPage`: pin every entity carrying this label to a page slug

---

## `pagePins`

Force-pin specific entities to specific pages, regardless of their
domain or area. Map of entity_id â†’ page slug.

```json
"pagePins": {
  "switch.living_room_floor_lamp": "lights",
  "switch.fairy_lights_christmas": "lights",
  "input_boolean.movie_night": "tv"
}
```

Page slugs: `lights`, `heat`, `door`, `tv`, `body`, plus any
plugin-registered page slugs (e.g. `emanations`, `long-take`).

`null` value removes a pin: `{ "switch.X": null }` removes any prior
pin for that entity.

---

## `pages`

Per-page configuration: hide, reorder, custom title.

```json
"pages": {
  "lights": {
    "hidden": false,
    "navOrder": 1,
    "titleOverride": null
  },
  "tv": {
    "hidden": false,
    "navOrder": 4,
    "titleOverride": "Cinema"
  },
  "body": {
    "hidden": false,
    "navOrder": 6,
    "titleOverride": null
  }
}
```

Fields (all optional):
- `hidden`: hide page from navigation
- `navOrder`: explicit ordering in KebabNav
- `titleOverride`: page title override (also used in Eyebrow)

---

## `voice`

Editorial string overrides. Defaults ship in the SPA; users override
per-string. Variables in `{braces}` are interpolated by the renderer.

```json
"voice": {
  "manifest.empty": "The house is empty.",
  "manifest.oneHome": "{a} is home in the {room}.",
  "manifest.bothHomeSameRoom": "Both in the {room}.",
  "manifest.bothHomeDifferent": "{a} in the {a-room}, {b} in the {b-room}.",
  "lights.allOff": "Every light is off.",
  "lights.oneArea": "{area} is on. Everything else is dark.",
  "lights.multipleAreas": "{n} areas are on.",
  "heat.allFrost": "Every radiator at frost.",
  "heat.boostActive": "Boost on for {n} minutes.",
  "door.locked": "Locked.",
  "door.unlocked": "Unlocked.",
  "door.unlockedAt": "Unlocked at {time}."
}
```

Variables (defined by each string's renderer):
- `{a}` / `{b}`: person display names
- `{room}`, `{a-room}`, `{b-room}`: area display names
- `{area}`: single area
- `{n}`: count
- `{time}`: time string

Day 1 ships English defaults only. i18n is v0.2.

---

## `paintings`

Custom paintings per area, beyond the procedural ambient gradient
default.

```json
"paintings": {
  "office": {
    "default": "office.png",
    "alfie": "office.png",
    "elena": "office-elena.png",
    "both": null
  },
  "library": {
    "default": "library.png",
    "alfie": "library.png",
    "elena": "library-elena.png",
    "both": "library-both.png"
  }
}
```

Files live at `/data/paintings/<filename>` and are served via the
sidecar at `/local/broadsheet/paintings/<filename>`.

Fields (all optional, all filenames):
- `default`: shown when nobody specific is in this room (or when
  multi-person painting plugin not active)
- `alfie` / `elena` / `<personSlug>`: per-person variant when only
  that person is in the room
- `both` / `together`: variant when multiple people are in the room
  together (used by `@broadsheet/emanations` plugin)

When all values null, the procedural gradient default is used.

---

## `integrations`

Per-integration config that broadsheet's pages need.

```json
"integrations": {
  "tmdb": {
    "apiKey": null,
    "region": "GB",
    "enabledLenses": ["new", "trending"]
  },
  "healthConnect": {
    "platformDetected": true,
    "sleepStartHourUTC": 21,
    "sleepEndHourUTC": 9
  },
  "appleHealth": {
    "enabled": false
  }
}
```

`null` API keys mean the integration is detected-but-not-configured;
the page renders a graceful "add your TMDB key" inline prompt.

---

## `plugins`

Per-plugin enable/disable + plugin-specific config.

```json
"plugins": {
  "emanations": {
    "enabled": true,
    "config": {
      "fadeMs": 800,
      "splitOrientationOverride": null
    }
  },
  "ghost-cloud": {
    "enabled": false,
    "config": {
      "audioMutedByDefault": true,
      "binSizeSeconds": 30
    }
  },
  "tmdb-tv": {
    "enabled": false,
    "config": {}
  }
}
```

Each plugin's `config` shape is defined by the plugin itself (see
`RENDERER-CONTRACT.md`). broadsheet treats it as opaque.

---

## Schema versioning + migration

`version: 1` is the current schema. The migration pattern:

```ts
// src/lib/curation/migrate.ts

const MIGRATIONS: Record<number, (input: any) => any> = {
  // v1 â†’ v2 (hypothetical example)
  1: (v1) => ({
    ...v1,
    version: 2,
    // new field added in v2
    appearance: { theme: 'editorial', density: 'comfortable' },
    // migrate old field to new shape
    paintings: Object.fromEntries(
      Object.entries(v1.paintings).map(([k, v]) => [k, { ...v, source: 'static' }])
    ),
  }),
};

export function migrate(raw: any): Curation {
  let current = raw;
  while (current.version < CURRENT_VERSION) {
    const migrator = MIGRATIONS[current.version];
    if (!migrator) throw new Error(`No migrator for v${current.version}`);
    current = migrator(current);
  }
  return current;
}
```

Migrations are forward-only (no downgrade path). The sidecar runs
migration on every load + writes back the migrated file. If
migration fails, the sidecar:
1. Backs up the original to `broadsheet.json.v<X>.bak`
2. Writes a fresh default `broadsheet.json` at current version
3. Logs a warning surfaced in `/settings/about` ("Your config was
   from an older broadsheet version; we couldn't migrate it. Original
   backed up at broadsheet.json.v1.bak.")

---

## Reads + writes

### Read flow

1. SPA boots
2. Hits `GET /api/broadsheet/curation` (the sidecar)
3. Sidecar reads `/data/broadsheet.json`, migrates if needed, returns
   the current-version JSON
4. SPA hydrates `curation` reactive store

### Write flow (Settings UI changes)

1. User changes a setting (e.g. hides an entity)
2. SPA optimistically updates `curation` store + page re-renders
3. SPA fires `PUT /api/broadsheet/curation` with the full new JSON
4. Sidecar validates shape (`version` matches, top-level keys present),
   writes to `/data/broadsheet.json`, returns 200
5. On 200: SPA shows "Saved" toast (1s)
6. On 400/500: SPA reverts the optimistic update + shows error toast
   ("Couldn't save â€” try again?")

The PUT body is the entire JSON, not a patch. The file is small
(<100KB even for hundreds of entities) so this is fine and avoids
patch-merge edge cases.

---

## Validation

Sidecar enforces minimal validation:

```python
# sidecar.py (extract)
@routes.put('/curation')
async def put_curation(request):
    body = await request.json()
    if not isinstance(body, dict):
        return web.json_response({'error': 'must be object'}, status=400)
    if body.get('version') != CURRENT_SCHEMA_VERSION:
        return web.json_response({'error': f'version must be {CURRENT_SCHEMA_VERSION}'}, status=400)
    required_keys = {'people', 'floors', 'areas', 'entities', 'labels',
                     'pagePins', 'pages', 'voice', 'paintings',
                     'integrations', 'plugins'}
    missing = required_keys - body.keys()
    if missing:
        return web.json_response({'error': f'missing keys: {sorted(missing)}'}, status=400)
    # Update lastModifiedAt
    body['lastModifiedAt'] = datetime.utcnow().isoformat() + 'Z'
    # Atomic write
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(body, indent=2))
    tmp.replace(path)
    return web.json_response({'ok': True})
```

Deeper validation (per-key shape) happens in the SPA before writing.
The sidecar trusts the SPA on inner shapes â€” it just enforces the
top-level contract. Defence-in-depth: if a user hand-edits the file
into an invalid inner shape, the SPA refuses to load it and surfaces
a "config invalid, edit to fix" message in `/settings/about` instead
of crashing.

---

## File-fallback editing

Power users can edit `/data/broadsheet.json` directly â€” that's the
file's whole point. The discipline:

1. SPA reads on every load. Restart not needed for changes (the
   sidecar can serve fresh reads on every PUT â€” but to pick up
   external file changes the SPA needs a refresh.)
2. Manual edits should preserve the schema (the structure above).
3. The sidecar never touches a file it didn't write itself except on
   read; manual edits between writes are preserved.
4. The Settings UI is "thin client over the file" â€” it always wins
   on writes (last-write-wins), but it also always reads fresh.

If users edit the file while the SPA is open, their changes are
reverted on the next Settings UI write. Document this in
`/settings/about`: "Editing the file directly? Refresh the SPA to
pick up your changes, then make any UI changes after that."

---

## Defaults â€” what an empty `broadsheet.json` looks like

Created on first add-on boot if none exists:

```json
{
  "version": 1,
  "createdAt": "<now>",
  "lastModifiedAt": "<now>",

  "people": [],
  "floors": {},
  "areas": {},
  "entities": {},
  "labels": {},
  "pagePins": {},
  "pages": {},
  "voice": {},
  "paintings": {},
  "integrations": {
    "tmdb": { "apiKey": null, "region": "GB", "enabledLenses": ["new", "trending"] },
    "healthConnect": { "platformDetected": false, "sleepStartHourUTC": 21, "sleepEndHourUTC": 9 },
    "appleHealth": { "enabled": false }
  },
  "plugins": {
    "emanations": { "enabled": false, "config": {} },
    "ghost-cloud": { "enabled": false, "config": {} },
    "tmdb-tv": { "enabled": false, "config": {} }
  }
}
```

All overrides empty = pure discovery, no curation. The SPA shows
sensible defaults immediately on first paint.

---

## Size + persistence considerations

- Typical mature broadsheet.json: ~10-30KB
- Heavy curation (200+ entities, 50+ overrides): ~80-150KB
- HA's `addon_config` snapshots are gzipped + included in HA backups
- No size cap hard-coded, but warn at >500KB ("your curation is
  unusual â€” open an issue if this is intentional")

Backups:
- HA's snapshot system covers `/data/` automatically
- Settings UI's "Export current config" downloads the JSON for
  off-machine backup
- "Reset all curation to discovery defaults" wipes the file but
  saves a `broadsheet.json.reset-<timestamp>.bak` copy first

---

## Privacy considerations

`broadsheet.json` can contain:
- Person names + presence sensor IDs
- TMDB API key
- Voice strings the user wrote (could contain personal phrasing)
- Painting filenames

It does NOT contain:
- HA tokens or credentials (those live in env vars / Supervisor)
- Entity states (live data, never persisted)
- Service-call history

When generating support bundles for bug reports, the sidecar
scrubs the TMDB key and replaces person/sensor IDs with anonymised
tokens (`person.alfie_dennen` â†’ `person.user_a`). Voice strings stay
unmodified â€” the user has to choose to redact them if they're
sensitive.
