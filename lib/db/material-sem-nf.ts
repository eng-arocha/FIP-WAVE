// lib/db/material-sem-nf.ts
// Carrega o relatório "Material medido sem NF" (lib/relatorios/material-sem-nf.ts).
//
// Medido e descontado vêm da mesma fonte da Visão Geral (getDashboardFlat);
// pedidos e NFs por fornecedor seguem as regras de lib/db/dashboard.ts (passo
// 3): pedido aprovado não deletado, pedido de serviço da Wave fora, NF
// cancelada fora, NF rateada pelo peso do item no pedido, devolução abatida.
import { createAdminClient } from '@/lib/supabase/admin'
import { nfReservaSaldo } from '@/lib/db/nf-status'
import { withSchemaFallback } from '@/lib/db/resilient'
import { ehPedidoDeServicoWave } from '@/lib/db/saldo-detalhamento'
import { getDashboardFlat } from '@/lib/db/dashboard'
import {
  montarRelatorioMaterialSemNf,
  type FornecedorDoItem,
  type RelatorioMaterialSemNf,
} from '@/lib/relatorios/material-sem-nf'

/** "FIP ENGENHARIA ELÉTRICA LTDA" e "FIP ENGENHARIA ELETRICA" são o mesmo. */
function nomeFornecedor(razao: string | null | undefined): string {
  const s = String(razao ?? '').trim()
  if (!s) return 'Sem fornecedor'
  if (/^FIP ENGENHARIA/i.test(s)) return 'FIP ENGENHARIA ELÉTRICA'
  return s.replace(/\s+(LTDA|S\/?A|EIRELI|ME|EPP)\.?$/i, '')
}

export async function getRelatorioMaterialSemNf(contratoId: string): Promise<RelatorioMaterialSemNf> {
  const admin = createAdminClient()
  const flat = await getDashboardFlat(contratoId)

  const SOL_SELECT = `
      id, fornecedor_cnpj, fornecedor_razao_social,
      itens:itens_solicitacao_fat_direto ( detalhamento_id, valor_total, valor_devolvido ),
      nfs:notas_fiscais_fat_direto!solicitacao_id ( valor, status )
    `
  const solRes = await withSchemaFallback({
    primary: () => admin
      .from('solicitacoes_fat_direto')
      .select(`tipo, ${SOL_SELECT}`)
      .eq('contrato_id', contratoId)
      .eq('status', 'aprovado')
      .is('deletado_em', null),
    fallback: () => admin
      .from('solicitacoes_fat_direto')
      .select(SOL_SELECT)
      .eq('contrato_id', contratoId)
      .eq('status', 'aprovado')
      .is('deletado_em', null),
    missingColumns: ['tipo', 'valor_devolvido'],
    context: 'material_sem_nf_solicitacoes',
  })
  if (solRes.error) throw solRes.error

  // detalhamento → fornecedor → { pedido, nf }
  const porDet = new Map<string, Map<string, FornecedorDoItem>>()
  for (const sol of (solRes.data || []) as Array<{
    tipo?: string | null
    fornecedor_cnpj?: string | null
    fornecedor_razao_social?: string | null
    itens: Array<{ detalhamento_id: string | null; valor_total: number | string | null; valor_devolvido?: number | string | null }> | null
    nfs: Array<{ valor: number | string | null; status: string | null }> | null
  }>) {
    if (ehPedidoDeServicoWave(sol)) continue
    const itens = (sol.itens || [])
      .map(it => ({
        detId: it.detalhamento_id,
        valor: Math.max(0, Number(it.valor_total || 0) - Number(it.valor_devolvido || 0)),
      }))
      .filter((x): x is { detId: string; valor: number } => !!x.detId)
    const totalSol = itens.reduce((s, it) => s + it.valor, 0)
    if (!(totalSol > 0)) continue
    const totalNfs = (sol.nfs || [])
      .filter(nf => nfReservaSaldo(nf.status))
      .reduce((s, nf) => s + Number(nf.valor || 0), 0)
    const nome = nomeFornecedor(sol.fornecedor_razao_social)
    for (const it of itens) {
      let forn = porDet.get(it.detId)
      if (!forn) porDet.set(it.detId, (forn = new Map()))
      const atual = forn.get(nome) ?? { fornecedor: nome, pedido: 0, nf: 0 }
      atual.pedido += it.valor
      atual.nf += totalNfs * (it.valor / totalSol)
      forn.set(nome, atual)
    }
  }

  // Pedido da FIP ainda não aprovado: o botão "Gerar pedido FIP" não pode
  // criar um segundo para o mesmo material.
  const fipEmAndamento = new Map<string, number>()
  {
    const { data, error } = await admin
      .from('solicitacoes_fat_direto')
      .select('tipo, fornecedor_razao_social, status, itens:itens_solicitacao_fat_direto ( detalhamento_id, valor_total )')
      .eq('contrato_id', contratoId)
      .not('status', 'in', '(aprovado,encerrado,rejeitado)')
      .is('deletado_em', null)
    if (error) console.warn('[material-sem-nf] pedidos FIP em andamento:', error.message)
    for (const sol of (data || []) as Array<{
      tipo?: string | null
      fornecedor_razao_social?: string | null
      itens: Array<{ detalhamento_id: string | null; valor_total: number | string | null }> | null
    }>) {
      if (sol.tipo !== 'fip_material' && !/^FIP ENGENHARIA/i.test(String(sol.fornecedor_razao_social ?? '').trim())) continue
      for (const it of sol.itens || []) {
        if (!it.detalhamento_id) continue
        fipEmAndamento.set(it.detalhamento_id, (fipEmAndamento.get(it.detalhamento_id) || 0) + Number(it.valor_total || 0))
      }
    }
  }

  const nomePorCodigo = new Map(flat.map(({ item }) => [item.codigo, item.nome]))
  const itens = flat
    .filter(({ item }) => item.nivel === 3)
    .map(({ item }) => ({
      id: item.id,
      codigo: item.codigo,
      nome: item.nome,
      materialContratado: item.valor_contratado_material,
      materialMedido: item.material_medido,
      materialDescontado: item.material_descontado,
      fipEmAndamento: Math.round((fipEmAndamento.get(item.id) || 0) * 100) / 100,
      fornecedores: Array.from(porDet.get(item.id)?.values() ?? [])
        .map(f => ({ ...f, pedido: Math.round(f.pedido * 100) / 100, nf: Math.round(f.nf * 100) / 100 }))
        .sort((a, b) => b.pedido - a.pedido),
    }))

  return montarRelatorioMaterialSemNf(itens, balde => nomePorCodigo.get(balde) ?? balde)
}
