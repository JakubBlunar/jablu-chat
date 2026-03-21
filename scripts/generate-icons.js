import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(
  join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "server", "package.json"),
);
const sharp = require("sharp");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SVG_PATH = join(ROOT, "apps", "web", "public", "favicon.svg");
const WEB_PUBLIC = join(ROOT, "apps", "web", "public");
const DESKTOP_RES = join(ROOT, "apps", "desktop", "resources");

mkdirSync(DESKTOP_RES, { recursive: true });

const svgBuffer = readFileSync(SVG_PATH);

const WEB_SIZES = [
  { name: "favicon-16x16.png", size: 16 },
  { name: "favicon-32x32.png", size: 32 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "android-chrome-192x192.png", size: 192 },
  { name: "android-chrome-512x512.png", size: 512 },
];

const DESKTOP_SIZES = [
  { name: "icon-256.png", size: 256 },
  { name: "icon-512.png", size: 512 },
];

async function generatePngs() {
  for (const { name, size } of WEB_SIZES) {
    await sharp(svgBuffer).resize(size, size).png().toFile(join(WEB_PUBLIC, name));
    console.log(`  ${name}`);
  }
  for (const { name, size } of DESKTOP_SIZES) {
    await sharp(svgBuffer).resize(size, size).png().toFile(join(DESKTOP_RES, name));
    console.log(`  ${name}`);
  }
}

function createIco(pngBuffers) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngBuffers.length, 4);

  const dirEntrySize = 16;
  let dataOffset = 6 + dirEntrySize * pngBuffers.length;
  const entries = [];
  const images = [];

  for (const { buf, size } of pngBuffers) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(size < 256 ? size : 0, 0);
    entry.writeUInt8(size < 256 ? size : 0, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(dataOffset, 12);
    entries.push(entry);
    images.push(buf);
    dataOffset += buf.length;
  }

  return Buffer.concat([header, ...entries, ...images]);
}

async function generateIco() {
  const sizes = [16, 32, 48];
  const pngBuffers = [];
  for (const size of sizes) {
    const buf = await sharp(svgBuffer).resize(size, size).png().toBuffer();
    pngBuffers.push({ buf, size });
  }
  const ico = createIco(pngBuffers);
  writeFileSync(join(WEB_PUBLIC, "favicon.ico"), ico);
  console.log("  favicon.ico");
}

async function main() {
  console.log("Generating icons from favicon.svg...\n");
  await generatePngs();
  await generateIco();
  console.log("\nDone!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
