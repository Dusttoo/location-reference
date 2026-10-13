# U.S. locality source audit — 2026-10-13

## Decision

The U.S. catalog uses the U.S. Census Bureau Places Gazetteer as the primary legal/statistical place layer and USGS GNIS Populated Places as the supplemental small, rural and unincorporated-community layer. GNIS Federal Codes provide exact Census reconciliation evidence; GNIS All Names provides aliases.

This avoids treating any existing application database or general-purpose city list as authoritative.

## Pinned inputs

| Input | Published | Rows | SHA-256 |
| --- | --- | ---: | --- |
| 2026 National Places Gazetteer | 2026-09-08 | 32,363 | `af678e2d990827c89ee39b98c82de6e90b693c7361ff0e559ae3076670dd2863` |
| GNIS National Populated Places | 2026-09-02 | 190,923 | `919fac887628b8547ec1b24fae319522a9481a56909c3914d1e0a2b56783147c` |
| GNIS National Federal Codes | 2026-09-02 | 200,513 | `9b370cfccf88ef511fac55f0d16d6dcba626fb4257fe0ffa5c17b5704e2a5dbd` |
| GNIS National All Names | 2026-09-30 | 1,249,721 | `a0daf05115eec3636353317fc4af81ce54f81b32eeda11cb5d9d6d2c5ef22c15` |

The machine-readable source URLs, retrieval dates and licensing declarations are in `sources/sources.json`.

## Reconciliation results

- 32,363 Census place records were imported.
- 185,319 unique, geographically usable GNIS populated-place feature IDs were processed.
- 30,491 Census records received one or more exact GNIS mappings.
- 154,514 unmatched GNIS features became additional canonical records.
- 101,639 distinct aliases were attached to 61,604 records.
- 10,701 geographically usable GNIS features explicitly ending in `(historical)` were retained with `deprecated` status.
- 5,603 GNIS rows lacked a usable state or coordinate pair and were excluded from canonical records.
- One GNIS feature appeared twice as current and vacated source rows and was deduplicated by feature ID.

The release contains 186,877 canonical records total, of which 176,176 are active.

## Known boundaries

- GNIS is a names-and-points system, not a boundary dataset. A recorded county is the county containing the feature point and is not necessarily exhaustive for a place crossing county lines.
- A GNIS name is evidence that the named feature exists in the federal names system; it is not evidence of municipal incorporation, current population or postal acceptability.
- Historical GNIS names are retained for durable references but excluded from the active copy list and ordinary search results.
- Source rows without sufficient geography remain auditable counts rather than being guessed into a state.
- Search tiers express preferred ranking only. Applications should still match aliases and allow users to select tier-three communities.

## International path

GeoNames country snapshots are the planned international layer. Imports should be filtered to populated places and relevant administrative divisions, carry GeoNames attribution, preserve alternate names, and map `geoname_id` separately from the stable internal ID. Each country should receive its own reviewed reconciliation policy and audit before publication.
