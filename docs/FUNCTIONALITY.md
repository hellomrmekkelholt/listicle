# Functionality

Global API prefix: **`/api/v1`**. Swagger UI: **`/api/docs`**. Validation: global `ValidationPipe` with `transform: true` (`src/main.ts`).

## `GET /api/v1/health`

- **HTTP:** Always **200**.
- **Body:** `status` (`ok` \| `degraded`), `database` (`ok` \| `down`), `opensearch` (`ok` \| `down - OpenSearch is down` \| `down - resource not found`), `timestamp` (ISO-8601).
- **DB:** `select 1` via MikroORM.
- **OpenSearch:** checks `GET /_cluster/health` and then `HEAD /{OPENSEARCH_INDEX_NEXT_EXTERNAL}` using `OPENSEARCH_NODE` plus optional basic auth from `OPENSEARCH_USERNAME` / `OPENSEARCH_PASSWORD`.
- **Overall status:** `ok` only when both `database` and `opensearch` are `ok`; otherwise `degraded`.
- **When OpenSearch disabled/unreachable:** `opensearch` is `down - OpenSearch is down`.
- **When index missing:** `opensearch` is `down - resource not found`.

## `POST /api/v1/next` (Phase 3.1 + 3B + IMMEDIA channel)

- **HTTP:** Always **200** (success payload or soft failure).
- **Validation:** Malformed body / failed `class-validator` rules → **400** (unchanged).

### Request (`NextRequestDto`)

| Field | Notes |
|-------|--------|
| `contentType` | Root item: `channel` \| `aidj` \| `audiobook` |
| `id` | UUID; for `channel`, must match `channel_entity.id` |
| `meta` | Object (opaque). IMM_AIP Branch A uses optional `recommendTrackId`. IMMEDIA channel supports filters `explicit` (bool), `news` (bool), `traffic` (bool), `isPremium` (bool), `location` (UUID), `brands` (UUID), `thumbsDown` (UUID[]). |
| `previousContent` | Array of items with the same three fields. IMM_AIP Branch B reads `nextBucketId` from latest same-channel `previousContent[].meta.nextBucketId` and excludes recent same-channel `trackId` values (`IMM_AIP_COUNTED_TRACKS` window). IMMEDIA reads the latest same-channel `previousContent[].meta.trackId` as cursor for next-rank progression. |

### Success response (`NextResponseDto`)

| Field | Notes |
|-------|--------|
| `contentType` | Echoes request `contentType` (or always `channel` on channel path) |
| `id` | Echoes request `id` |
| `trackName`, `subTitle`, `url`, `artworkUrl` | Non-`channel`: hardcoded fruit prototype. External providers: `trackName` from `meta.trackName`, `subTitle` from OpenSearch `channelName`, `url` from `meta.trackUrl`, `artworkUrl` from `meta.artworkUrl`. IMM_AIP/IMMEDIA: `trackName`/`url` from `track_entity`, `artworkUrl` from `channel_entity.artwork_url`. |
| `meta` | External providers return `{ artist, duration, skipType: "NON_SKIPABLE" }`. IMM_AIP returns `{ trackId, nextBucketId, artist, duration, skipType: "SKIPABLE" }`. IMMEDIA returns `{ trackId, artist, duration, skipType: "SKIPABLE" }`. |

### Soft failure response (`NextErrorResponseDto`)

Minimal body only:

- `{ "status": "failed", "message": "id not found" }` — no row for `channel` + `id`
- `{ "status": "failed", "message": "unsupported provider" }` — row exists but normalized `provider_entity.name` is not one of: `IHEARTMUSIC`, `SIRIUSXM`, `TUNEIN`, `IMM_AIP`, `IMMEDIA`
- `{ "status": "failed", "message": "no content available" }` — supported external provider but no valid OpenSearch track snapshot found
- IMM_AIP detailed failures:
  - `{ "status": "failed", "message": "recommend track not in playlist" }`
  - `{ "status": "failed", "message": "missing nextBucketId" }`
  - `{ "status": "failed", "message": "invalid nextBucketId" }`
  - Branch A graph / playlist mismatches:
    - `{ "status": "failed", "message": "playlist bucket_type_id missing for recommend track (IMM_AIP branch A)" }`
    - `{ "status": "failed", "message": "no bucket graph node matches playlist bucket_type_id (IMM_AIP branch A)" }`
    - `{ "status": "failed", "message": "bucket graph next_bucket_id is null (IMM_AIP branch A)" }`
    - `{ "status": "failed", "message": "bucket graph next_bucket_id does not match any bucket_id (IMM_AIP branch A)" }`
  - `{ "status": "failed", "message": "no tracks for bucket type" }`
  - `{ "status": "failed", "message": "track not found" }`

### Behaviour summary

1. **`contentType` ≠ `channel`:** no DB read; fruit-themed hardcoded `NextResponseDto`; `meta` is an empty object.
2. **`contentType` === `channel`:** SQL join `channel_entity` → `provider_entity`; normalize provider name and route by provider.
3. **Supported external provider:** query OpenSearch by channel `id` only (index set by `OPENSEARCH_INDEX_NEXT_EXTERNAL`, e.g. `now_playing_service_v1`) and map response as:
   - `trackName <- meta.trackName`
   - `subTitle <- channelName`
   - `url <- meta.trackUrl`
   - `artworkUrl <- meta.artworkUrl`
   - `meta <- { artist: meta.artistName, duration: meta.duration, skipType: "NON_SKIPABLE" }`
4. **OpenSearch miss/invalid track:** return soft-fail `no content available`.
5. **IMM_AIP Branch A (first play):** use `meta.recommendTrackId`, find playlist `bucket_type_id`, traverse buckets (`nextBucketType` match, then second-hop `bucketId`), return recommend track with derived `nextBucketId`. `channel_entity.buckets` may be stored as a top-level `[{bucketId,...}]` array or `{ "buckets": [...] }`; both shapes are parsed.
6. **IMM_AIP Branch B (continued):** read `nextBucketId` from latest same-channel `previousContent[].meta.nextBucketId`, resolve bucket + `nextBucketType`, pick random playlist track for that bucket type while excluding recent same-channel `previousContent[].meta.trackId` values (last `IMM_AIP_COUNTED_TRACKS`), return new `nextBucketId` (nullable for terminal).
7. **IMMEDIA channel:** read filters from request `meta`, build filtered playlist from `play_list_entity` + `track_entity`, and use latest same-channel `previousContent[].meta.trackId` as cursor:
   - when cursor track is found in channel playlist: choose next filtered track by ascending `rank`, with wraparound to smallest rank
   - when no previous same-channel cursor exists: choose random filtered track
   - when cursor track is not found in channel playlist: choose random filtered track
   Location/brand filters use UUID equality on join tables (`track_entity_locations.location_entity_id`, `track_entity_brands.brand_entity_id`).

### Flow diagrams (`/next` channel providers)

These diagrams cover the three **channel** provider paths after shared entry steps:

1. Request passes validation (`ValidationPipe`); invalid body → **400**.
2. `contentType` must be `channel` (non-channel paths return hardcoded prototypes; not shown below).
3. `channel_entity` joined to `provider_entity` by `request.id`; missing row → **200** `id not found`.
4. `provider_entity.name` is uppercased and routed to one of the flows below; anything else → **200** `unsupported provider`.

Implementation: `src/modules/next/next.service.ts`.

#### 1. External providers (`IHEARTMUSIC`, `SIRIUSXM`, `TUNEIN`)

`request.meta` and `previousContent` are **not** used. Track data comes from OpenSearch only ([`NextOpenSearchService`](../src/modules/next/next-opensearch.service.ts)).

```mermaid
flowchart TD
  Entry([External provider path]) --> Enabled{OPENSEARCH_ENABLED === true?}
  Enabled -->|No| FailOs["HTTP 200 failed<br/>no content available"]
  Enabled -->|Yes| Search[(POST OpenSearch _search<br/>index: OPENSEARCH_INDEX_NEXT_EXTERNAL<br/>term query: id = channel UUID<br/>OPENSEARCH_NODE + optional basic auth)]
  Search --> HttpOk{HTTP OK?}
  HttpOk -->|No| FailOs
  HttpOk -->|Yes| Valid{Document has channelName,<br/>meta.trackName, meta.trackUrl?}
  Valid -->|No| FailOs
  Valid -->|Yes| Map[Map NextResponseDto<br/>trackName ← meta.trackName<br/>subTitle ← channelName<br/>url ← meta.trackUrl<br/>artworkUrl ← meta.artworkUrl or default<br/>meta.artist ← meta.artistName<br/>meta.duration ← meta.duration<br/>skipType NON_SKIPABLE]
  Map --> Success[HTTP 200 NextResponseDto]
```

#### 2. IMMEDIA

Filters are read from `request.meta`. Progression uses the **latest** same-channel entry in `previousContent` (`contentType === channel` and `id` matches) → `meta.trackId` as cursor.

| `meta` key | Default | Effect |
|------------|---------|--------|
| `explicit` | `true` | When `false`, exclude explicit tracks |
| `news` | `true` | When `false`, exclude `track_type = news` |
| `traffic` | `true` | When `false`, exclude `track_type = traffic` |
| `isPremium` | `false` | When `true`, exclude `oem_ad` and `ad` track types |
| `location` | — | UUID; include tracks with no location rows or matching `track_entity_locations` |
| `brands` | — | UUID; include tracks with no brand rows or matching `track_entity_brands` |
| `thumbsDown` | `[]` | UUID[]; exclude listed `track_entity.id` values |

```mermaid
flowchart TD
  Entry([IMMEDIA provider path]) --> Meta[Parse request.meta filters]
  Meta --> Prev[Latest same-channel previousContent<br/>→ meta.trackId cursor or null]
  Prev --> Filter[(CTE: play_list_entity + track_entity<br/>apply filters above)]
  Filter --> Cursor{cursor trackId set?}
  Cursor -->|No| Rand[ORDER BY random LIMIT 1]
  Cursor -->|Yes| Rank[ORDER BY:<br/>if cursor not in filtered set → random<br/>else next rank after cursor<br/>else wrap to smallest rank]
  Rand --> Sel{Row selected?}
  Rank --> Sel
  Sel -->|No| FailNone["HTTP 200 failed<br/>no content available"]
  Sel -->|Yes| Resp[HTTP 200 NextResponseDto<br/>trackName url from track_entity<br/>subTitle ← artist<br/>artworkUrl ← channel_entity.artwork_url<br/>meta: trackId artist duration<br/>skipType SKIPABLE]
```

#### 3. IMM_AIP

Uses `channel_entity.buckets` (top-level JSON array or `{ "buckets": [...] }`), `play_list_entity`, and `track_entity`.

- **Branch A (first play):** `request.meta.recommendTrackId` is a valid UUID (`track_entity.id`, not `service_track_id`).
- **Branch B (continuation):** no `recommendTrackId`; requires `nextBucketId` from the latest same-channel `previousContent` entry.

- **Relevant .env variables**
```code
IMM_AIP_COUNTED_TRACKS=3 // The number of tracks to check in the users history i.e. previousContent attribute
IMM_AIP_PROVIDER_ID=8de7f839-6038-4e4a-9bd2-473a671b08bf //The UUID of IMM_AIP provider
```

```mermaid
flowchart TD
  Entry([IMM_AIP provider path]) --> Graph[Parse channel_entity.buckets graph]
  Graph --> Branch{meta.recommendTrackId<br/>valid UUID?}

  Branch -->|Yes — Branch A| A1[(play_list_entity:<br/>channel_id + recommendTrackId)]
  A1 --> A1a{Row in playlist?}
  A1a -->|No| FA1["failed: recommend track not in playlist"]
  A1a -->|Yes| A1b{bucket_type_id set?}
  A1b -->|No| FA2["failed: playlist bucket_type_id missing for recommend track (IMM_AIP branch A)"]
  A1b -->|Yes| A2[Pick random graph node where<br/>nextBucketType === bucket_type_id]
  A2 --> A2a{Any match?}
  A2a -->|No| FA3["failed: no bucket graph node matches playlist bucket_type_id (IMM_AIP branch A)"]
  A2a -->|Yes| A3{firstHop.nextBucketId<br/>non-null?}
  A3 -->|No| FA4["failed: bucket graph next_bucket_id is null (IMM_AIP branch A)"]
  A3 -->|Yes| A4[Second hop: node where<br/>bucketId === firstHop.nextBucketId]
  A4 --> A4a{Second hop found?}
  A4a -->|No| FA5["failed: bucket graph next_bucket_id does not match any bucket_id (IMM_AIP branch A)"]
  A4a -->|Yes| A5[(track_entity by recommendTrackId)]
  A5 --> A5a{Track exists?}
  A5a -->|No| FT["failed: track not found"]
  A5a -->|Yes| AOK[HTTP 200 NextResponseDto<br/>return recommend track<br/>nextBucketId = secondHop.nextBucketId<br/>skipType SKIPABLE]

  Branch -->|No — Branch B| B1[Latest same-channel previousContent<br/>→ meta.nextBucketId]
  B1 --> B1a{nextBucketId present?}
  B1a -->|No| FB1["failed: missing nextBucketId"]
  B1a -->|Yes| B2[Graph node where bucketId === nextBucketId]
  B2 --> B2a{Node in graph?}
  B2a -->|No| FB2["failed: invalid nextBucketId"]
  B2a -->|Yes| B3[Random play_list_entity row for<br/>node.nextBucketType<br/>exclude trackIds from last N<br/>same-channel previousContent entries<br/>N = IMM_AIP_COUNTED_TRACKS default 10]
  B3 --> B3a{Playlist row found?}
  B3a -->|No| FB3["failed: no tracks for bucket type"]
  B3a -->|Yes| B4[(track_entity by playlist track_id)]
  B4 --> B4a{Track exists?}
  B4a -->|No| FT
  B4a -->|Yes| BOK[HTTP 200 NextResponseDto<br/>nextBucketId = node.nextBucketId may be null<br/>skipType SKIPABLE]

  FA1 --> Fail[HTTP 200 NextErrorResponseDto]
  FA2 --> Fail
  FA3 --> Fail
  FA4 --> Fail
  FA5 --> Fail
  FT --> Fail
  FB1 --> Fail
  FB2 --> Fail
  FB3 --> Fail
```

### QA test matrix (`/next`)

| Case | contentType | Channel Id | Provider | Meta values | previousContent | Expected |
|------|-------------|------------|----------|-------------|-----------------|----------|
| External success 1 | `channel` | `bc212eda-8ff0-4d8e-8e4f-4af98b0d463b` | `IHEARTMUSIC` | `{}` | `[]` | 200 success, track from OpenSearch |
| External success 2 | `channel` | `92503af0-3ff0-4910-92c5-15ff44924bf3` | `SIRIUSXM` | `{}` | `[]` | 200 success, track from OpenSearch |
| External success 3 | `channel` | `bee5c48c-d1be-494f-9d97-95de8d5a6b5c` | `TUNEIN` | `{}` | `[]` | 200 success, track from OpenSearch |
| External no content | `channel` | any valid external channel UUID | `IHEARTMUSIC` / `SIRIUSXM` / `TUNEIN` | `{}` | `[]` | 200 `{ "status": "failed", "message": "no content available" }` |
| Channel not found | `channel` | `00000000-0000-0000-0000-000000000000` | n/a | `{}` | `[]` | 200 `{ "status": "failed", "message": "id not found" }` |
| Unsupported provider | `channel` | existing UUID with non-supported provider | not in allowed provider set | `{}` | `[]` | 200 `{ "status": "failed", "message": "unsupported provider" }` |
| Non-channel prototype | `aidj` (or `audiobook`) | any UUID | n/a | `{}` | `[]` | 200 prototype response path |
| Validation failure | `channel` | `not-a-uuid` | n/a | `{}` | `[]` | 400 validation error |

## `POST /api/v1/search`

- **HTTP:** **200** on success.
- **Validation:** Malformed body / failed `class-validator` rules → **400**.

### Request (`SearchRequestDto`)

| Field | Notes |
|-------|--------|
| `contentTypes` | Non-empty array; each item is one of `channel` \| `aidj` \| `audiobook` |
| `query` | Required non-empty string (trimmed before validation) used for case-insensitive matching |

### Response (`SearchResponseDto`)

| Field | Notes |
|-------|--------|
| `results` | Array of `SearchResultItemDto` |

Each result item contains:

- `contentType`: `channel` \| `aidj` \| `audiobook`
- `id`: UUID
- `name`: Display name
- `url`: stream/detail URL
- `genres`: array of `{ genreId }` where `genreId` can be numeric or UUID-shaped string based on source data
- `meta`: object

### Behaviour summary

1. If `contentTypes` includes `channel`, the service queries `channel_entity` where `name ilike %query%`, `deleted_at is null`, ordered by `rank`, `name`, and limited to 25 rows.
2. Channel genres are mapped from `channel_entity_genres`.
3. If `contentTypes` includes `aidj`, one hardcoded prototype result is appended.
4. If `contentTypes` includes `audiobook`, one hardcoded prototype result is appended.
5. Empty/whitespace-only `query` fails validation (400).

Seeded external provider fixtures in `src/modules/next/scripts/seed-external-opensearch.ts`:

- `IHEARTMUSIC`: `bc212eda-8ff0-4d8e-8e4f-4af98b0d463b`, `af58bf00-73c0-40fe-999d-990e8cfa78bc`, `56850567-e1e1-4e7b-b47c-32db522c6584`, `474a3099-4a77-443e-b8e0-6f9a154057b9`
- `SIRIUSXM`: `92503af0-3ff0-4910-92c5-15ff44924bf3`, `23e56cef-2a32-41cf-a6ed-47aa52071f8f`, `8bdd19c6-6744-4352-933d-462f6e1fe90b`, `3639bbb0-0040-4f2c-9053-4af4dd8b2631`
- `TUNEIN`: `bee5c48c-d1be-494f-9d97-95de8d5a6b5c`, `1c5fb463-71d3-4f2d-a2ec-00980d37736b`, `4a54e8c6-8c61-4f04-b420-d6425827f4c3`, `1200a870-5815-485e-9c6e-f907a2296145`

## Quick curl

```bash
curl -sS "http://localhost:${PORT:-3000}/api/v1/health"
```

```bash
curl -sS -X POST "http://localhost:${PORT:-3000}/api/v1/next" \
  -H "Content-Type: application/json" \
  -d '{"contentType":"channel","id":"550e8400-e29b-41d4-a716-446655440000","meta":{},"previousContent":[]}'
```

```bash
curl -sS -X POST "http://localhost:${PORT:-3000}/api/v1/next" \
  -H "Content-Type: application/json" \
  -d '{"contentType":"aidj","id":"550e8400-e29b-41d4-a716-446655440000","meta":{},"previousContent":[]}'
```
