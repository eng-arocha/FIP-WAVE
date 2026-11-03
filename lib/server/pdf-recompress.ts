import sharp from 'sharp'
import { inflateSync } from 'node:zlib'
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFDict, PDFArray } from 'pdf-lib'

/**
 * Recompressão das imagens embarcadas num PDF — o caso da NF escaneada.
 *
 * Um PDF de scanner é basicamente uma imagem por página, muitas vezes a
 * 300-600 dpi e com JPEG de qualidade alta (ou pixels crus em Flate). É isso
 * que faz uma NF de uma página pesar 4-18 MB. Aqui cada imagem grande é
 * reduzida para no máximo IMG_MAX_EDGE px no maior lado (~150 dpi em A4,
 * leitura confortável na tela e na impressão) e regravada em JPEG.
 *
 * Feito só com pdf-lib + sharp (sem Ghostscript), então roda no Vercel.
 * Imagens em formato que não sabemos tratar (CCITT, JBIG2, JPX, 16 bits,
 * CMYK, com predictor PNG, etc.) ficam intactas. Se nada diminuir, devolve
 * null e o chamador mantém o original.
 *
 * Sem imports com alias `@/` de propósito: o script de manutenção
 * `scripts/storage-cleanup.ts` importa este arquivo direto com o Node.
 */

const IMG_MAX_EDGE = 1800
const IMG_JPEG_QUALITY = 60
/** Imagens menores que isso não compensam o trabalho. */
const IMG_MIN_BYTES = 100 * 1024

function nameOf(v: unknown): string | undefined {
  return v instanceof PDFName ? v.decodeText() : undefined
}

function numberOf(v: unknown): number | undefined {
  return v instanceof PDFNumber ? v.asNumber() : undefined
}

/** Filtro único da stream; undefined se não tiver filtro ou se for cadeia. */
function singleFilter(dict: PDFDict): string | null | undefined {
  const f = dict.get(PDFName.of('Filter'))
  if (!f) return null
  if (f instanceof PDFName) return f.decodeText()
  if (f instanceof PDFArray && f.size() === 1) return nameOf(f.get(0))
  return undefined
}

/** Número de componentes de cor que sabemos tratar (1 = cinza, 3 = RGB). */
function components(dict: PDFDict, ctxLookup: (v: unknown) => unknown): 1 | 3 | undefined {
  const cs = ctxLookup(dict.get(PDFName.of('ColorSpace')))
  const n = nameOf(cs)
  if (n === 'DeviceGray') return 1
  if (n === 'DeviceRGB') return 3
  if (cs instanceof PDFArray && nameOf(cs.get(0)) === 'ICCBased') {
    const icc = ctxLookup(cs.get(1))
    const nComp = icc instanceof PDFRawStream ? numberOf(icc.dict.get(PDFName.of('N'))) : undefined
    if (nComp === 1 || nComp === 3) return nComp
  }
  return undefined
}

async function recompressImage(
  stream: PDFRawStream,
  ctxLookup: (v: unknown) => unknown,
): Promise<PDFRawStream | null> {
  const dict = stream.dict
  if (nameOf(dict.get(PDFName.of('Subtype'))) !== 'Image') return null
  if (stream.contents.length < IMG_MIN_BYTES) return null
  if (dict.get(PDFName.of('ImageMask')) || dict.get(PDFName.of('Decode'))) return null
  if (numberOf(dict.get(PDFName.of('BitsPerComponent'))) !== 8) return null

  const width = numberOf(dict.get(PDFName.of('Width')))
  const height = numberOf(dict.get(PDFName.of('Height')))
  const comps = components(dict, ctxLookup)
  if (!width || !height || !comps) return null

  const filter = singleFilter(dict)
  let input: sharp.Sharp
  if (filter === 'DCTDecode') {
    input = sharp(Buffer.from(stream.contents))
  } else if (filter === 'FlateDecode') {
    // Pixels crus comprimidos. Com predictor PNG a linha tem byte extra — fora.
    if (dict.get(PDFName.of('DecodeParms'))) return null
    const raw = inflateSync(Buffer.from(stream.contents))
    if (raw.length !== width * height * comps) return null
    input = sharp(raw, { raw: { width, height, channels: comps } })
  } else {
    return null
  }

  const scale = Math.min(1, IMG_MAX_EDGE / Math.max(width, height))
  const newW = Math.max(1, Math.round(width * scale))
  const newH = Math.max(1, Math.round(height * scale))

  let pipeline = input
  if (scale < 1) pipeline = pipeline.resize(newW, newH, { fit: 'fill' })
  if (comps === 1) pipeline = pipeline.toColourspace('b-w')
  const out = await pipeline.jpeg({ quality: IMG_JPEG_QUALITY, mozjpeg: true }).toBuffer()
  if (out.length >= stream.contents.length * 0.9) return null

  const newDict = dict.clone()
  newDict.set(PDFName.of('Width'), PDFNumber.of(newW))
  newDict.set(PDFName.of('Height'), PDFNumber.of(newH))
  newDict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'))
  newDict.delete(PDFName.of('DecodeParms'))
  if (comps === 1) newDict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceGray'))
  return PDFRawStream.of(newDict, new Uint8Array(out))
}

/**
 * Recomprime as imagens do PDF. Devolve o PDF novo, ou null se não houve
 * ganho (ou se o PDF não pôde ser lido).
 */
export async function recompressPdfImages(buffer: Buffer): Promise<Buffer | null> {
  let pdf: PDFDocument
  try {
    pdf = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false })
  } catch {
    return null
  }
  const ctx = pdf.context
  const lookup = (v: unknown) => (v ? ctx.lookup(v as never) : v)

  let changed = 0
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    try {
      const next = await recompressImage(obj, lookup)
      if (next) {
        ctx.assign(ref, next)
        changed++
      }
    } catch {
      // imagem que o sharp não entende — fica como está
    }
  }
  if (changed === 0) return null

  const out = Buffer.from(await pdf.save({ useObjectStreams: true, addDefaultPage: false }))
  return out.length < buffer.length ? out : null
}
