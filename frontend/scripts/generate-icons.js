import sharp from 'sharp'
import { readFileSync } from 'fs'

const svg = readFileSync('public/icons/icon.svg')
for (const size of [192, 512]) {
  await sharp(svg).resize(size, size).png().toFile(`public/icons/icon-${size}.png`)
  console.log(`Generated icon-${size}.png`)
}
