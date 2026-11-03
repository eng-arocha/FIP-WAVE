// ============================================================
// FIP-WAVE — Limpeza do Storage (bucket faturamento-direto)
//
// Nasceu da restrição do Supabase Free em out/2026: 1,48 GB de NFs
// escaneadas (4-18 MB cada) estouraram a cota de 1 GB. Faz três coisas:
//
//   1. Backup local de TODOS os arquivos do bucket (sempre, antes de mexer)
//   2. Apaga NFs órfãs — arquivo em nfs-fat-direto/ que nenhuma linha de
//      notas_fiscais_fat_direto referencia (upload abandonado no meio)
//   3. Recomprime os PDFs restantes no MESMO path (URL não muda)
//
// Uso (PowerShell):
//   $env:SUPABASE_SERVICE_ROLE_KEY = "<service_role>"
//   npx vite-node scripts/storage-cleanup.ts            # só relatório + backup
//   npx vite-node scripts/storage-cleanup.ts --apply    # executa 2 e 3
//
// Backup em C:\dev\FIP-WAVE-storage-backup (fora do repo e do OneDrive).
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { recompressPdfImages } from '../lib/server/pdf-recompress'

const SUPABASE_URL = 'https://ktfoozriunzoeeoqfpns.supabase.co'
const BUCKET = 'faturamento-direto'
const BACKUP_DIR = 'C:\\dev\\FIP-WAVE-storage-backup'
/** Não mexe em arquivo mais novo que isso — pode ser upload em andamento. */
const IDADE_MIN_ORFAO_MS = 24 * 60 * 60 * 1000
/** PDFs menores que isso já estão bons. */
const MIN_BYTES_COMPRIMIR = 400 * 1024

// Opcional: ler de um .env (ex.: `vercel env pull`) via ENV_FILE=caminho
if (process.env.ENV_FILE) process.loadEnvFile(process.env.ENV_FILE)
// Variável da Vercel às vezes vem com "\n" literal ou espaço no fim
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/\\n/g, '').trim()
const APPLY = process.argv.includes('--apply')
if (!KEY) {
  console.error('❌  Defina SUPABASE_SERVICE_ROLE_KEY (Dashboard → Settings → API Keys → service_role)')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

interface Obj { path: string; size: number; createdAt: number }

const mb = (b: number) => (b / 1024 / 1024).toFixed(1) + ' MB'

/** Lista recursiva do bucket (a API só lista um nível por vez). */
async function listar(prefixo = ''): Promise<Obj[]> {
  const out: Obj[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefixo, { limit: 1000, offset })
    if (error) throw error
    if (!data?.length) break
    for (const item of data) {
      const path = prefixo ? `${prefixo}/${item.name}` : item.name
      if (item.id === null) out.push(...await listar(path)) // pasta
      else out.push({
        path,
        size: Number((item.metadata as any)?.size ?? 0),
        createdAt: new Date(item.created_at ?? 0).getTime(),
      })
    }
    if (data.length < 1000) break
  }
  return out
}

async function baixar(path: string): Promise<Buffer> {
  const { data, error } = await sb.storage.from(BUCKET).download(path)
  if (error || !data) throw error ?? new Error('download vazio')
  return Buffer.from(await data.arrayBuffer())
}

async function main() {
  console.log(`\n== Storage cleanup — ${APPLY ? 'APLICANDO' : 'só relatório'} ==\n`)

  const objs = await listar()
  const total = objs.reduce((s, o) => s + o.size, 0)
  console.log(`Arquivos no bucket: ${objs.length} (${mb(total)})`)

  // ── 1. Backup ────────────────────────────────────────────
  let baixados = 0
  for (const o of objs) {
    const dest = join(BACKUP_DIR, ...o.path.split('/'))
    if (existsSync(dest)) continue
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, await baixar(o.path))
    if (++baixados % 25 === 0) console.log(`  backup: ${baixados} baixados…`)
  }
  console.log(`Backup ok em ${BACKUP_DIR} (${baixados} novos)`)

  // ── 2. Órfãos ────────────────────────────────────────────
  const { data: nfs, error } = await sb.from('notas_fiscais_fat_direto').select('arquivo_url').not('arquivo_url', 'is', null)
  if (error) throw error
  const prefixoUrl = `/storage/v1/object/public/${BUCKET}/`
  const referenciados = new Set(
    (nfs ?? []).map((n: any) => decodeURIComponent(String(n.arquivo_url).split(prefixoUrl)[1] ?? '')),
  )
  const agora = Date.now()
  const orfaos = objs.filter(o =>
    o.path.startsWith('nfs-fat-direto/') &&
    !referenciados.has(o.path) &&
    agora - o.createdAt > IDADE_MIN_ORFAO_MS,
  )
  console.log(`\nNFs órfãs: ${orfaos.length} (${mb(orfaos.reduce((s, o) => s + o.size, 0))})`)

  // ── 3. Compressão ────────────────────────────────────────
  const candidatos = objs.filter(o =>
    o.path.toLowerCase().endsWith('.pdf') &&
    o.size >= MIN_BYTES_COMPRIMIR &&
    !orfaos.includes(o),
  )
  console.log(`PDFs a comprimir: ${candidatos.length} (${mb(candidatos.reduce((s, o) => s + o.size, 0))})`)

  if (!APPLY) {
    // Estimativa: comprime de verdade (em memória, a partir do backup) sem subir nada
    let antes = 0, depois = 0
    for (const o of candidatos) {
      const buf = readFileSync(join(BACKUP_DIR, ...o.path.split('/')))
      const novo = await recompressPdfImages(buf)
      antes += buf.length
      depois += novo?.length ?? buf.length
    }
    const restante = total - orfaos.reduce((s, o) => s + o.size, 0) - antes + depois
    console.log(`\nEstimativa: PDFs ${mb(antes)} → ${mb(depois)}. Bucket ficaria com ~${mb(restante)}.`)
    console.log('Nada foi alterado. Rode com --apply para executar.\n')
    return
  }

  for (let i = 0; i < orfaos.length; i += 100) {
    const lote = orfaos.slice(i, i + 100).map(o => o.path)
    const { error: delErr } = await sb.storage.from(BUCKET).remove(lote)
    if (delErr) throw delErr
  }
  console.log(`✓ ${orfaos.length} órfãos apagados`)

  let antes = 0, depois = 0, falhas = 0
  for (const [i, o] of candidatos.entries()) {
    const buf = readFileSync(join(BACKUP_DIR, ...o.path.split('/')))
    const novo = await recompressPdfImages(buf)
    antes += buf.length
    if (!novo) { depois += buf.length; continue }
    const { error: upErr } = await sb.storage.from(BUCKET)
      .upload(o.path, novo, { contentType: 'application/pdf', upsert: true })
    if (upErr) { falhas++; depois += buf.length; console.warn(`  falhou ${o.path}: ${upErr.message}`); continue }
    depois += novo.length
    if ((i + 1) % 25 === 0) console.log(`  comprimidos ${i + 1}/${candidatos.length}…`)
  }
  console.log(`✓ PDFs ${mb(antes)} → ${mb(depois)} (${falhas} falhas)`)

  const final = (await listar()).reduce((s, o) => s + o.size, 0)
  console.log(`\nBucket agora: ${mb(final)}\n`)
}

main().catch(e => { console.error('❌', e); process.exit(1) })
