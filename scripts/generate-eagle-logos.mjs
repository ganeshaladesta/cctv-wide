import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const publicDir = path.join(root, "public");
const assetsDir = path.join(publicDir, "assets");
const srcPath = path.join(assetsDir, "scc-eagle-eyes-logo.png");

function createIcoFromPng(pngBuffer, width = 32, height = 32) {
  // Standard ICO header (6 bytes) + 1 ICONDIRENTRY (16 bytes) + PNG payload
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(1, 4); // 1 image
  header.writeUInt8(width === 256 ? 0 : width, 6);
  header.writeUInt8(height === 256 ? 0 : height, 7);
  header.writeUInt8(0, 8); // Color palette
  header.writeUInt8(0, 9); // Reserved
  header.writeUInt16LE(1, 10); // Color planes
  header.writeUInt16LE(32, 12); // Bits per pixel
  header.writeUInt32LE(pngBuffer.length, 14); // Size of PNG data
  header.writeUInt32LE(22, 18); // Offset of PNG data
  return Buffer.concat([header, pngBuffer]);
}

async function generateLogos() {
  // 1. WebP optimized variant
  await sharp(srcPath)
    .webp({ quality: 92, alphaQuality: 100 })
    .toFile(path.join(assetsDir, "scc-eagle-eyes-logo.webp"));

  // 2. PNG icon variants (preserving aspect ratio & transparent background)
  const sizes = [
    { name: "favicon-16x16.png", size: 16 },
    { name: "favicon-32x32.png", size: 32 },
    { name: "apple-touch-icon.png", size: 180 },
    { name: "icon-192.png", size: 192 },
    { name: "icon-512.png", size: 512 }
  ];

  for (const item of sizes) {
    const buf = await sharp(srcPath)
      .resize(item.size, item.size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png({ compressionLevel: 9 })
      .toBuffer();

    fs.writeFileSync(path.join(publicDir, item.name), buf);
    fs.writeFileSync(path.join(assetsDir, item.name), buf);
  }

  // 3. favicon.ico (from 32x32 PNG)
  const png32 = fs.readFileSync(path.join(publicDir, "favicon-32x32.png"));
  const icoBuf = createIcoFromPng(png32, 32, 32);
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), icoBuf);
  fs.writeFileSync(path.join(assetsDir, "favicon.ico"), icoBuf);

  console.log("[Logo Variants Generated Successfully]");
}

generateLogos().catch((err) => {
  console.error(err);
  process.exit(1);
});

