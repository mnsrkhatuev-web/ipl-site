/**
 * Сжатие фоновых PNG и генерация PWA-иконок.
 * Запуск из корня репозитория: node scripts/optimize-images.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const imagesDir = path.join(root, "assets", "images");
const iconsDir = path.join(root, "assets", "icons");

const backgrounds = [
  { name: "mchs.png", maxWidth: 1920, quality: 82 },
  { name: "lab.png", maxWidth: 1920, quality: 82 }
];

async function optimizeBackground({ name, maxWidth, quality }) {
  const input = path.join(imagesDir, name);
  if (!fs.existsSync(input)) {
    console.warn(`skip: ${name} not found`);
    return;
  }

  const webpName = name.replace(/\.png$/i, ".webp");
  const output = path.join(imagesDir, webpName);

  await sharp(input)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality, effort: 6 })
    .toFile(output);

  const before = fs.statSync(input).size;
  const after = fs.statSync(output).size;
  console.log(`${webpName}: ${(before / 1024 / 1024).toFixed(2)} MB PNG → ${(after / 1024).toFixed(0)} KB WebP`);
}

async function generateIcons() {
  const svgPath = path.join(iconsDir, "icon.svg");
  const sizes = [180, 192, 512];

  for (const size of sizes) {
    const suffix = size === 180 ? "apple-touch-icon" : `icon-${size}`;
    const out = path.join(iconsDir, `${suffix}.png`);
    await sharp(svgPath).resize(size, size).png({ compressionLevel: 9 }).toFile(out);
    console.log(`wrote ${path.relative(root, out)}`);
  }

  await sharp(svgPath).resize(32, 32).png().toFile(path.join(iconsDir, "favicon-32.png"));
  console.log("wrote assets/icons/favicon-32.png");
}

async function main() {
  fs.mkdirSync(iconsDir, { recursive: true });
  for (const item of backgrounds) {
    await optimizeBackground(item);
  }
  await generateIcons();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
