# Location Reference

A versioned, source-audited catalog of canonical localities. The first release covers the United States, the District of Columbia, Puerto Rico, and U.S. territories by reconciling official U.S. Census Bureau and USGS GNIS data.

The repository is designed as shared reference data, not as an autocomplete service. Consumers can vendor a pinned release, load the JSONL shards they need, or copy the static text list.

## Current release

Release `2026-10-13` contains:

- 186,877 canonical records
- 176,176 active localities
- 32,363 Census places
- 154,514 additional GNIS populated-place records
- 101,639 aliases across 61,604 records
- 10,701 source-designated historical records retained as deprecated

In product language, a “city” can therefore include incorporated cities, towns, villages and equivalent legal entities; Census-designated places; and recognized unincorporated communities. The `kind` field preserves the distinction.

## Files

| Path | Purpose |
| --- | --- |
| [`catalog.json`](catalog.json) | Entry point and release metadata |
| [`data/us/manifest.json`](data/us/manifest.json) | U.S. totals and state/territory shard index |
| `data/us/admin1/*.jsonl` | One canonical locality per line, sharded by postal abbreviation |
| [`lists/us-localities.txt`](lists/us-localities.txt) | Copy-friendly tab-separated active list: name, state, county, kind |
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
npm run download
npm run import:us
npm test
git diff --exit-code
```

Downloads are intentionally ignored by Git. `npm run download` accepts a file only when its SHA-256 checksum matches the pinned manifest. Validation checks schemas, stable-ID uniqueness, source-key uniqueness, shard sorting and counts, the static list, and every release output checksum.

## International expansion

The catalog, record schema, country manifests and repository-owned IDs are country-neutral. A future GeoNames importer can add country snapshots, populated-place/admin filtering, alternate names and `geonames:geoname_id` mappings without changing existing IDs. GeoNames attribution and its release license must ship with any such data.

The public OpenStreetMap Nominatim service is not a canonical source or an autocomplete backend for this project.

## Licensing

The U.S. government source data identified in [`sources/sources.json`](sources/sources.json) is public domain. Original scripts, schemas and documentation in this repository are released under the [MIT License](LICENSE). Source organizations do not endorse this project, and consumers should preserve source provenance when redistributing the data.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Changes to generated data must update the source manifest, regenerate the release, include a reviewed diff and pass all validation checks.
