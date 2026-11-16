# 2026 Census ZCTA source audit

The 2026 national ZCTA Gazetteer ZIP was retrieved on 2026-11-15 from the
[U.S. Census Bureau](https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_zcta_national.zip).
Its SHA-256 checksum is pinned in `sources/sources.json`. The source has 33,791
data rows with unique five-digit codes and representative latitude/longitude
points; all 33,791 rows were imported. The source's ZCTA geography is based on
2020 Census blocks, even though the Gazetteer file is a 2026 release.

ZCTAs approximate USPS ZIP service areas. The Census Bureau says not every
valid USPS ZIP has a ZCTA. The 2026 Gazetteer covers the 50 states, DC and
Puerto Rico, omitting the other island areas represented in the locality
catalog. A ZIP-area point is suitable as an approximate search origin, not
for address validation, a mailing city, or a breeder's exact position.

No ZIP-to-locality association was imported. A Census ZCTA-to-place geographic
relationship could be added separately; geographic intersection would still
not establish a USPS preferred city.

The existing GNIS source URLs are mutable. A fresh runner fetching the GNIS
Populated Places URL on 2026-11-15 received bytes that do not match the
2026-10-13 pinned checksum. CI therefore rebuilds the new ZCTA layer from its
pinned Census input and validates the committed locality outputs and their
current-release checksums. A future full locality refresh must review and pin
the newer GNIS snapshots as a separate change.

Relevant source documentation:

- [2026 Gazetteer files and coverage](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2026.html)
- [ZCTA definition and limitations](https://www.census.gov/programs-surveys/geography/guidance/geo-areas/zctas.html)
- [2026 Gazetteer record layout](https://www.census.gov/programs-surveys/geography/technical-documentation/records-layout/gaz-record-layouts.2026.html)
