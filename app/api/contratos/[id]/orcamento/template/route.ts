import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import * as XLSX from 'xlsx'

/**
 * GET /api/contratos/[id]/orcamento/template
 *
 * Baixa um .xlsx com o orçamento atual no formato da planilha oficial (8 colunas):
 *   Cód / Descrição / Local / Qtde / Unid / PR. Mat / PR. M.O. / Total
 *
 * Editáveis: Qtde, PR. Mat, PR. M.O.  (Total é fórmula)
 * Coluna técnica: detalhamento_id (I) — necessária para o upload encontrar a linha.
 *   ↳ Fica ao lado direito e pode ficar oculta no Excel (colunaI → botão direito → Ocultar).
 *
 * Ordenação: natural por código (1.2 < 1.10 < 2.1) nos três níveis.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

function cmpCodigo(a: string, b: string) {
  const pa = String(a || '').split('.').map(n => parseInt(n, 10) || 0)
  const pb = String(b || '').split('.').map(n => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0, db = pb[i] ?? 0
    if (da !== db) return da - db
  }
  return 0
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const admin = createAdminClient()

    const [{ data: contrato }, { data: grupos }, { data: tarefas }, { data: dets }] = await Promise.all([
      admin.from('contratos').select('numero_contrato').eq('id', id).single(),
      admin.from('grupos_macro').select('id, codigo, nome').eq('contrato_id', id),
      admin.from('tarefas').select('id, grupo_macro_id, codigo, nome'),
      admin.from('detalhamentos').select('id, tarefa_id, codigo, descricao, unidade, local, quantidade_contratada, valor_material_unit, valor_servico_unit'),
    ])

    const gruposOrd = [...(grupos || [])].sort((a: any, b: any) => cmpCodigo(a.codigo, b.codigo))
    const grupoIds = new Set(gruposOrd.map((g: any) => g.id))
    const grupoPorId = Object.fromEntries(gruposOrd.map((g: any) => [g.id, g]))
    const ordemGrupo: Record<string, number> = Object.fromEntries(gruposOrd.map((g: any, i: number) => [g.id, i]))

    const tarefasOrd = [...(tarefas || [])]
      .filter((t: any) => grupoIds.has(t.grupo_macro_id))
      .sort((a: any, b: any) => {
        const dg = (ordemGrupo[a.grupo_macro_id] ?? 0) - (ordemGrupo[b.grupo_macro_id] ?? 0)
        if (dg !== 0) return dg
        return cmpCodigo(a.codigo, b.codigo)
      })
    const tarefaIds = new Set(tarefasOrd.map((t: any) => t.id))
    const tarefaPorId = Object.fromEntries(tarefasOrd.map((t: any) => [t.id, t]))
    const ordemTarefa: Record<string, number> = Object.fromEntries(tarefasOrd.map((t: any, i: number) => [t.id, i]))

    const detsOrd = [...(dets || [])]
      .filter((d: any) => tarefaIds.has(d.tarefa_id))
      .sort((a: any, b: any) => {
        const dt = (ordemTarefa[a.tarefa_id] ?? 0) - (ordemTarefa[b.tarefa_id] ?? 0)
        if (dt !== 0) return dt
        return cmpCodigo(a.codigo, b.codigo)
      })

    // 8 colunas da planilha oficial + detalhamento_id técnico (I)
    const rows: any[][] = []

    // Row 1: grupo header (linha em negrito com contrato)
    // → vamos começar direto no header técnico para o parser pegar
    const header = [
      'Cód.',          // A
      'Descrição',     // B
      'Local',         // C
      'Qtde',          // D — editável
      'Unid',          // E
      'PR. Mat',       // F — editável (R$)
      'PR. M.O.',      // G — editável (R$)
      'Total',         // H — fórmula: D*(F+G)
      'detalhamento_id', // I — NÃO apagar
    ]
    rows.push(header)

    // Corpo: mantém grupos/tarefas como "linhas-cabeçalho" só para leitura visual
    // Para não confundir o upload, usamos células nas cols A..C e id em branco.
    // (o parser do /upload ignora linhas sem detalhamento_id numérico/uuid)
    let excelRow = 2
    for (const g of gruposOrd as any[]) {
      // cabeçalho do grupo
      rows.push([g.codigo, g.nome, '', '', '', '', '', '', ''])
      excelRow++
      const tarefasDoGrupo = tarefasOrd.filter((t: any) => t.grupo_macro_id === g.id)
      for (const t of tarefasDoGrupo as any[]) {
        rows.push([t.codigo, t.nome, '', '', '', '', '', '', ''])
        excelRow++
        const detsDaTarefa = detsOrd.filter((d: any) => d.tarefa_id === t.id)
        for (const d of detsDaTarefa as any[]) {
          const qtd = Number(d.quantidade_contratada ?? 0)
          const mat = Number(d.valor_material_unit ?? 0)
          const mo  = Number(d.valor_servico_unit ?? 0)
          rows.push([
            d.codigo,                        // A
            d.descricao,                     // B
            d.local ?? '',                   // C
            qtd,                             // D
            d.unidade ?? 'UN',               // E
            mat,                             // F
            mo,                              // G
            { f: `D${excelRow}*(F${excelRow}+G${excelRow})` }, // H
            d.id,                            // I
          ])
          excelRow++
        }
      }
    }

    // Total geral
    const lastRow = rows.length
    rows.push(['', 'TOTAL GERAL', '', '', '', '', '', { f: `SUM(H2:H${lastRow})` }, ''])

    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [
      { wch: 10 }, // A Cód
      { wch: 44 }, // B Descrição
      { wch: 18 }, // C Local
      { wch: 10 }, // D Qtde
      { wch: 6 },  // E Unid
      { wch: 14 }, // F PR. Mat
      { wch: 14 }, // G PR. M.O.
      { wch: 14 }, // H Total
      { wch: 38, hidden: true }, // I detalhamento_id (oculta por padrão)
    ]
    ws['!freeze'] = { xSplit: 0, ySplit: 1 } as any

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Orcamento')

    const inst = [
      ['INSTRUÇÕES — Template de Orçamento (planilha oficial, 8 colunas)'],
      [],
      ['Colunas: Cód / Descrição / Local / Qtde / Unid / PR. Mat / PR. M.O. / Total'],
      [],
      ['EDITÁVEIS: Qtde (D), PR. Mat (F), PR. M.O. (G).'],
      ['Total (H) é fórmula = Qtde × (PR.Mat + PR.MO) — não precisa digitar.'],
      [],
      ['Coluna I = detalhamento_id. Está OCULTA; NÃO apague — é usada pelo upload para achar a linha.'],
      ['Se precisar reexibi-la: selecione as colunas H e J, clique direito → Reexibir.'],
      [],
      ['Ajuste em massa (ex.: +10% em todas as PRs):'],
      ['  1. Escreva 1,10 em uma célula qualquer e copie (Ctrl+C).'],
      ['  2. Selecione o intervalo da coluna PR. Mat (somente números).'],
      ['  3. Menu Colar Especial → Multiplicar → OK.'],
      ['  4. Repita para PR. M.O.'],
      [],
      ['As linhas de Grupo/Tarefa são apenas visuais — o upload IGNORA (não têm detalhamento_id).'],
      ['Só as linhas de nível 3 (com PR.Mat / PR.MO) são atualizadas.'],
      [],
      ['Após salvar o xlsx, volte para o app → Estrutura → "Subir orçamento".'],
      [],
      ['Contrato: ' + (contrato?.numero_contrato ?? id)],
      ['Gerado em: ' + new Date().toISOString()],
    ]
    const wsInst = XLSX.utils.aoa_to_sheet(inst)
    wsInst['!cols'] = [{ wch: 110 }]
    XLSX.utils.book_append_sheet(wb, wsInst, 'Instruções')

    const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const body = new Uint8Array(buf)
    const filename = `orcamento-${contrato?.numero_contrato ?? id}.xlsx`
    return new Response(body, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    return apiError(e)
  }
}
