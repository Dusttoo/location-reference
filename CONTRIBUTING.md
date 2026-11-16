# Contributing

Location changes need traceable evidence. Do not edit generated JSONL or text lists by hand.

## Updating a release

1. Update `sources/sources.json` with official URLs, publication/retrieval dates, licenses and verified SHA-256 checksums.
2. Update the release date and importer only when the source or reconciliation policy requires it.
3. Run the complete rebuild documented in the README.
4. Review record additions, removals, merges, deprecations, aliases, source-mapping changes and ZCTA code changes.
5. Add a dated research note when coverage or reconciliation policy changes.
6. Update `CHANGELOG.md` and commit generated outputs with the code that produced them.

Stable `loc_…` IDs must never be reassigned. A locality that disappears from a source remains as `deprecated`; a confirmed consolidation remains as `merged` with `mergedInto`.

ZCTA records belong in the separate ZIP-area layer. Keep the five-digit code as
a string and preserve Census provenance. Do not add a ZIP as a locality alias
or infer a USPS preferred city from the nearest locality point.

## Pull requests

Pull requests must pass the `validate` check. Keep source claims tied to official documentation and explain ambiguous reconciliation decisions in the pull request.
