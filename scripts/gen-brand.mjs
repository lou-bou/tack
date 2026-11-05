// Builds every icon size from the SVGs in brand/. Run: npm run brand. Outputs are committed;
// rerun only when the logo changes.
import fs from 'node:fs';
import path from 'node:path';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const PUBLIC = 'web/public';
fs.mkdirSync(path.join(PUBLIC, 'icons'), { recursive: true });
fs.mkdirSync(path.join(PUBLIC, 'brand'), { recursive: true });

const logo = fs.readFileSync('brand/tack-logo.svg');
const maskable = fs.readFileSync('brand/tack-icon-maskable-light.svg');
const png = (svg, size) => sharp(svg, { density: 600 }).resize(size, size).png().toBuffer();

fs.writeFileSync(path.join(PUBLIC, 'icons/icon-192.png'), await png(logo, 192));
fs.writeFileSync(path.join(PUBLIC, 'icons/icon-512.png'), await png(logo, 512));
fs.writeFileSync(path.join(PUBLIC, 'icons/icon-maskable-192.png'), await png(maskable, 192));
fs.writeFileSync(path.join(PUBLIC, 'icons/icon-maskable-512.png'), await png(maskable, 512));
// iOS draws transparency as black, so the touch icon uses the full-bleed version.
fs.writeFileSync(path.join(PUBLIC, 'apple-touch-icon.png'), await png(maskable, 180));

// The 512px exports in brand/ follow the SVGs, so they can't drift apart.
fs.writeFileSync('brand/tack-icon-maskable-light-512.png', await png(maskable, 512));
fs.writeFileSync(
  'brand/tack-icon-maskable-dark-512.png',
  await png(fs.readFileSync('brand/tack-icon-maskable-dark.svg'), 512),
);

const ico = await Promise.all([16, 32, 48].map((size) => png(logo, size)));
fs.writeFileSync(path.join(PUBLIC, 'favicon.ico'), await pngToIco(ico));
fs.copyFileSync('brand/tack-logo.svg', path.join(PUBLIC, 'favicon.svg'));
fs.copyFileSync('brand/tack-logo.svg', path.join(PUBLIC, 'brand/tack-logo.svg'));
fs.copyFileSync('brand/tack-logo-dark.svg', path.join(PUBLIC, 'brand/tack-logo-dark.svg'));

console.log('Brand assets written.');
