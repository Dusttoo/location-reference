import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceManifest = JSON.parse(await readFile(path.join(root, "sources/sources.json"), "utf8"));
const source = sourceManifest.sources.find((item) => item.id === "census-zcta-2026");
if (!source) throw new Error("Missing Census ZCTA source manifest entry");

async function sha256(relative) {
  const contents = await readFile(path.join(root, relative));
  return createHash("sha256").update(contents).digest("hex");
}

const download = `sources/downloads/${source.file}`;
if (await sha256(download) !== source.sha256) throw new Error(`${download}: checksum mismatch`);
const raw = execFileSync("unzip", ["-p", path.join(root, download)], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
const lines = raw.trimEnd().split(/\r?\n/);
const expectedHeader = "GEOID|GEOIDFQ|ALAND|AWATER|ALAND_SQMI|AWATER_SQMI|INTPTLAT|INTPTLONG";
if (lines.shift() !== expectedHeader) throw new Error("Unexpected Census ZCTA Gazetteer columns");

const records = [];
const codes = new Set();
for (const line of lines) {
  const [code, , , , , , latitudeText, longitudeText] = line.split("|");
  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  if (!/^[0-9]{5}$/.test(code) || codes.has(code)) throw new Error(`Invalid or duplicate ZCTA code: ${code}`);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error(`Invalid Census representative point for ${code}`);
  }
  codes.add(code);
  records.push({
    id: `us:zcta:${code}`,
    code,
    coordinates: { latitude, longitude, kind: "census-representative-point" },
    sourceId: source.id
  });
}
records.sort((left, right) => left.code.localeCompare(right.code, "en"));
if (records.length < 30000) throw new Error(`Unexpectedly small ZCTA dataset: ${records.length}`);

const currentCatalog = JSON.parse(await readFile(path.join(root, "catalog.json"), "utf8"));
const currentRelease = JSON.parse(await readFile(path.join(root, `releases/${currentCatalog.release}.json`), "utf8"));
const country = JSON.parse(await readFile(path.join(root, "data/us/manifest.json"), "utf8"));
const release = sourceManifest.release;
country.release = release;
country.zcta = {
  file: "data/us/zctas.jsonl",
  list: "lists/us-zctas.txt",
  count: records.length,
  sourceId: source.id,
  boundaryVintage: "2020"
};
currentCatalog.release = release;
currentCatalog.updatedAt = release;
currentCatalog.countries[0].zctaCount = records.length;

await writeFile(path.join(root, country.zcta.file), `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
await writeFile(path.join(root, country.zcta.list), `zcta\tlatitude\tlongitude\n${records.map((record) => [record.code, record.coordinates.latitude, record.coordinates.longitude].join("\t")).join("\n")}\n`);
await writeFile(path.join(root, "data/us/manifest.json"), `${JSON.stringify(country, null, 2)}\n`);
await writeFile(path.join(root, "catalog.json"), `${JSON.stringify(currentCatalog, null, 2)}\n`);

const paths = new Set(currentRelease.outputs.map((output) => output.file));
for (const file of [country.zcta.file, country.zcta.list, "data/us/manifest.json", "catalog.json"]) paths.add(file);
const outputs = await Promise.all([...paths].map(async (file) => ({ file, sha256: await sha256(file) })));
outputs.sort((left, right) => left.file.localeCompare(right.file, "en"));
const releaseManifest = { schemaVersion: 1, release, sources: sourceManifest.sources, outputs };
await writeFile(path.join(root, `releases/${release}.json`), `${JSON.stringify(releaseManifest, null, 2)}\n`);
console.log(`Imported ${records.length} Census ZIP Code Tabulation Areas.`);
