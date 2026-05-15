import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { assertPermissao } from '@/lib/api/auth'
import * as XLSX from 'xlsx'

/**
 * POST /api/contratos/[id]/planilha/upload
 *
 * Auto-detecta o tipo do arquivo e aplica:
 *
 *   ┌───────────────────────┬───────────────────────┬──────────────────────┐
 *   │  Arquivo              │  Orçamento atualizado │  Cronograma aplicado │
 *   ├───────────────────────┼───────────────────────┼──────────────────────┤
 *   │  FÍSICO FINANCEIRO    │  QTDE + PR.Mat + PR.MO│  planejamento_fisico │
 *   │  (tem col PR.UNIT M.O)│                       │                      │
 *   ├───────────────────────┼───────────────────────┼──────────────────────┤
 *   │  FATURAMENTO DIRETO   │  NADA (à prova de    │  planejamento_fat_   │
 *   │  (sem col PR.UNIT M.O)│  erro — só curva %)  │  direto              │
 *   └───────────────────────┴───────────────────────┴──────────────────────┘
 *
 * Só NÍVEL=3 vira update. Match por ITEM (código) ou detalhamento_id.
 *
 * Segurança: permissão 'cronograma.editar'.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

function toNumberBR(v: any): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  const s = String(v).trim().replace(/[R$\s]/g, '').replace('%', '')
  if (!s) return undefined
  const hasComma = s.includes(','), hasDot = s.includes('.')
  let norm = s
  if (hasComma && hasDot) norm = s.replace(/\./g, '').replace(',', '.')
  else if (hasComma) norm = s.replace(',', '.')
  const n = Number(norm)
  return Number.isFinite(n) ? n : undefined
}

function headerToMes(cell: any): string | null {
  if (cell instanceof Date) {
    const y = cell.getUTCFullYear(), m = cell.getUTCMonth() + 1
    return `${y}-${String(m).padStart(2, '0')}-01`
  }
  if (typeof cell === 'number') {
    if (cell < 20000 || cell > 80000) return null
    const ms = (cell - 25569) * 86400 * 1000
    const d = new Date(ms)
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1
    return `${y}-${String(m).padStart(2, '0')}-01`
  }
  if (typeof cell === 'string') {
    const mDate = cell.trim().match(/^(\d{4})-(\d{2})(-(\d{2}))?$/)
    if (mDate) return `${mDate[1]}-${mDate[2]}-01`
  }
  return null
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: contratoId } = await params

    const auth = await assertPermissao('cronograma', 'editar')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const url = new URL(req.url)
    const reset = url.searchParams.get('reset') === '1'

    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'arquivo ausente' }, { status: 400 })

    const ab = await file.arrayBuffer()
    const wb = XLSX.read(new Uint8Array(ab), { type: 'array', cellDates: true })

    // Escolhe a aba: prioriza nomes conhecidos, senão primeira cujo header começa com NÍVEL
    let sheetName = wb.SheetNames.find(n => /f[ií]sico\s*financeiro/i.test(n))
      || wb.SheetNames.find(n => /faturamento\s*direto/i.test(n))
    if (!sheetName) {
      sheetName = wb.SheetNames.find(sn => {
        const a = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null })
        const h = (a[0] || []) as any[]
        return String(h[0] ?? '').trim().toUpperCase() === 'NÍVEL'
      })
    }
    if (!sheetName) return NextResponse.json({ error: 'planilha não reconhecida — aba deve ser FÍSICO FINANCEIRO ou FATURAMENTO DIRETO (ou começar com coluna NÍVEL)' }, { status: 400 })

    const ws = wb.Sheets[sheetName]
    const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null })
    if (aoa.length < 2) return NextResponse.json({ error: 'planilha vazia' }, { status: 400 })

    const header = aoa[0] as any[]
    const headUp = header.map(h => String(h ?? '').replace(/\r|\n/g, ' ').trim().toUpperCase())
    const findCol = (...names: string[]) => headUp.findIndex(h => names.some(n => h === n.toUpperCase()))

    const iNivel = findCol('NÍVEL', 'NIVEL')
    const iItem  = findCol('ITEM')
    const iQtd   = findCol('QTDE', 'QUANTIDADE')
    const iMat   = findCol('PR. UNIT MATERIAL', 'PR.UNIT MATERIAL', 'PR UNIT MATERIAL', 'VALOR_MATERIAL_UNIT')
    const iMo    = findCol('PR. UNIT M.O.', 'PR.UNIT M.O.', 'PR UNIT M.O.', 'PR UNIT MO', 'PR. UNIT MO', 'VALOR_SERVICO_UNIT')
    const iId    = findCol('DETALHAMENTO_ID')
    const iDesc  = findCol('ATIVIDADE INSTALAÇÕES GLOBAL', 'ATIVIDADE INSTALACOES GLOBAL', 'ATIVIDADE', 'DESCRICAO', 'DESCRIÇÃO', 'DESCRIPTION')
    const iLocal = findCol('LOCAL')
    const iDisc  = findCol('DISCIPLINA', 'DISCIPLINE')

    if (iNivel < 0) return NextResponse.json({ error: 'coluna NÍVEL ausente' }, { status: 400 })
    if (iItem < 0 && iId < 0) return NextResponse.json({ error: 'coluna ITEM (código) ou detalhamento_id necessária' }, { status: 400 })

    // AUTO-DETECT: físico tem PR.UNIT M.O.; fat direto NÃO tem
    const tipo: 'fisico' | 'fatdireto' = (iMo >= 0 || /f[ií]sico/i.test(sheetName))
      ? 'fisico'
      : 'fatdireto'

    // Colunas de mês — tenta linha 0 (header tradicional) e cai para linha 1
    // quando o arquivo segue o padrão "upload" (meses na linha do GERAL).
    const scanMesRow = (r: number): { col: number; mes: string }[] => {
      const out: { col: number; mes: string }[] = []
      const row = aoa[r] || []
      for (let c = 0; c < Math.max(header.length, row.length); c++) {
        const raw = row[c]
        const s = String(raw ?? '').trim().toUpperCase()
        if (s === 'TOTAL' || s === 'DETALHAMENTO_ID') continue
        const mes = headerToMes(raw)
        if (mes) out.push({ col: c, mes })
      }
      return out
    }
    let mesColIdxs = scanMesRow(0)
    // Se não achou meses em row 0, tenta row 1 (padrão "upload" do FIP-WAVE)
    // e nesse caso a primeira linha de dados passa a ser row 2.
    let dataStartRow = 1
    if (mesColIdxs.length === 0 && aoa.length >= 3) {
      const fromRow1 = scanMesRow(1)
      if (fromRow1.length > 0) {
        mesColIdxs = fromRow1
        dataStartRow = 2
      }
    }

    const admin = createAdminClient()
    // Carrega detalhamentos com tarefa_id pra achar a tarefa pai quando
    // criar items novos. Tambem carrega tarefas e grupos macro do
    // contrato pra resolver onde inserir um codigo novo (ex: 17.2.5
    // → tarefa 17.2 que esta no grupo macro 17).
    const { data: allDets, error: loadErr } = await admin
      .from('detalhamentos')
      .select(`
        id, codigo, descricao, unidade, quantidade_contratada,
        valor_material_unit, valor_servico_unit, ordem, tarefa_id,
        tarefa:tarefas!inner(id, codigo, grupo_macro:grupos_macro!inner(id, codigo, contrato_id))
      `)
      .eq('tarefa.grupo_macro.contrato_id', contratoId)
    if (loadErr) throw loadErr

    // Tarefas e grupos macro tambem (pra resolver pais ao criar novos
    // detalhamentos / criar tarefas novas)
    const { data: allTarefas } = await admin
      .from('tarefas')
      .select('id, codigo, nome, grupo_macro_id, grupo_macro:grupos_macro!inner(id, codigo, contrato_id)')
      .eq('grupo_macro.contrato_id', contratoId)
    const { data: allGrupos } = await admin
      .from('grupos_macro')
      .select('id, codigo, nome, tipo_medicao')
      .eq('contrato_id', contratoId)

    const byId     = new Map((allDets || []).map((d: any) => [d.id, d]))
    const byCodigo = new Map((allDets || []).map((d: any) => [String(d.codigo), d]))
    const tarefaByCod = new Map((allTarefas || []).map((t: any) => [String(t.codigo), t]))
    const grupoByCod = new Map((allGrupos || []).map((g: any) => [String(g.codigo), g]))

    const pctUpdates: { detalhamento_id: string; mes: string; pct_planejado: number }[] = []
    let orcAtualizados = 0, orcFalhas = 0
    let orcCriados = 0
    let tarefasCriadas = 0
    let linhasProcessadas = 0, linhasIgnoradas = 0
    const orcErros: string[] = []
    const codigosNovos: string[] = []
    const codigosIgnorados: string[] = []
    // Conjunto de codigos que aparecem na planilha (level 3) — usado depois
    // pra detectar "orfaos" = items no banco que NAO estao na planilha
    const codigosNaPlanilha = new Set<string>()

    for (let r = dataStartRow; r < aoa.length; r++) {
      const row = aoa[r] || []
      const nivel = Number(row[iNivel])
      if (nivel !== 3) continue
      linhasProcessadas++

      const codigoLinha = iItem >= 0 ? String(row[iItem] ?? '').trim() : ''
      const descricaoLinha = iDesc >= 0 ? String(row[iDesc] ?? '').trim() : ''
      const localLinha = iLocal >= 0 ? String(row[iLocal] ?? '').trim() : ''
      if (codigoLinha) codigosNaPlanilha.add(codigoLinha)

      let det: any = null
      if (iId >= 0) {
        const raw = String(row[iId] ?? '').trim()
        if (raw && /^[0-9a-f-]{36}$/i.test(raw)) det = byId.get(raw)
      }
      // Se o detalhamento_id resolveu pra um det cujo codigo NAO bate com
      // o ITEM da linha, a coluna detalhamento_id da planilha esta errada
      // (ex.: copiada da linha irma — 3.1.3 carregando o id de 3.1.1).
      // Descarta o match por id e casa por codigo, que e a fonte confiavel.
      if (det && codigoLinha && String(det.codigo) !== codigoLinha) det = null
      if (!det && codigoLinha) det = byCodigo.get(codigoLinha)

      if (!det) {
        // Codigo NOVO — tenta criar detalhamento. So pra tipo='fisico'
        // (planilha de orçamento; faturamento direto NAO cria estrutura).
        if (tipo !== 'fisico' || !codigoLinha) {
          linhasIgnoradas++
          if (codigoLinha) codigosIgnorados.push(codigoLinha)
          continue
        }
        // Resolve tarefa pai pelo prefixo do codigo (ex: '15.2.3' → tarefa '15.2')
        const partesCod = codigoLinha.split('.')
        if (partesCod.length < 3) {
          linhasIgnoradas++
          codigosIgnorados.push(`${codigoLinha} (codigo nivel 3 deve ter 3 partes)`)
          continue
        }
        const codigoTarefa = `${partesCod[0]}.${partesCod[1]}`
        const codigoGrupo = partesCod[0]
        let tarefaPai: any = tarefaByCod.get(codigoTarefa)
        // Se a tarefa pai nao existe, tenta criar (precisa do grupo macro)
        if (!tarefaPai) {
          const grupoPai = grupoByCod.get(codigoGrupo)
          if (!grupoPai) {
            linhasIgnoradas++
            codigosIgnorados.push(`${codigoLinha} (grupo macro ${codigoGrupo} nao existe)`)
            continue
          }
          // Cria tarefa nova no grupo, com nome inicial = descricao da
          // primeira linha (sera atualizado se vierem mais linhas dessa
          // tarefa). Ordem = quantidade de tarefas + 1.
          const ordemNova = (allTarefas || []).filter((t: any) => t.grupo_macro_id === grupoPai.id).length + 1
          const { data: novaTarefa, error: errTar } = await admin
            .from('tarefas')
            .insert({
              grupo_macro_id: grupoPai.id,
              codigo: codigoTarefa,
              nome: descricaoLinha || codigoTarefa,
              unidade: 'UN',
              quantidade_contratada: 1,
              valor_unitario: 0,
              valor_total: 0,
              ordem: ordemNova,
            })
            .select('id, codigo, grupo_macro_id')
            .single()
          if (errTar) {
            linhasIgnoradas++
            orcErros.push(`falha ao criar tarefa ${codigoTarefa}: ${errTar.message}`)
            continue
          }
          tarefaPai = novaTarefa
          tarefaByCod.set(codigoTarefa, novaTarefa)
          tarefasCriadas++
        }

        // Cria detalhamento novo. valor_total e GENERATED no schema entao
        // nao envia. Ordem = posicao do codigo (parte 3).
        const ordem = parseInt(partesCod[2] || '0', 10) || 0
        const insertPayload: any = {
          tarefa_id: tarefaPai.id,
          codigo: codigoLinha,
          descricao: descricaoLinha || codigoLinha,
          unidade: 'UN',
          quantidade_contratada: iQtd >= 0 ? (toNumberBR(row[iQtd]) ?? 1) : 1,
          ordem,
        }
        if (iMat >= 0) insertPayload.valor_material_unit = toNumberBR(row[iMat]) ?? 0
        if (iMo >= 0)  insertPayload.valor_servico_unit  = toNumberBR(row[iMo])  ?? 0
        // valor_unitario tambem e GENERATED (= mat + mo)? Verificar schema.
        // Se nao for, calcular aqui:
        const matUni = insertPayload.valor_material_unit ?? 0
        const moUni  = insertPayload.valor_servico_unit  ?? 0
        insertPayload.valor_unitario = matUni + moUni

        const { data: novoDet, error: errDet } = await admin
          .from('detalhamentos')
          .insert(insertPayload)
          .select('id, codigo, tarefa_id')
          .single()
        if (errDet) {
          orcFalhas++
          if (orcErros.length < 5) orcErros.push(`falha ao criar ${codigoLinha}: ${errDet.message}`)
          continue
        }
        det = novoDet
        byCodigo.set(codigoLinha, novoDet)
        orcCriados++
        codigosNovos.push(codigoLinha)
      } else {
        // Codigo EXISTE — atualiza campos
        const patch: any = {}
        if (tipo === 'fisico') {
          if (iQtd >= 0) { const v = toNumberBR(row[iQtd]); if (v !== undefined) patch.quantidade_contratada = v }
          if (iMat >= 0) { const v = toNumberBR(row[iMat]); if (v !== undefined) patch.valor_material_unit = v }
          if (iMo  >= 0) { const v = toNumberBR(row[iMo]);  if (v !== undefined) patch.valor_servico_unit  = v }
          // descricao e local atualizam se vieram nao-vazias na linha
          if (descricaoLinha && descricaoLinha !== det.descricao) patch.descricao = descricaoLinha
          // Se houver coluna 'unidade' diferente, idealmente atualizaria — pulado por agora
          // valor_unitario = mat + mo (se ambos vierem)
          if (patch.valor_material_unit !== undefined || patch.valor_servico_unit !== undefined) {
            const matUni = patch.valor_material_unit ?? det.valor_material_unit ?? 0
            const moUni  = patch.valor_servico_unit  ?? det.valor_servico_unit  ?? 0
            patch.valor_unitario = matUni + moUni
          }
        }
        if (Object.keys(patch).length > 0) {
          const { error: upErr } = await admin.from('detalhamentos').update(patch).eq('id', det.id)
          if (upErr) { orcFalhas++; if (orcErros.length < 5) orcErros.push(`${det.codigo}: ${upErr.message}`) }
          else orcAtualizados++
        }
      }

      // Percentuais
      for (const { col, mes } of mesColIdxs) {
        const raw = row[col]
        if (raw === null || raw === undefined || raw === '') continue
        const v = toNumberBR(raw)
        if (v === undefined) continue
        // Aceita decimal (0.08) ou inteiro (8) — detecta pelo valor
        const pct = Math.abs(v) <= 2 ? v * 100 : v
        if (pct < 0 || pct > 1000) continue
        pctUpdates.push({ detalhamento_id: det.id, mes, pct_planejado: pct })
      }
    }

    // Aplica curva APENAS na tabela correspondente ao tipo detectado
    const tableTipo = tipo === 'fisico' ? 'planejamento_fisico_det' : 'planejamento_fat_direto_det'
    let celulasAplicadas = 0
    let celulasLimpas = 0

    // Se reset=1, apaga TODAS as linhas da curva desse tipo para os detalhamentos
    // do contrato antes de inserir — garante que curvas antigas (meses ou
    // detalhamentos que não estão no novo arquivo) não fiquem como lixo.
    if (reset) {
      const detIds = (allDets || []).map((d: any) => d.id)
      if (detIds.length) {
        const { count, error: delErr } = await admin
          .from(tableTipo)
          .delete({ count: 'exact' })
          .in('detalhamento_id', detIds)
        if (delErr) throw delErr
        celulasLimpas = count ?? 0
      }
    }

    // Dedupe (detalhamento_id, mes) — a planilha pode trazer o mesmo
    // detalhamento em 2+ linhas (ex.: codigo repetido, ou detalhamento_id
    // que resolve no mesmo det de outra linha). Sem dedupe o upsert do
    // Postgres quebra com "ON CONFLICT DO UPDATE command cannot affect row
    // a second time". Ultima ocorrencia vence.
    const pctDedup = Array.from(
      new Map(pctUpdates.map(u => [`${u.detalhamento_id}|${u.mes}`, u])).values()
    )
    const celulasDuplicadas = pctUpdates.length - pctDedup.length

    if (pctDedup.length) {
      for (let i = 0; i < pctDedup.length; i += 1000) {
        const slice = pctDedup.slice(i, i + 1000)
        const { error } = await admin.from(tableTipo).upsert(slice, { onConflict: 'detalhamento_id,mes' })
        if (error) throw error
        celulasAplicadas += slice.length
      }
    }

    // Detecta orfaos: detalhamentos no banco cujo codigo NAO veio na
    // planilha. Usuario decide depois (manualmente ou via /api/admin/
    // limpar-orfaos-orcamento) — upload nao deleta nada.
    // Verifica tambem se cada orfao tem FK em medicao_itens ou
    // itens_solicitacao_fat_direto pra rotular como 'safe' ou 'em_uso'.
    type Orfao = { id: string; codigo: string; descricao: string; em_uso: boolean; refs: string[] }
    const orfaos: Orfao[] = []
    if (tipo === 'fisico') {
      for (const d of (allDets || []) as any[]) {
        if (codigosNaPlanilha.has(String(d.codigo))) continue
        // Checa FKs: medicao_itens, itens_solicitacao_fat_direto
        const refs: string[] = []
        const { count: cMI } = await admin
          .from('medicao_itens')
          .select('id', { count: 'exact', head: true })
          .eq('detalhamento_id', d.id)
        if ((cMI ?? 0) > 0) refs.push(`medicao_itens(${cMI})`)
        const { count: cFD } = await admin
          .from('itens_solicitacao_fat_direto')
          .select('id', { count: 'exact', head: true })
          .eq('detalhamento_id', d.id)
        if ((cFD ?? 0) > 0) refs.push(`itens_solicitacao_fat_direto(${cFD})`)
        orfaos.push({
          id: d.id,
          codigo: d.codigo,
          descricao: d.descricao,
          em_uso: refs.length > 0,
          refs,
        })
      }
    }
    const orfaosSafe = orfaos.filter(o => !o.em_uso)
    const orfaosEmUso = orfaos.filter(o => o.em_uso)

    return NextResponse.json({
      tipo_detectado: tipo,
      aba: sheetName,
      orcamento: {
        atualizados: orcAtualizados,
        criados: orcCriados,
        tarefas_criadas: tarefasCriadas,
        falhas: orcFalhas,
        erros: orcErros,
        codigos_novos: codigosNovos.slice(0, 20),
        codigos_ignorados: codigosIgnorados.slice(0, 20),
        orfaos_safe: orfaosSafe.map(o => ({ codigo: o.codigo, descricao: o.descricao, id: o.id })),
        orfaos_em_uso: orfaosEmUso.map(o => ({ codigo: o.codigo, refs: o.refs })),
        total_orfaos: orfaos.length,
      },
      cronograma: { tipo, celulas: celulasAplicadas, meses: mesColIdxs.length, limpas: celulasLimpas, duplicadas: celulasDuplicadas, reset },
      linhas_nivel3: linhasProcessadas,
      linhas_ignoradas: linhasIgnoradas,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
