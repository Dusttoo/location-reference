import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceManifest = JSON.parse(await readFile(path.join(root, "sources", "sources.json"), "utf8"));
const release = sourceManifest.release;
const downloads = path.join(root, "sources", "downloads");
const outputDirectory = path.join(root, "data", "us", "admin1");

const territoryCodes = new Map([
  ["60", "AS"],
  ["66", "GU"],
  ["69", "MP"],
  ["74", "UM"],
  ["78", "VI"]
]);

function parseLine(header, line) {
  const values = line.replace(/\r$/, "").split("|");
  return Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""]));
}

async function* zipRows(file, memberPattern) {
  const child = spawn("unzip", ["-p", path.join(downloads, file), memberPattern], { stdio: ["ignore", "pipe", "inherit"] });
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  let header;
  for await (const line of lines) {
    if (!header) {
      header = line.replace(/^\uFEFF/, "").replace(/\r$/, "").split("|");
      continue;
    }
    if (line.length > 0) yield parseLine(header, line);
  }
  const exitCode = await new Promise((resolve) => child.once("close", resolve));
  if (exitCode !== 0) throw new Error(`unzip exited with ${exitCode}: ${file}`);
}

function base32(buffer) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function newId(seed) {
  return `loc_${base32(createHash("sha256").update(`location-reference/v1/${seed}`).digest()).slice(0, 26)}`;
}

function slugify(value) {
  const slug = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "locality";
}

function normalizeName(value) {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function censusName(value) {
  const name = normalizeName(value);
  const suffix = name.match(/ (?:city and borough|consolidated government|metropolitan government|unified government|urban county|municipality|corporation|borough|city|town|village|comunidad|zona urbana|CDP)(?: \(balance\))?$/i)?.[0];
  if (!suffix) return { name, designation: undefined };
  return { name: name.slice(0, -suffix.length), designation: suffix.trim() };
}

function number(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid coordinate: ${value}`);
  return parsed;
}

function sourceKeys(record) {
  const keys = [];
  if (record.sourceMappings.census) keys.push(`census:${record.sourceMappings.census.geoid}`);
  for (const mapping of record.sourceMappings.gnis ?? []) keys.push(`gnis:${mapping.featureId}`);
  if (record.sourceMappings.geonames) keys.push(`geonames:${record.sourceMappings.geonames.geonameId}`);
  return keys;
}

async function loadPrevious() {
  const records = [];
  const directory = path.join(root, "data", "us", "admin1");
  for (const file of await readdir(directory).catch(() => [])) {
    if (!file.endsWith(".jsonl")) continue;
    const lines = readline.createInterface({ input: createReadStream(path.join(directory, file)), crlfDelay: Infinity });
    for await (const line of lines) if (line) records.push(JSON.parse(line));
  }
  return records;
}

function addAlias(record, value) {
  const alias = normalizeName(value);
  if (!alias || alias.localeCompare(record.name, "en", { sensitivity: "base" }) === 0) return;
  record.aliases ??= [];
  if (!record.aliases.some((existing) => existing.localeCompare(alias, "en", { sensitivity: "base" }) === 0)) {
    record.aliases.push(alias);
  }
}

const previousRecords = await loadPrevious();
const previousBySource = new Map();
const previousById = new Map(previousRecords.map((record) => [record.id, record]));
for (const record of previousRecords) for (const key of sourceKeys(record)) previousBySource.set(key, record.id);

const federalByFeature = new Map();
for await (const row of zipRows("FedCodes_National_Text.zip", "Text/*.txt")) {
  if (row.feature_class !== "Populated Place") continue;
  federalByFeature.set(row.feature_id, {
    censusCode: row.census_code || undefined,
    censusClassCode: row.census_class_code || undefined
  });
}

const recordsById = new Map();
const censusByGeoid = new Map();
const stateCodeByFips = new Map(territoryCodes);
const stateNameByFips = new Map();

for await (const row of zipRows("2026_Gaz_place_national.zip", "*.txt")) {
  const identity = censusName(row.NAME);
  stateCodeByFips.set(row.GEOID.slice(0, 2), row.USPS);
  const existingId = previousBySource.get(`census:${row.GEOID}`);
  const id = existingId ?? newId(`census:${row.GEOID}`);
  const previous = previousById.get(id);
  const record = {
    id,
    name: identity.name,
    slug: slugify(identity.name),
    countryCode: "US",
    admin1: { code: row.USPS, name: "", fips: row.GEOID.slice(0, 2) },
    kind: ["55", "57", "62"].includes(row.LSAD) ? "census-designated-place" : "incorporated-place",
    ...(identity.designation ? { designation: identity.designation } : {}),
    status: "active",
    searchTier: ["55", "57", "62"].includes(row.LSAD) ? 2 : 1,
    coordinates: { latitude: number(row.INTPTLAT), longitude: number(row.INTPTLONG), source: "census" },
    sourceMappings: {
      census: {
        geoid: row.GEOID,
        ansiCode: row.ANSICODE,
        lsad: row.LSAD,
        functionalStatus: row.FUNCSTAT
      }
    }
  };
  for (const alias of previous?.aliases ?? []) addAlias(record, alias);
  addAlias(record, row.NAME);
  recordsById.set(id, record);
  censusByGeoid.set(row.GEOID, record);
}

const recordByGnisFeature = new Map();
let excludedGnisWithoutGeography = 0;
let excludedDuplicateGnisRows = 0;
let historicalGnisPopulatedPlaces = 0;
for await (const row of zipRows("PopulatedPlaces_National_Text.zip", "Text/*.txt")) {
  if (recordByGnisFeature.has(row.feature_id)) {
    excludedDuplicateGnisRows += 1;
    continue;
  }
  const latitude = Number(row.prim_lat_dec);
  const longitude = Number(row.prim_long_dec);
  if (!row.state_numeric || !row.state_name || !Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) {
    excludedGnisWithoutGeography += 1;
    continue;
  }
  stateNameByFips.set(row.state_numeric, row.state_name);
  const federal = federalByFeature.get(row.feature_id);
  const geoid = federal?.censusCode ? `${row.state_numeric}${federal.censusCode}` : undefined;
  let record = geoid ? censusByGeoid.get(geoid) : undefined;
  if (!record) {
    const existingId = previousBySource.get(`gnis:${row.feature_id}`);
    const id = existingId ?? newId(`gnis:${row.feature_id}`);
    const previous = previousById.get(id);
    const stateCode = stateCodeByFips.get(row.state_numeric);
    if (!stateCode) throw new Error(`Missing postal code for GNIS state ${row.state_numeric} ${row.state_name}`);
    const isHistorical = /\(historical\)$/i.test(row.feature_name);
    if (isHistorical) historicalGnisPopulatedPlaces += 1;
    record = {
      id,
      name: normalizeName(row.feature_name),
      slug: slugify(row.feature_name),
      countryCode: "US",
      admin1: { code: stateCode, name: row.state_name, fips: row.state_numeric },
      ...(row.county_name && row.county_numeric ? { admin2: { name: row.county_name, fips: row.county_numeric } } : {}),
      kind: "gnis-populated-place",
      status: isHistorical ? "deprecated" : "active",
      ...(isHistorical ? { deprecatedAt: previous?.deprecatedAt ?? release } : {}),
      searchTier: 3,
      coordinates: { latitude, longitude, source: "gnis" },
      sourceMappings: { gnis: [] }
    };
    for (const alias of previous?.aliases ?? []) addAlias(record, alias);
    recordsById.set(id, record);
  } else {
    record.admin1.name = row.state_name;
    record.admin2 ??= row.county_name && row.county_numeric
      ? { name: row.county_name, fips: row.county_numeric }
      : undefined;
    record.sourceMappings.gnis ??= [];
    addAlias(record, row.feature_name);
  }

  record.sourceMappings.gnis.push({
    featureId: row.feature_id,
    ...(federal?.censusCode ? { censusCode: federal.censusCode } : {}),
    ...(federal?.censusClassCode ? { censusClassCode: federal.censusClassCode } : {})
  });
  recordByGnisFeature.set(row.feature_id, record);
}

for await (const row of zipRows("AllNames_National_Text.zip", "Text/*.txt")) {
  const record = recordByGnisFeature.get(row.feature_id);
  if (!record || row.feature_name_official === "Official") continue;
  addAlias(record, row.feature_name);
}

const currentBySource = new Map();
for (const record of recordsById.values()) for (const key of sourceKeys(record)) currentBySource.set(key, record.id);

for (const previous of previousRecords) {
  if (recordsById.has(previous.id)) continue;
  const replacement = sourceKeys(previous).map((key) => currentBySource.get(key)).find(Boolean);
  const retained = structuredClone(previous);
  retained.status = replacement ? "merged" : "deprecated";
  retained.deprecatedAt = previous.deprecatedAt ?? release;
  if (replacement) retained.mergedInto = replacement;
  recordsById.set(retained.id, retained);
}

for (const record of recordsById.values()) {
  if (!record.admin1.name) record.admin1.name = stateNameByFips.get(record.admin1.fips) ?? "";
  if (!record.admin1.name) throw new Error(`Missing admin1 name for ${record.id}`);
  if (record.aliases) record.aliases.sort((left, right) => left.localeCompare(right, "en"));
  if (record.sourceMappings.gnis) {
    record.sourceMappings.gnis.sort((left, right) => Number(left.featureId) - Number(right.featureId));
  }
}

const shards = new Map();
for (const record of recordsById.values()) {
  const records = shards.get(record.admin1.code) ?? [];
  records.push(record);
  shards.set(record.admin1.code, records);
}

for (const records of shards.values()) {
  records.sort((left, right) =>
    left.name.localeCompare(right.name, "en")
    || (left.admin2?.name ?? "").localeCompare(right.admin2?.name ?? "", "en")
    || left.id.localeCompare(right.id, "en")
  );
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await mkdir(path.join(root, "lists"), { recursive: true });
await mkdir(path.join(root, "releases"), { recursive: true });

async function sha256(file) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

const outputs = [];
const admin1 = [];
const allRecords = [...shards.entries()].sort(([left], [right]) => left.localeCompare(right, "en"));
for (const [code, records] of allRecords) {
  const relative = `data/us/admin1/${code}.jsonl`;
  const file = path.join(root, relative);
  await writeFile(file, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  outputs.push({ file: relative, sha256: await sha256(file) });
  admin1.push({ code, name: records[0].admin1.name, fips: records[0].admin1.fips, count: records.length, file: relative });
}

const listRelative = "lists/us-localities.txt";
const listFile = path.join(root, listRelative);
const activeRecords = [...recordsById.values()]
  .filter((record) => record.status === "active")
  .sort((left, right) => left.name.localeCompare(right.name, "en") || left.admin1.code.localeCompare(right.admin1.code, "en") || left.id.localeCompare(right.id, "en"));
const listLines = activeRecords.map((record) => [record.name, record.admin1.code, record.admin2?.name ?? "", record.kind].join("\t"));
await writeFile(listFile, `name\tstate\tcounty\tkind\n${listLines.join("\n")}\n`);
outputs.push({ file: listRelative, sha256: await sha256(listFile) });

const totals = {
  records: recordsById.size,
  active: activeRecords.length,
  deprecated: [...recordsById.values()].filter((record) => record.status === "deprecated").length,
  merged: [...recordsById.values()].filter((record) => record.status === "merged").length,
  censusPlaces: [...recordsById.values()].filter((record) => record.sourceMappings.census).length,
  unmatchedGnisPopulatedPlaces: [...recordsById.values()].filter((record) => !record.sourceMappings.census && record.sourceMappings.gnis).length,
  historicalGnisPopulatedPlaces,
  excludedGnisWithoutGeography,
  excludedDuplicateGnisRows
};

const countryManifest = {
  schemaVersion: 1,
  release,
  countryCode: "US",
  totals,
  list: listRelative,
  admin1
};
await writeFile(path.join(root, "data", "us", "manifest.json"), `${JSON.stringify(countryManifest, null, 2)}\n`);
outputs.push({ file: "data/us/manifest.json", sha256: await sha256(path.join(root, "data", "us", "manifest.json")) });

const catalog = {
  schemaVersion: 1,
  release,
  updatedAt: release,
  countries: [{ code: "US", name: "United States", manifest: "data/us/manifest.json", localityCount: totals.records, activeLocalityCount: totals.active }]
};
await writeFile(path.join(root, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
outputs.push({ file: "catalog.json", sha256: await sha256(path.join(root, "catalog.json")) });

const releaseManifest = {
  schemaVersion: 1,
  release,
  sources: sourceManifest.sources,
  outputs: outputs.sort((left, right) => left.file.localeCompare(right.file, "en"))
};
await writeFile(path.join(root, "releases", `${release}.json`), `${JSON.stringify(releaseManifest, null, 2)}\n`);

console.log(`Imported ${totals.records} U.S. localities (${totals.censusPlaces} Census places, ${totals.unmatchedGnisPopulatedPlaces} unmatched GNIS populated places).`);
