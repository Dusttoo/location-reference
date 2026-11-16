# Location Reference

A versioned, source-audited catalog of canonical localities. The first release covers the United States, the District of Columbia, Puerto Rico, and U.S. territories by reconciling official U.S. Census Bureau and USGS GNIS data.

The repository is designed as shared reference data, not as an autocomplete service. Consumers can vendor a pinned release, load the JSONL shards they need, or copy the static text lists.

## Current release

Release `2026-11-15` contains:

- 186,877 canonical records
- 176,176 active localities
- 32,363 Census places
- 154,514 additional GNIS populated-place records
- 101,639 aliases across 61,604 records
- 10,701 source-designated historical records retained as deprecated
- 33,791 Census ZIP Code Tabulation Areas (ZCTAs), separate from localities

In product language, a “city” can therefore include incorporated cities, towns, villages and equivalent legal entities; Census-designated places; and recognized unincorporated communities. The `kind` field preserves the distinction.

## Files

| Path | Purpose |
| --- | --- |
| [`catalog.json`](catalog.json) | Entry point and release metadata |
| [`data/us/manifest.json`](data/us/manifest.json) | U.S. totals and state/territory shard index |
| `data/us/admin1/*.jsonl` | One canonical locality per line, sharded by postal abbreviation |
| [`data/us/zctas.jsonl`](data/us/zctas.jsonl) | Five-digit Census ZCTA codes and representative points |
| [`lists/us-localities.txt`](lists/us-localities.txt) | Copy-friendly tab-separated active list: name, state, county, kind |
| [`lists/us-zctas.txt`](lists/us-zctas.txt) | Copy-friendly tab-separated ZCTA code and representative coordinates |
| [`sources/sources.json`](sources/sources.json) | Exact source URLs, dates, licenses and SHA-256 checksums |
| `releases/*.json` | Immutable release input/output checksums |
| `schema/*.schema.json` | JSON Schema contracts |

JSONL keeps large files streamable and makes state-level imports inexpensive. Every canonical record has a repository-owned `loc_…` identifier. Source identifiers live under `sourceMappings`, so future reconciliation does not change customer references or URLs.

## Record model

```json
{
  "id": "loc_…",
  "name": "Example",
  "slug": "example",
  "aliases": ["Example City"],
  "countryCode": "US",
  "admin1": { "code": "TX", "name": "Texas", "fips": "48" },
  "admin2": { "name": "Example", "fips": "001" },
  "kind": "incorporated-place",
  "status": "active",
  "searchTier": 1,
  "coordinates": { "latitude": 0, "longitude": 0, "source": "census" },
  "sourceMappings": {
    "census": { "geoid": "…", "ansiCode": "…", "lsad": "…", "functionalStatus": "…" },
    "gnis": [{ "featureId": "…" }]
  }
}
```

`searchTier` is a ranking hint, not a completeness filter:

1. Census incorporated and equivalent legal places
2. Census-designated places and equivalents
3. GNIS populated places not reconciled to a Census place

## ZIP area search layer

`data/us/manifest.json` points to the separate ZCTA JSONL file and its source.
A record looks like this:

```json
{"id":"us:zcta:00601","code":"00601","coordinates":{"latitude":18.180621,"longitude":-66.749931,"kind":"census-representative-point"},"sourceId":"census-zcta-2026"}
```

Treat `code` as a five-character string so leading zeroes survive. The points
are Census representative points for geographic areas delineated from 2020
blocks; they are not address coordinates or USPS ZIP delivery boundaries.
The 2026 Census file covers the 50 states, DC, and Puerto Rico, but omits the
other U.S. territories that have locality records here. Not every valid USPS
ZIP has a ZCTA. See the [Census ZCTA guidance](https://www.census.gov/programs-surveys/geography/guidance/geo-areas/zctas.html)
and [2026 Gazetteer notes](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2026.html).

For marketplace search, use a ZIP code only to select a ZCTA representative
point. Measure an approximate distance from that point to a breeder's chosen
locality point, keeping the breeder's public location and stored reference as
the locality. Label distances as approximate and include results near the
radius edge if the app cannot determine which side they fall on. If a five-digit
code is absent, offer city search; absence does not prove that the USPS ZIP is
invalid. This layer does not provide a preferred postal city or an exact
ZIP-to-locality relationship. A nearby city label requires a separately sourced
geographic relationship and should not be inferred from the nearest point.

County data comes from the GNIS feature point. It identifies that point’s county; it is not a complete list of every county intersected by a multi-county legal place.

## Source and reconciliation policy

1. Import the national Census Places Gazetteer as the canonical legal/statistical place layer.
2. Join GNIS Federal Codes to Census GEOIDs when an exact state and Census place code match exists.
3. Add geographically usable, unmatched GNIS populated places as canonical localities.
4. Attach GNIS variant names as aliases.
5. Keep source mappings separate from repository-owned stable IDs.
6. Retain retired records as `deprecated` or `merged`; never silently recycle an ID.
7. Pin source and generated-file checksums for every release.

The initial GNIS source includes 5,603 rows without a usable state or coordinate pair. They are counted in the manifest but cannot safely become canonical locality records. One duplicated current/vacated GNIS row is also counted and deduplicated by feature ID. See [`docs/research/2026-10-13-us-source-audit.md`](docs/research/2026-10-13-us-source-audit.md) for the complete audit.

## Rebuild and validate

Node.js 22 or newer and the system `unzip` command are required.

```sh
npm ci
npm run download:zctas
npm run import:us-zctas
npm test
git diff --exit-code
```

Downloads are intentionally ignored by Git. `npm run download:zctas` fetches and checksum-verifies the pinned Census file. Validation checks schemas, stable-ID uniqueness, source-key uniqueness, shard sorting and counts, both static lists, ZCTA code uniqueness and point bounds, and every current-release output checksum. The 2026-10-13 manifest describes the initial locality-only release; use its corresponding Git revision to retrieve those output files. A full locality rebuild additionally needs the original pinned GNIS downloads because the upstream GNIS URLs can change in place; `npm run download` will reject changed bytes.

## International expansion

The catalog, record schema, country manifests and repository-owned IDs are country-neutral. A future GeoNames importer can add country snapshots, populated-place/admin filtering, alternate names and `geonames:geoname_id` mappings without changing existing IDs. GeoNames attribution and its release license must ship with any such data.

The public OpenStreetMap Nominatim service is not a canonical source or an autocomplete backend for this project.

## Licensing

The U.S. government source data identified in [`sources/sources.json`](sources/sources.json) is public domain. Original scripts, schemas and documentation in this repository are released under the [MIT License](LICENSE). Source organizations do not endorse this project, and consumers should preserve source provenance when redistributing the data.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Changes to generated data must update the source manifest, regenerate the release, include a reviewed diff and pass all validation checks.
