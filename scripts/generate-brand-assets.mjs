// Generates public/og-image.png (1200x630 social preview card),
// public/favicon.ico, public/favicon-512.png, public/favicon-32.png,
// and public/apple-touch-icon.png from the official Bloom brand assets.
// Run: node scripts/generate-brand-assets.mjs
import sharp from "sharp";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), "../public");

// Read the official Bloom SVG logo
const bloomLogoWhiteSvg = readFileSync(resolve(publicDir, "bloom-logo-white.svg"), "utf8");

// Extract the icon-only SVG from bloom-logo-white.svg (the 46x46 square badge)
// Remove the text paths (lines 41-45 in the original) and update viewBox to 0 0 46 46
const iconOnlySvg = bloomLogoWhiteSvg
  .replace(/width="154"/, 'width="512"')
  .replace(/height="46"/, 'height="512"')
  .replace(/viewBox="0 0 154 46"/, 'viewBox="0 0 46 46"')
  .replace(/<path d="M126\.926[\s\S]*?fill="#FFFFFF"\/>/g, "")
  .replace(/<path d="M112\.596[\s\S]*?fill="#FFFFFF"\/>/g, "")
  .replace(/<path d="M92\.0621[\s\S]*?fill="#FFFFFF"\/>/g, "")
  .replace(/<path d="M77\.5879[\s\S]*?fill="#FFFFFF"\/>/g, "")
  .replace(/<path d="M56\.0833[\s\S]*?fill="#FFFFFF"\/>/g, "");

// Generate a high-resolution PNG buffer of the Bloom full logo (e.g. 500px wide, ~149px high)
async function getBloomLogoPng(width = 462, height = 138) {
  const scaledSvg = bloomLogoWhiteSvg
    .replace(/width="154"/, `width="${width}"`)
    .replace(/height="46"/, `height="${height}"`);
  return sharp(Buffer.from(scaledSvg)).png().toBuffer();
}

// Generate the 1200x630 OG Card base SVG
const createOgCardSvg = () => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#07090E" />
      <stop offset="50%" stop-color="#0B0F19" />
      <stop offset="100%" stop-color="#04060A" />
    </linearGradient>

    <radialGradient id="blueGlow1" cx="50%" cy="18%" r="55%">
      <stop offset="0%" stop-color="#1658FF" stop-opacity="0.22" />
      <stop offset="60%" stop-color="#1658FF" stop-opacity="0.04" />
      <stop offset="100%" stop-color="#1658FF" stop-opacity="0" />
    </radialGradient>

    <radialGradient id="blueGlow2" cx="15%" cy="85%" r="45%">
      <stop offset="0%" stop-color="#0066FF" stop-opacity="0.14" />
      <stop offset="100%" stop-color="#0066FF" stop-opacity="0" />
    </radialGradient>

    <radialGradient id="blueGlow3" cx="85%" cy="85%" r="45%">
      <stop offset="0%" stop-color="#002D62" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#002D62" stop-opacity="0" />
    </radialGradient>

    <linearGradient id="cardBorder" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1658FF" stop-opacity="0.4" />
      <stop offset="50%" stop-color="#334155" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#1658FF" stop-opacity="0.2" />
    </linearGradient>

    <linearGradient id="badgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1658FF" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#002D62" stop-opacity="0.25" />
    </linearGradient>

    <linearGradient id="textGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="100%" stop-color="#F1F5F9" />
    </linearGradient>
  </defs>

  <!-- Background Base -->
  <rect width="1200" height="630" fill="url(#bgGrad)" />

  <!-- Ambient Glows -->
  <rect width="1200" height="630" fill="url(#blueGlow1)" />
  <rect width="1200" height="630" fill="url(#blueGlow2)" />
  <rect width="1200" height="630" fill="url(#blueGlow3)" />

  <!-- Inner Subtle Card Frame -->
  <rect x="16" y="16" width="1168" height="598" rx="24" fill="none" stroke="url(#cardBorder)" stroke-width="1.5" />

  <!-- Top Accent Bar -->
  <rect x="450" y="16" width="300" height="3" rx="1.5" fill="#1658FF" />

  <!-- Main Headline -->
  <text x="600" y="325" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="52" font-weight="700" fill="url(#textGrad)" letter-spacing="-0.5">
    Smart Investing, Trading &amp; Wealth
  </text>

  <!-- Feature Highlights -->
  <text x="600" y="388" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="24" font-weight="500" fill="#94A3B8" letter-spacing="0.2">
    Real-Time Markets  ·  Copy Trading  ·  Tiered Investment Plans
  </text>

  <!-- Bottom Verification Pill Badge -->
  <g transform="translate(470, 460)">
    <rect width="260" height="52" rx="26" fill="url(#badgeGrad)" stroke="#1658FF" stroke-opacity="0.4" stroke-width="1" />
    <!-- Check / Shield dot -->
    <circle cx="36" cy="26" r="6" fill="#10B981" />
    <text x="56" y="34" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="20" font-weight="600" fill="#FFFFFF" letter-spacing="0.5">
      bloomsinvest.co
    </text>
  </g>
</svg>`;

// Build ICO file
async function buildIco(sizes) {
  const pngs = await Promise.all(
    sizes.map((s) => sharp(Buffer.from(iconOnlySvg)).resize(s, s).png().toBuffer())
  );
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(sizes.length, 4);

  const entries = [];
  let offset = 6 + sizes.length * 16;
  sizes.forEach((s, i) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(s >= 256 ? 0 : s, 0); // width
    entry.writeUInt8(s >= 256 ? 0 : s, 1); // height
    entry.writeUInt8(0, 2); // color palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(pngs[i].length, 8); // size of image data
    entry.writeUInt32LE(offset, 12); // offset
    offset += pngs[i].length;
    entries.push(entry);
  });

  return Buffer.concat([header, ...entries, ...pngs]);
}

const run = async () => {
  console.log("Generating Bloom brand & SEO preview assets...");

  // 1. Generate Bloom Logo overlay for the OG Card
  const logoWidth = 430;
  const logoHeight = Math.round((430 / 154) * 46); // ~128px
  const logoPngBuffer = await getBloomLogoPng(logoWidth, logoHeight);

  // 2. Generate Base OG Background and composite Bloom Logo centered at top (y: 110)
  const baseCardBuffer = await sharp(Buffer.from(createOgCardSvg())).png().toBuffer();

  const logoLeft = Math.round((1200 - logoWidth) / 2);
  const logoTop = 115;

  await sharp(baseCardBuffer)
    .composite([
      {
        input: logoPngBuffer,
        top: logoTop,
        left: logoLeft,
      },
    ])
    .png({ quality: 95, compressionLevel: 8 })
    .toFile(resolve(publicDir, "og-image.png"));
  console.log("✓ public/og-image.png (1200x630, Official Bloom Logo & Typography)");

  // 3. Generate Crisp Favicons & Icons from the official Bloom symbol
  const ico = await buildIco([16, 32, 48]);
  writeFileSync(resolve(publicDir, "favicon.ico"), ico);
  console.log("✓ public/favicon.ico (16/32/48)");

  await sharp(Buffer.from(iconOnlySvg)).resize(512, 512).png().toFile(resolve(publicDir, "favicon-512.png"));
  console.log("✓ public/favicon-512.png");

  await sharp(Buffer.from(iconOnlySvg)).resize(32, 32).png().toFile(resolve(publicDir, "favicon-32.png"));
  console.log("✓ public/favicon-32.png");

  await sharp(Buffer.from(iconOnlySvg)).resize(180, 180).png().toFile(resolve(publicDir, "apple-touch-icon.png"));
  console.log("✓ public/apple-touch-icon.png (180x180)");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
