import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import { recompressPdfImages } from '../lib/server/pdf-recompress'

/** Imagem "de scanner": 2480x3508 (A4 a 300 dpi) com ruído, JPEG q95. */
async function scanJpeg(): Promise<Buffer> {
  const w = 2480, h = 3508
  const raw = Buffer.alloc(w * h * 3)
  for (let i = 0; i < raw.length; i++) raw[i] = 200 + ((i * 7919) % 55)
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 95 }).toBuffer()
}

describe('recompressPdfImages', () => {
  it('reduz PDF escaneado e mantém uma página legível', async () => {
    const doc = await PDFDocument.create()
    const img = await doc.embedJpg(await scanJpeg())
    const page = doc.addPage([595, 842])
    page.drawImage(img, { x: 0, y: 0, width: 595, height: 842 })
    const original = Buffer.from(await doc.save())

    const out = await recompressPdfImages(original)
    expect(out).not.toBeNull()
    expect(out!.length).toBeLessThan(original.length / 2)

    const reloaded = await PDFDocument.load(out!)
    expect(reloaded.getPageCount()).toBe(1)
  }, 30_000)

  it('devolve null para PDF sem imagem', async () => {
    const doc = await PDFDocument.create()
    doc.addPage().drawText('NF 123')
    expect(await recompressPdfImages(Buffer.from(await doc.save()))).toBeNull()
  })

  it('devolve null para arquivo que não é PDF', async () => {
    expect(await recompressPdfImages(Buffer.from('não sou pdf'))).toBeNull()
  })
})
