import { createReadStream, createWriteStream } from "node:fs";
import { readdir, rename, rm, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { constants, createBrotliCompress } from "node:zlib";

const directory = ".next/static";
const extensions = new Set([".js", ".css", ".json", ".woff"]);
let files = 0;
let saved = 0;

for (const asset of await readdir(directory, { recursive: true, withFileTypes: true })) {
  if (!asset.isFile() || !extensions.has(extname(asset.name))) continue;
  const input = join(asset.parentPath, asset.name);
  const { size } = await stat(input);
  if (size < 1024) continue;
  const output = input + ".br";
  const temporary = output + "." + process.pid + ".tmp";
  try {
    await pipeline(createReadStream(input), createBrotliCompress({
      params: { [constants.BROTLI_PARAM_QUALITY]: 6 },
    }), createWriteStream(temporary));
    const compressed = (await stat(temporary)).size;
    if (compressed < size) {
      await rename(temporary, output);
      files++;
      saved += size - compressed;
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

console.log(`Wrote ${files} Brotli variants, saving ${saved.toLocaleString("en-US")} bytes before transport.`);
