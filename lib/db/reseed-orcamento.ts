/**
 * Re-seed do orçamento a partir de lib/db/seed/orcamento-wave.json
 * (extraído da planilha oficial "Medição - Faturamento Direto.xlsx").
 *
 * Estratégia:
 *   1. Mapeia o que JÁ EXISTE por (codigo + local) pra preservar IDs.
 *   2. Updates idempotentes: se grupo/tarefa/detalhamento existe,
 *      só ATUALIZA valores (não muda id). Se não existe, insere.
 *   3. NÃO deleta nada — preserva solicitações, medições e histórico
 *      que referenciam tarefa_id / detalhamento_id.
 *   4. Relatório ao final: quantos inseridos vs atualizados + deltas.
 *
 * Segurança:
 *   - DRY_RUN opcional (não grava, só simula)
 *   - Restrito a admin (chamada vem de /api/admin/reseed-orcamento)
 */

import { createAdminClient } from '@/lib/supabase/admin'
import orcamento from './seed/orcamento-wave.json'

interface GrupoJson {
  codigo: string; nome: string; disciplina: string
  valor_material: number; valor_servico: number; ordem: number
}
interface TarefaJson {
  grupo_codigo: string; codigo: string; nome: string
  disciplina: string; local: string; qtde_contratada: number
  valor_material: number; valor_servico: number; ordem: number
}
interface DetalhJson {
  tarefa_codigo: string; codigo: string; descricao: string
  disciplina: string; local: string; unidade: string
  quantidade_contratada: number
  valor_material_unit: number
  valor_servico_unit: number
  ordem: number
}

export interface ReseedReport {
  dry_run: boolean
  grupos:         { inseridos: number; atualizados: number; inalterados: number }
  tarefas:        { inseridos: number; atualizados: number; inalterados: number }
  detalhamentos:  { inseridos: number; atualizados: number; inalterados: number }
  divergencias_antes: Array<{ codigo: string; antes: number; depois: number }>
  total_material: number
  total_mo: number
}

function aprox(a: number, b: number): boolean {
  return Math.abs(Number(a ?? 0) - Number(b ?? 0)) < 0.01
}

export async function reseedOrcamento(contratoId: string, opts: { dryRun?: boolean } = {}): Promise<ReseedReport> {
  const admin = createAdminClient()
  const dryRun = !!opts.dryRun

  const rep: ReseedReport = {
    dry_run: dryRun,
    grupos:        { inseridos: 0, atualizados: 0, inalterados: 0 },
    tarefas:       { inseridos: 0, atualizados: 0, inalterados: 0 },
    detalhamentos: { inseridos: 0, atualizados: 0, inalterados: 0 },
    divergencias_antes: [],
    total_material: (orcamento as any).total_material,
    total_mo: (orcamento as any).total_mo,
  }

  const g = (orcamento as any).grupos as GrupoJson[]
  const t = (orcamento as any).tarefas as TarefaJson[]
  const d = (orcamento as any).detalhamentos as DetalhJson[]

  // ── 1. Grupos ─────────────────────────────────────────────────────
  const { data: grExist } = await admin
    .from('grupos_macro')
    .select('id, codigo, valor_material, valor_servico, nome, ordem, disciplina')
    .eq('contrato_id', contratoId)
  const grMap = new Map<string, any>((grExist || []).map((x: any) => [x.codigo, x]))
  const grupoIdByCodigo = new Map<string, string>()

  for (const grupo of g) {
    const existente = grMap.get(grupo.codigo)
    if (existente) {
      grupoIdByCodigo.set(grupo.codigo, existente.id)
      const precisaUpdate =
        !aprox(existente.valor_material, grupo.valor_material) ||
        !aprox(existente.valor_servico, grupo.valor_servico) ||
        existente.nome !== grupo.nome ||
        existente.disciplina !== grupo.disciplina
      if (precisaUpdate) {
        if (!dryRun) {
          await admin.from('grupos_macro').update({
            nome: grupo.nome,
            valor_material: grupo.valor_material,
            valor_servico: grupo.valor_servico,
            valor_contratado: grupo.valor_material + grupo.valor_servico,
            disciplina: grupo.disciplina,
            ordem: grupo.ordem,
          }).eq('id', existente.id)
        }
        rep.grupos.atualizados++
        rep.divergencias_antes.push({
          codigo: grupo.codigo,
          antes: Number(existente.valor_material) + Number(existente.valor_servico),
          depois: grupo.valor_material + grupo.valor_servico,
        })
      } else {
        rep.grupos.inalterados++
      }
    } else {
      if (!dryRun) {
        const { data: novo } = await admin.from('grupos_macro').insert({
          contrato_id: contratoId,
          codigo: grupo.codigo,
          nome: grupo.nome,
          valor_material: grupo.valor_material,
          valor_servico: grupo.valor_servico,
          valor_contratado: grupo.valor_material + grupo.valor_servico,
          disciplina: grupo.disciplina,
          ordem: grupo.ordem,
          tipo_medicao: 'misto',
        }).select('id').single()
        if (novo) grupoIdByCodigo.set(grupo.codigo, novo.id)
      }
      rep.grupos.inseridos++
    }
  }

  // ── 2. Tarefas ────────────────────────────────────────────────────
  const grupoIds = Array.from(grupoIdByCodigo.values())
  const { data: tarefasExist } = await admin
    .from('tarefas')
    .select('id, codigo, grupo_macro_id, nome, valor_unitario, valor_total, quantidade_contratada')
    .in('grupo_macro_id', grupoIds.length ? grupoIds : ['00000000-0000-0000-0000-000000000000'])
  const tarefaMap = new Map<string, any>((tarefasExist || []).map((x: any) => [x.codigo, x]))
  const tarefaIdByCodigo = new Map<string, string>()

  for (const tarefa of t) {
    const gid = grupoIdByCodigo.get(tarefa.grupo_codigo)
    if (!gid) continue
    const existente = tarefaMap.get(tarefa.codigo)
    const valorUnit = tarefa.valor_material + tarefa.valor_servico
    const valorTotal = valorUnit * (tarefa.qtde_contratada || 1)
    if (existente) {
      tarefaIdByCodigo.set(tarefa.codigo, existente.id)
      const precisaUpdate =
        !aprox(existente.valor_unitario, valorUnit) ||
        !aprox(existente.quantidade_contratada, tarefa.qtde_contratada) ||
        existente.nome !== tarefa.nome
      if (precisaUpdate) {
        if (!dryRun) {
          await admin.from('tarefas').update({
            nome: tarefa.nome,
            disciplina: tarefa.disciplina,
            local: tarefa.local,
            quantidade_contratada: tarefa.qtde_contratada,
            valor_unitario: valorUnit,
            valor_total: valorTotal,
            ordem: tarefa.ordem,
          }).eq('id', existente.id)
        }
        rep.tarefas.atualizados++
      } else {
        rep.tarefas.inalterados++
      }
    } else {
      if (!dryRun) {
        const { data: nova } = await admin.from('tarefas').insert({
          grupo_macro_id: gid,
          codigo: tarefa.codigo,
          nome: tarefa.nome,
          disciplina: tarefa.disciplina,
          local: tarefa.local,
          quantidade_contratada: tarefa.qtde_contratada,
          valor_unitario: valorUnit,
          valor_total: valorTotal,
          ordem: tarefa.ordem,
        }).select('id').single()
        if (nova) tarefaIdByCodigo.set(tarefa.codigo, nova.id)
      }
      rep.tarefas.inseridos++
    }
  }

  // ── 3. Detalhamentos ──────────────────────────────────────────────
  const tarefaIds = Array.from(tarefaIdByCodigo.values())
  const { data: detExist } = await admin
    .from('detalhamentos')
    .select('id, codigo, tarefa_id, descricao, quantidade_contratada, valor_material_unit, valor_servico_unit, local')
    .in('tarefa_id', tarefaIds.length ? tarefaIds : ['00000000-0000-0000-0000-000000000000'])
  // Chave de matching: codigo + local — como planilha reusa códigos por local
  const detKey = (c: string, l: string) => `${c}|${l || ''}`
  const detMap = new Map<string, any>(
    (detExist || []).map((x: any) => [detKey(x.codigo, x.local ?? ''), x]),
  )

  for (const det of d) {
    const tid = tarefaIdByCodigo.get(det.tarefa_codigo)
    if (!tid) continue
    const key = detKey(det.codigo, det.local)
    const existente = detMap.get(key) || detMap.get(detKey(det.codigo, '')) // fallback sem local
    if (existente) {
      const precisaUpdate =
        !aprox(existente.valor_material_unit ?? 0, det.valor_material_unit) ||
        !aprox(existente.valor_servico_unit ?? 0, det.valor_servico_unit) ||
        !aprox(existente.quantidade_contratada, det.quantidade_contratada) ||
        existente.descricao !== det.descricao ||
        existente.local !== det.local
      if (precisaUpdate) {
        if (!dryRun) {
          await admin.from('detalhamentos').update({
            descricao: det.descricao,
            disciplina: det.disciplina,
            local: det.local,
            unidade: det.unidade,
            quantidade_contratada: det.quantidade_contratada,
            valor_material_unit: det.valor_material_unit,
            valor_servico_unit: det.valor_servico_unit,
            ordem: det.ordem,
          }).eq('id', existente.id)
        }
        rep.detalhamentos.atualizados++
      } else {
        rep.detalhamentos.inalterados++
      }
    } else {
      if (!dryRun) {
        await admin.from('detalhamentos').insert({
          tarefa_id: tid,
          codigo: det.codigo,
          descricao: det.descricao,
          disciplina: det.disciplina,
          local: det.local,
          unidade: det.unidade,
          quantidade_contratada: det.quantidade_contratada,
          valor_material_unit: det.valor_material_unit,
          valor_servico_unit: det.valor_servico_unit,
          ordem: det.ordem,
        })
      }
      rep.detalhamentos.inseridos++
    }
  }

  return rep
}
