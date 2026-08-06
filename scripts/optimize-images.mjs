/**
 * Сжатие фоновых PNG и генерация PWA-иконок.
 * Запуск: node scripts/optimize-images.mjs
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

async function renderIcon(size, { rounded = false } = {}) {
  const svgPath = path.join(iconsDir, "icon.svg");
  let pipeline = sharp(svgPath).resize(size, size);

  if (rounded) {
    const radius = Math.round(size * 0.22);
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`
    );
    pipeline = pipeline.composite([{ input: mask, blend: "dest-in" }]);
  }

  return pipeline.png({ compressionLevel: 9 });
}

async function generateIcons() {
  const apple = path.join(iconsDir, "apple-touch-icon.png");
  await (await renderIcon(180, { rounded: true })).toFile(apple);
  console.log(`wrote ${path.relative(root, apple)}`);

  for (const size of [192, 512]) {
    const out = path.join(iconsDir, `icon-${size}.png`);
    await (await renderIcon(size)).toFile(out);
    console.log(`wrote ${path.relative(root, out)}`);
  }

  // Maskable: content inset ~20% for Android safe zone
  const maskableSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0f2741"/>
  <svg x="64" y="64" width="384" height="384" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="#173b63"/>
    <circle cx="256" cy="392" r="28" fill="none" stroke="#e9d4ad" stroke-width="10"/>
    <path d="M256 368c-8 0-14 6-14 14v6c0 8 6 14 14 14s14-6 14-14v-6c0-8-6-14-14-14z" fill="#b88636"/>
    <text x="256" y="300" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="148" fill="#ffffff">&#1048;&#1055;&#1051;</text>
  </svg>
</svg>`;
  const maskableOut = path.join(iconsDir, "icon-maskable-512.png");
  await sharp(Buffer.from(maskableSvg)).resize(512, 512).png({ compressionLevel: 9 }).toFile(maskableOut);
  console.log(`wrote ${path.relative(root, maskableOut)}`);

  await (await renderIcon(32)).toFile(path.join(iconsDir, "favicon-32.png"));
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
