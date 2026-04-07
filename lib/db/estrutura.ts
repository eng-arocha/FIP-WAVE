import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

  return (data || []).map(g => ({
    ...g,
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
