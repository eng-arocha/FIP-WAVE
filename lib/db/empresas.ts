import { createClient } from '@/lib/supabase/server'
import { Empresa } from '@/types'

export async function getEmpresas(): Promise<Empresa[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('empresas')
    .select('*')
    .eq('ativo', true)
    .order('nome')
  if (error) throw error
  return data || []
}

export async function createEmpresa(input: Omit<Empresa, 'id' | 'created_at' | 'updated_at'>) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('empresas')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateEmpresa(id: string, input: Partial<Empresa>) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('empresas')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
