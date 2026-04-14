/**
 * Extração mínima de EXIF de JPEG para validação anti-fraude em fotos
 * de medição.
 *
 * Por que sem dependências externas:
 *  - Casos de uso são restritos: queremos APENAS data/hora e GPS
 *  - Bibliotecas (exifr, exif-parser) trazem 100KB+ pra parsear coisas
 *    que não usamos (lente, ISO, etc)
 *  - O parser aqui cobre os 2 casos práticos: JPEG com APP1/Exif
 *
 * Se a foto não tiver EXIF (geralmente porque foi editada/comprimida
 * por app de chat), `extractExif` retorna `{ hasExif: false }` —
 * a UI deve sinalizar "foto possivelmente editada" e quem aprova decide.
 */

export interface ExifResult {
  hasExif: boolean
  /** Data/hora de captura (DateTimeOriginal). */
  dateTime?: Date
  /** GPS lat (graus decimais). */
  gpsLat?: number
  /** GPS lng. */
  gpsLng?: number
  /** Origem do parse (debug). */
  source?: 'exif' | 'no-exif' | 'parse-error'
}

/** Lê uint16 big-endian. */
function readU16(view: DataView, offset: number, le: boolean): number {
  return view.getUint16(offset, le)
}
/** Lê uint32 big-endian (ou little). */
function readU32(view: DataView, offset: number, le: boolean): number {
  return view.getUint32(offset, le)
}

/** Converte string EXIF YYYY:MM:DD HH:MM:SS pra Date. */
function parseExifDate(s: string): Date | undefined {
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
  if (!m) return undefined
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`)
}

/** Lê string ASCII null-terminated do TIFF. */
function readAscii(view: DataView, offset: number, len: number): string {
  let s = ''
  for (let i = 0; i < len; i++) {
    const c = view.getUint8(offset + i)
    if (c === 0) break
    s += String.fromCharCode(c)
  }
  return s
}

/** Converte rational (num/den) array em decimal. */
function rationalToDeg(view: DataView, offset: number, le: boolean): number {
  // GPS é 3 rationals: graus, minutos, segundos
  const deg = readU32(view, offset,     le) / readU32(view, offset + 4,  le)
  const min = readU32(view, offset + 8, le) / readU32(view, offset + 12, le)
  const sec = readU32(view, offset + 16, le) / readU32(view, offset + 20, le)
  return deg + min / 60 + sec / 3600
}

export async function extractExif(file: File): Promise<ExifResult> {
  try {
    if (!file.type.startsWith('image/')) return { hasExif: false, source: 'no-exif' }
    // EXIF normalmente nos primeiros 64KB
    const buf = await file.slice(0, 65536).arrayBuffer()
    const view = new DataView(buf)
    if (view.byteLength < 4) return { hasExif: false, source: 'no-exif' }

    // SOI = FFD8
    if (readU16(view, 0, false) !== 0xFFD8) return { hasExif: false, source: 'no-exif' }

    let offset = 2
    while (offset < view.byteLength - 4) {
      const marker = readU16(view, offset, false)
      const size = readU16(view, offset + 2, false)
      // APP1 = FFE1, contém Exif
      if (marker === 0xFFE1) {
        // String "Exif\0\0" começa em offset+4
        if (readAscii(view, offset + 4, 4) !== 'Exif') break
        const tiffStart = offset + 10 // após "Exif\0\0"
        const byteOrder = readU16(view, tiffStart, false)
        const le = byteOrder === 0x4949 // 'II'
        if (readU16(view, tiffStart + 2, le) !== 0x002A) break

        const ifd0Offset = readU32(view, tiffStart + 4, le)
        const ifd0Pos = tiffStart + ifd0Offset
        const numEntries = readU16(view, ifd0Pos, le)

        let exifIfdOffset: number | null = null
        let gpsIfdOffset: number | null = null

        for (let i = 0; i < numEntries; i++) {
          const entryPos = ifd0Pos + 2 + i * 12
          const tag = readU16(view, entryPos, le)
          if (tag === 0x8769) exifIfdOffset = readU32(view, entryPos + 8, le) + tiffStart
          if (tag === 0x8825) gpsIfdOffset  = readU32(view, entryPos + 8, le) + tiffStart
        }

        const result: ExifResult = { hasExif: true, source: 'exif' }

        // Lê DateTimeOriginal do EXIF IFD
        if (exifIfdOffset !== null && exifIfdOffset < view.byteLength - 2) {
          const eN = readU16(view, exifIfdOffset, le)
          for (let i = 0; i < eN; i++) {
            const ep = exifIfdOffset + 2 + i * 12
            const tag = readU16(view, ep, le)
            if (tag === 0x9003) { // DateTimeOriginal
              const valOff = readU32(view, ep + 8, le) + tiffStart
              const dt = readAscii(view, valOff, 19)
              result.dateTime = parseExifDate(dt)
              break
            }
          }
        }

        // Lê GPS do GPS IFD
        if (gpsIfdOffset !== null && gpsIfdOffset < view.byteLength - 2) {
          const gN = readU16(view, gpsIfdOffset, le)
          let latRef = 'N', lngRef = 'E', latVal: number | null = null, lngVal: number | null = null
          for (let i = 0; i < gN; i++) {
            const gp = gpsIfdOffset + 2 + i * 12
            const tag = readU16(view, gp, le)
            if (tag === 1) latRef = String.fromCharCode(view.getUint8(gp + 8))
            if (tag === 3) lngRef = String.fromCharCode(view.getUint8(gp + 8))
            if (tag === 2) {
              const valOff = readU32(view, gp + 8, le) + tiffStart
              latVal = rationalToDeg(view, valOff, le)
            }
            if (tag === 4) {
              const valOff = readU32(view, gp + 8, le) + tiffStart
              lngVal = rationalToDeg(view, valOff, le)
            }
          }
          if (latVal != null) result.gpsLat = latRef === 'S' ? -latVal : latVal
          if (lngVal != null) result.gpsLng = lngRef === 'W' ? -lngVal : lngVal
        }

        return result
      }
      offset += 2 + size
    }
    return { hasExif: false, source: 'no-exif' }
  } catch {
    return { hasExif: false, source: 'parse-error' }
  }
}

/**
 * Retorna alerta humano sobre a foto.
 * Usado pela UI pra exibir warning ao operador.
 */
export function avaliarExif(exif: ExifResult, opts: {
  /** Idade máxima da foto em horas (default: 168 = 7 dias). */
  maxIdadeHoras?: number
  /** Coords da obra pra checar proximidade (raio em km). */
  obraCoords?: { lat: number; lng: number; raioKm: number }
} = {}): { ok: boolean; warnings: string[] } {
  const warnings: string[] = []
  if (!exif.hasExif) {
    warnings.push('Foto sem EXIF — pode ter sido editada ou compartilhada via app de mensagens.')
    return { ok: false, warnings }
  }
  if (!exif.dateTime) {
    warnings.push('Foto sem data/hora EXIF.')
  } else {
    const idadeMs = Date.now() - exif.dateTime.getTime()
    const idadeH = idadeMs / 3600_000
    const max = opts.maxIdadeHoras ?? 168
    if (idadeH > max) {
      warnings.push(`Foto com mais de ${Math.round(max / 24)} dias (${exif.dateTime.toISOString()}).`)
    }
    if (idadeMs < 0) warnings.push('Data EXIF no futuro — possível adulteração.')
  }
  if (opts.obraCoords && exif.gpsLat != null && exif.gpsLng != null) {
    const dist = haversineKm(exif.gpsLat, exif.gpsLng, opts.obraCoords.lat, opts.obraCoords.lng)
    if (dist > opts.obraCoords.raioKm) {
      warnings.push(`Foto a ${dist.toFixed(1)}km da obra (raio configurado: ${opts.obraCoords.raioKm}km).`)
    }
  } else if (opts.obraCoords) {
    warnings.push('Sem GPS na foto — não dá pra confirmar local.')
  }
  return { ok: warnings.length === 0, warnings }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
