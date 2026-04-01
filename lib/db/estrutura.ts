import { createClient } from '@/lib/supabase/server'

export async function getGruposMacro(contratoId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('grupos_macro')
    .select(`
      *,
      tarefas(
        *,
        detalhamentos(*)
      )
    `)
    .eq('contrato_id', contratoId)
    .order('ordem')
  if (error) throw error
  return data || []
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
