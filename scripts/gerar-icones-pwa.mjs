// Gera os ícones PNG quadrados do PWA a partir de public/logos/wave-logo.svg.
// O logo é 320x180 (não quadrado) — o Chrome exige ícone quadrado >= 192px
// para oferecer "Instalar app". Rodar: node scripts/gerar-icones-pwa.mjs
import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'node:fs'

const svg = readFileSync('public/logos/wave-logo.svg')
mkdirSync('public/icons', { recursive: true })

// padding = fração do lado ocupada pelo logo (maskable precisa de safe zone ~80%)
const alvos = [
  { arquivo: 'icon-192.png', lado: 192, ocupa: 0.86 },
  { arquivo: 'icon-512.png', lado: 512, ocupa: 0.86 },
  { arquivo: 'icon-maskable-512.png', lado: 512, ocupa: 0.66 },
  { arquivo: 'apple-touch-icon.png', lado: 180, ocupa: 0.86 },
]

for (const { arquivo, lado, ocupa } of alvos) {
  const largura = Math.round(lado * ocupa)
  const logo = await sharp(svg, { density: 600 }).resize({ width: largura }).png().toBuffer()
  await sharp({ create: { width: lado, height: lado, channels: 4, background: '#FFFFFF' } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(`public/icons/${arquivo}`)
  console.log('ok', arquivo)
}
