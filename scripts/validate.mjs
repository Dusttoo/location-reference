import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function json(relative) {
  return JSON.parse(await readFile(path.join(root, relative), "utf8"));
}

async function sha256(relative) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path.join(root, relative)), hash);
  return hash.digest("hex");
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

const schemaFiles = [
  "schema/locality.schema.json",
  "schema/catalog.schema.json",
  "schema/country-manifest.schema.json",
  "schema/source-manifest.schema.json",
  "schema/release.schema.json"
];
const schemas = await Promise.all(schemaFiles.map(json));
const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
for (const schema of schemas) ajv.addSchema(schema);

function validateWith(schemaId, value, label) {
  const validate = ajv.getSchema(schemaId);
  if (!validate(value)) fail(`${label}: ${ajv.errorsText(validate.errors, { separator: "\n" })}`);
}

const catalog = await json("catalog.json");
const country = await json("data/us/manifest.json");
const sources = await json("sources/sources.json");
const release = await json(`releases/${catalog.release}.json`);

validateWith("https://location-reference.local/schema/catalog.schema.json", catalog, "catalog.json");
validateWith("https://location-reference.local/schema/country-manifest.schema.json", country, "data/us/manifest.json");
validateWith("https://location-reference.local/schema/source-manifest.schema.json", sources, "sources/sources.json");
validateWith("https://location-reference.local/schema/release.schema.json", release, `releases/${catalog.release}.json`);

assert(catalog.release === country.release && country.release === sources.release && sources.release === release.release, "Release dates do not agree");
assert(JSON.stringify(sources.sources) === JSON.stringify(release.sources), "Release sources differ from sources/sources.json");
assert(catalog.countries.length === 1 && catalog.countries[0].code === "US", "Catalog must contain one U.S. entry");
assert(catalog.countries[0].manifest === "data/us/manifest.json", "Catalog manifest path is incorrect");

const outputFiles = new Set();
for (const output of release.outputs) {
  assert(!outputFiles.has(output.file), `Duplicate release output: ${output.file}`);
  outputFiles.add(output.file);
  await access(path.join(root, output.file));
  assert(await sha256(output.file) === output.sha256, `Checksum mismatch: ${output.file}`);
}

for (let index = 1; index < release.outputs.length; index += 1) {
  assert(release.outputs[index - 1].file.localeCompare(release.outputs[index].file, "en") <= 0, "Release outputs are not sorted");
}

const localityValidator = ajv.getSchema("https://location-reference.local/schema/locality.schema.json");
const ids = new Set();
const censusGeoids = new Set();
const gnisFeatureIds = new Set();
const listRows = [];
const counts = { records: 0, active: 0, deprecated: 0, merged: 0, censusPlaces: 0, unmatchedGnisPopulatedPlaces: 0, historicalGnisPopulatedPlaces: 0 };

for (const admin1 of country.admin1) {
  assert(outputFiles.has(admin1.file), `Shard omitted from release: ${admin1.file}`);
  const lines = readline.createInterface({ input: createReadStream(path.join(root, admin1.file)), crlfDelay: Infinity });
  let shardCount = 0;
  let prior;
  for await (const line of lines) {
    if (!line) continue;
    const record = JSON.parse(line);
    if (!localityValidator(record)) fail(`${admin1.file}:${shardCount + 1}: ${ajv.errorsText(localityValidator.errors, { separator: "\n" })}`);
    assert(record.admin1.code === admin1.code && record.admin1.name === admin1.name && record.admin1.fips === admin1.fips, `${record.id}: admin1 does not match shard manifest`);
    assert(!ids.has(record.id), `Duplicate locality ID: ${record.id}`);
    ids.add(record.id);

    if (prior) {
      const order = prior.name.localeCompare(record.name, "en")
        || (prior.admin2?.name ?? "").localeCompare(record.admin2?.name ?? "", "en")
        || prior.id.localeCompare(record.id, "en");
      assert(order <= 0, `${admin1.file} is not sorted at ${record.id}`);
    }
    prior = record;

    const aliasKeys = new Set();
    for (const alias of record.aliases ?? []) {
      const key = alias.toLocaleLowerCase("en");
      assert(!aliasKeys.has(key), `${record.id}: duplicate alias ${alias}`);
      aliasKeys.add(key);
      assert(alias.localeCompare(record.name, "en", { sensitivity: "base" }) !== 0, `${record.id}: canonical name repeated as alias`);
    }
    for (let index = 1; index < (record.aliases?.length ?? 0); index += 1) {
      assert(record.aliases[index - 1].localeCompare(record.aliases[index], "en") <= 0, `${record.id}: aliases are not sorted`);
    }

    if (record.status === "active") {
      assert(!record.deprecatedAt && !record.mergedInto, `${record.id}: active record has retirement metadata`);
      listRows.push({
        line: [record.name, record.admin1.code, record.admin2?.name ?? "", record.kind].join("\t"),
        name: record.name,
        state: record.admin1.code,
        id: record.id
      });
    } else if (record.status === "deprecated") {
      assert(Boolean(record.deprecatedAt) && !record.mergedInto, `${record.id}: invalid deprecated record`);
    } else {
      assert(Boolean(record.deprecatedAt) && Boolean(record.mergedInto), `${record.id}: invalid merged record`);
    }

    if (record.sourceMappings.census) {
      const mapping = record.sourceMappings.census;
      assert(!censusGeoids.has(mapping.geoid), `Duplicate Census GEOID: ${mapping.geoid}`);
      censusGeoids.add(mapping.geoid);
      assert(mapping.geoid.startsWith(record.admin1.fips), `${record.id}: Census GEOID state mismatch`);
      assert(record.coordinates.source === "census", `${record.id}: Census record must use Census coordinates`);
      assert(record.searchTier === (record.kind === "census-designated-place" ? 2 : 1), `${record.id}: Census search tier mismatch`);
      counts.censusPlaces += 1;
    } else {
      assert(record.kind === "gnis-populated-place" && record.searchTier === 3 && record.coordinates.source === "gnis", `${record.id}: GNIS record classification mismatch`);
      counts.unmatchedGnisPopulatedPlaces += 1;
    }

    for (const mapping of record.sourceMappings.gnis ?? []) {
      assert(!gnisFeatureIds.has(mapping.featureId), `Duplicate GNIS feature ID: ${mapping.featureId}`);
      gnisFeatureIds.add(mapping.featureId);
    }

    if (record.status === "deprecated" && /\(historical\)$/i.test(record.name)) counts.historicalGnisPopulatedPlaces += 1;
    counts.records += 1;
    counts[record.status] += 1;
    shardCount += 1;
  }
  assert(shardCount === admin1.count, `${admin1.file}: expected ${admin1.count} records, found ${shardCount}`);
}

listRows.sort((left, right) => left.name.localeCompare(right.name, "en") || left.state.localeCompare(right.state, "en") || left.id.localeCompare(right.id, "en"));
const expectedList = `name\tstate\tcounty\tkind\n${listRows.map((row) => row.line).join("\n")}\n`;
assert(await readFile(path.join(root, country.list), "utf8") === expectedList, `${country.list} does not match active records`);
assert(outputFiles.has(country.list), "Copy list omitted from release");

for (const key of ["records", "active", "deprecated", "merged", "censusPlaces", "unmatchedGnisPopulatedPlaces", "historicalGnisPopulatedPlaces"]) {
  assert(counts[key] === country.totals[key], `Total mismatch for ${key}: expected ${country.totals[key]}, found ${counts[key]}`);
}
assert(counts.active + counts.deprecated + counts.merged === counts.records, "Status totals do not add up");
assert(catalog.countries[0].localityCount === counts.records && catalog.countries[0].activeLocalityCount === counts.active, "Catalog totals do not match records");
assert(outputFiles.has("catalog.json") && outputFiles.has("data/us/manifest.json"), "Core manifests omitted from release");

console.log(`Validated ${counts.records} localities, ${censusGeoids.size} Census GEOIDs, ${gnisFeatureIds.size} GNIS feature IDs, and ${release.outputs.length} output checksums.`);
