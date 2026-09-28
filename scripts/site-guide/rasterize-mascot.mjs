#!/usr/bin/env node
// Preserve the existing brand artwork exactly, including its transparent corners.
import fs from 'node:fs/promises';
import sharp from 'sharp';

const output = new URL('./mascot/', import.meta.url);
await fs.mkdir(output, {recursive: true});
for (const [name, source] of [
  ['normal', 'hamamubi-icon-v2.svg'],
  ['wink', 'hamamubi-icon-wink.svg'],
]) {
  const svg = await fs.readFile(new URL(`../../public/brand/${source}`, import.meta.url));
  await sharp(svg, {density: 144}).resize(1024, 1024).png().toFile(new URL(`${name}.png`, output).pathname);
}
