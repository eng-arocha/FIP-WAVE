import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Comparador de codigo hierarquico ("10.1.12") por valor NUMERICO de cada
 * segmento — evita o problema de sort alfabetico onde "10.1.12" < "10.1.2"
 * e "10.3" < "10.1". Segmentos nao-numericos caem em fallback string.
 */
function compareCodigo(a: string | null | undefined, b: string | null | undefined): number {
  const sa = String(a ?? '')
  const sb = String(b ?? '')
  const partsA = sa.split('.')
  const partsB = sb.split('.')
  const len = Math.max(partsA.length, partsB.length)
  for (let i = 0; i < len; i++) {
    const a_i = partsA[i] ?? ''
    const b_i = partsB[i] ?? ''
    const na = Number(a_i)
    const nb = Number(b_i)
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      if (na !== nb) return na - nb
    } else {
      const cmp = a_i.localeCompare(b_i)
      if (cmp !== 0) return cmp
    }
  }
  return 0
}

export async function getGruposMacro(contratoId: string) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const [{ data, error }, { data: saldos }] = await Promise.all([
    admin
      .from('grupos_macro')
      .select(`*, tarefas(*, detalhamentos(*))`)
      .eq('contrato_id', contratoId)
      .order('ordem'),
    supabase
      .from('vw_medicao_grupo')
      .select('grupo_id, valor_medido, saldo')
      .eq('contrato_id', contratoId),
  ])

  if (error) throw error

  const saldoMap = Object.fromEntries((saldos || []).map(s => [s.grupo_id, s]))

  // Supabase nao garante ordem dos nested resources via .order() na tabela
  // pai; sort natural por codigo aqui pra cobrir o caso em que 'ordem' nao
  // esta populado/consistente nas tarefas e detalhamentos.
  return (data || [])
    .slice()
    .sort((g1: any, g2: any) => compareCodigo(g1.codigo, g2.codigo))
    .map((g: any) => ({
      ...g,
      tarefas: (g.tarefas || [])
        .slice()
        .sort((t1: any, t2: any) => compareCodigo(t1.codigo, t2.codigo))
        .map((t: any) => ({
          ...t,
          detalhamentos: (t.detalhamentos || [])
            .slice()
            .sort((d1: any, d2: any) => compareCodigo(d1.codigo, d2.codigo)),
        })),
      valor_medido: saldoMap[g.id]?.valor_medido ?? 0,
      saldo: saldoMap[g.id]?.saldo ?? g.valor_contratado,
    }))
}

export async function getGruposMacroComSaldo(contratoId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vw_medicao_grupo')
    .select('*')
    .eq('contrato_id', contratoId)
  if (error) throw error
  return data || []
}

export async function createGrupoMacro(input: {
  contrato_id: string
  codigo: string
  nome: string
  tipo_medicao: string
  valor_contratado: number
  ordem?: number
}) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('grupos_macro')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function createTarefa(input: {
  grupo_macro_id: string
  codigo: string
  nome: string
  valor_total: number
  unidade?: string
  ordem?: number
}) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tarefas')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function createDetalhamento(input: {
  tarefa_id: string
  codigo: string
  descricao: string
  unidade: string
  quantidade_contratada: number
  valor_unitario: number
  ordem?: number
}) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('detalhamentos')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}
