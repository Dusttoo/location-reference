import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "sources", "sources.json"), "utf8"));
const outputDirectory = path.join(root, "sources", "downloads");

async function checksum(file) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

await mkdir(outputDirectory, { recursive: true });

for (const source of manifest.sources) {
  const destination = path.join(outputDirectory, source.file);
  const current = await checksum(destination).catch(() => null);
  if (current === source.sha256) {
    console.log(`Verified ${source.file}`);
    continue;
  }

  const temporary = `${destination}.download`;
  await rm(temporary, { force: true });
  const response = await fetch(source.url);
  if (!response.ok || !response.body) throw new Error(`${response.status} ${response.statusText}: ${source.url}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
  const downloaded = await checksum(temporary);
  if (downloaded !== source.sha256) {
    await rm(temporary, { force: true });
    throw new Error(`${source.file}: expected ${source.sha256}, received ${downloaded}`);
  }
  await rename(temporary, destination);
  console.log(`Downloaded and verified ${source.file}`);
}
