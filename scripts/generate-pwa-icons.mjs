import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const publicDir = join(__dirname, '..', 'public')

// Cinema icon SVG with play button
const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#141414"/>
  <rect x="64" y="64" width="384" height="384" rx="32" fill="none" stroke="#e50914" stroke-width="24"/>
  <polygon points="200,160 360,256 200,352" fill="#e50914"/>
</svg>
`

// Maskable icon with larger safe zone
const maskableIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#141414"/>
  <rect x="96" y="96" width="320" height="320" rx="24" fill="none" stroke="#e50914" stroke-width="20"/>
  <polygon points="216,176 344,256 216,336" fill="#e50914"/>
</svg>
`

// Apple touch icon (square, no rounded corners in file - iOS adds them)
const appleTouchIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
  <rect width="180" height="180" fill="#141414"/>
  <rect x="24" y="24" width="132" height="132" rx="12" fill="none" stroke="#e50914" stroke-width="8"/>
  <polygon points="72,54 126,90 72,126" fill="#e50914"/>
</svg>
`

async function generateIcons() {
  console.log('Generating PWA icons...')

  // Generate 192x192 icon
  await sharp(Buffer.from(iconSvg))
    .resize(192, 192)
    .png()
    .toFile(join(publicDir, 'pwa-192x192.png'))
  console.log('Created pwa-192x192.png')

  // Generate 512x512 icon
  await sharp(Buffer.from(iconSvg))
    .resize(512, 512)
    .png()
    .toFile(join(publicDir, 'pwa-512x512.png'))
  console.log('Created pwa-512x512.png')

  // Generate maskable icon (512x512)
  await sharp(Buffer.from(maskableIconSvg))
    .resize(512, 512)
    .png()
    .toFile(join(publicDir, 'pwa-maskable-512x512.png'))
  console.log('Created pwa-maskable-512x512.png')

  // Generate Apple touch icon (180x180)
  await sharp(Buffer.from(appleTouchIconSvg))
    .resize(180, 180)
    .png()
    .toFile(join(publicDir, 'apple-touch-icon.png'))
  console.log('Created apple-touch-icon.png')

  // Generate favicon as PNG (32x32)
  await sharp(Buffer.from(iconSvg))
    .resize(32, 32)
    .png()
    .toFile(join(publicDir, 'favicon-32x32.png'))
  console.log('Created favicon-32x32.png')

  // Generate favicon as PNG (16x16)
  await sharp(Buffer.from(iconSvg))
    .resize(16, 16)
    .png()
    .toFile(join(publicDir, 'favicon-16x16.png'))
  console.log('Created favicon-16x16.png')

  console.log('All PWA icons generated successfully!')
}

generateIcons().catch(console.error)
