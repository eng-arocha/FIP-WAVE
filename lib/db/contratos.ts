import { createClient } from '@/lib/supabase/server'
import { Contrato } from '@/types'

export async function getContratos() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contratos')
    .select(`
      *,
      contratante:empresas!contratos_contratante_id_fkey(id, nome, cnpj),
      contratado:empresas!contratos_contratado_id_fkey(id, nome, cnpj)
    `)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getContrato(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contratos')
    .select(`
      *,
      contratante:empresas!contratos_contratante_id_fkey(id, nome, cnpj, email_contato, responsavel),
      contratado:empresas!contratos_contratado_id_fkey(id, nome, cnpj, email_contato, responsavel)
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function getContratoResumo(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vw_resumo_contrato')
    .select('*')
    .eq('contrato_id', id)
    .single()
  if (error) throw error
  return data
}

export async function createContrato(input: Omit<Contrato, 'id' | 'created_at' | 'updated_at' | 'contratante' | 'contratado'>) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contratos')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateContrato(id: string, input: Partial<Contrato>) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contratos')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getAditivos(contratoId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('aditivos')
    .select('*')
    .eq('contrato_id', contratoId)
    .order('numero')
  if (error) throw error
  return data || []
}

export async function createAditivo(input: {
  contrato_id: string
  tipo: string
  descricao: string
  valor_anterior?: number
  valor_adicional?: number
  valor_novo?: number
  data_fim_anterior?: string
  data_fim_nova?: string
}) {
  const supabase = await createClient()
  const { data: last } = await supabase
    .from('aditivos')
    .select('numero')
    .eq('contrato_id', input.contrato_id)
    .order('numero', { ascending: false })
    .limit(1)
    .single()
  const numero = (last?.numero || 0) + 1
  const { data, error } = await supabase
    .from('aditivos')
    .insert({ ...input, numero })
    .select()
    .single()
  if (error) throw error
  return data
}
