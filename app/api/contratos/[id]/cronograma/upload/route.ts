import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { assertPermissao } from '@/lib/api/auth'
import * as XLSX from 'xlsx'

/**
 * POST /api/contratos/[id]/cronograma/upload?tipo=fisico|fatdireto
 *
 * Body: multipart/form-data com campo "file" contendo o .xlsx gerado pelo
 * endpoint /template (ou mesmo schema).
 *
 * Formato esperado:
 *   Cabeçalho row 1: [grupo_codigo, grupo_nome, tarefa_codigo, tarefa_nome,
 *                     det_codigo, det_descricao, detalhamento_id, peso_R$,
 *                     YYYY-MM-01, YYYY-MM-01, ...]
 *   A partir da row 2, cada linha = um detalhamento.
 *   Colunas MES (YYYY-MM-DD) com valores em %.
 *
 * Apenas o NÍVEL 3 (detalhamento) é aceito. Linhas sem detalhamento_id são
 * ignoradas. Percentuais vazios/null são ignorados (não sobrescreve). 0 é
 * respeitado como zero explícito.
 *
 * Segurança: admin OU permissão 'cronograma.editar'.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: contratoId } = await params
    const url = new URL(req.url)
    const tipo = url.searchParams.get('tipo') === 'fatdireto' ? 'fatdireto' : 'fisico'

    const auth = await assertPermissao('cronograma', 'editar')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'file ausente' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const wb = XLSX.read(arrayBuffer, { type: 'array' })

    // Aceita primeira aba ou uma chamada 'Fisico'/'FatDireto'
    const sheetName = wb.SheetNames.find(n => n.toLowerCase().startsWith(tipo === 'fisico' ? 'fisic' : 'fatd')) || wb.SheetNames[0]
    const ws = wb.Sheets[sheetName]
    if (!ws) return NextResponse.json({ error: 'aba não encontrada' }, { status: 400 })

    const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
    if (aoa.length < 2) return NextResponse.json({ error: 'planilha vazia' }, { status: 400 })

    const header = aoa[0].map((v: any) => String(v ?? '').trim())
    const idColIdx = header.indexOf('detalhamento_id')
    if (idColIdx < 0) return NextResponse.json({ error: 'coluna detalhamento_id ausente no cabeçalho' }, { status: 400 })

    // Colunas de mês: cabeçalhos YYYY-MM-DD ou YYYY-MM
    const mesColIdxs: { col: number; mes: string }[] = []
    header.forEach((h, i) => {
      const s = h.trim()
      const mDate = s.match(/^(\d{4})-(\d{2})(-(\d{2}))?$/)
      if (mDate) {
        const y = mDate[1], mo = mDate[2]
        mesColIdxs.push({ col: i, mes: `${y}-${mo}-01` })
      }
    })
    if (mesColIdxs.length === 0) return NextResponse.json({ error: 'nenhuma coluna de mês encontrada (esperado YYYY-MM-01)' }, { status: 400 })

    // Valida detalhamentos pertencem ao contrato
    const admin = createAdminClient()
    const { data: dets } = await admin
      .from('detalhamentos')
      .select('id, tarefa:tarefas!inner(grupo_macro:grupos_macro!inner(contrato_id))')
      .eq('tarefa.grupo_macro.contrato_id', contratoId)
    const detsValidos = new Set((dets || []).map((d: any) => d.id))

    const updates: { detalhamento_id: string; mes: string; pct_planejado: number }[] = []
    let linhasIgnoradas = 0
    let detsIgnorados = 0

    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r]
      if (!row || row.every((c: any) => c === null || c === '')) continue
      const detId = String(row[idColIdx] ?? '').trim()
      if (!detId || !/^[0-9a-f-]{36}$/i.test(detId)) { linhasIgnoradas++; continue }
      if (!detsValidos.has(detId)) { detsIgnorados++; continue }
      for (const { col, mes } of mesColIdxs) {
        const raw = row[col]
        if (raw === null || raw === undefined || raw === '') continue
        let n: number
        if (typeof raw === 'number') n = raw
        else {
          let s = String(raw).trim().replace('%', '').replace(/\s/g, '')
          if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
          n = Number(s)
        }
        if (!isFinite(n)) continue
        if (n < 0 || n > 1000) continue
        updates.push({ detalhamento_id: detId, mes, pct_planejado: n })
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'nenhum valor válido para importar', linhasIgnoradas, detsIgnorados }, { status: 400 })
    }

    const table = tipo === 'fisico' ? 'planejamento_fisico_det' : 'planejamento_fat_direto_det'
    // upsert em chunks de 1000 pra não estourar
    let total = 0
    for (let i = 0; i < updates.length; i += 1000) {
      const slice = updates.slice(i, i + 1000)
      const { error } = await admin.from(table).upsert(slice, { onConflict: 'detalhamento_id,mes' })
      if (error) throw error
      total += slice.length
    }

    return NextResponse.json({
      tipo,
      atualizados: total,
      linhas_ignoradas: linhasIgnoradas,
      detalhamentos_fora_do_contrato: detsIgnorados,
      meses_processados: mesColIdxs.length,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
