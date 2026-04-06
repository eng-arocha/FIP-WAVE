import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdmin } from '@/lib/api/auth'
import { SEED_TAREFAS, SEED_DETALHAMENTOS } from '@/lib/seed-data'

export async function POST() {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  try {
    const admin = createAdminClient()

    // 1) Garante colunas em detalhamentos
    // (já adicionadas pela migration 005 — só como segurança)

    // 2) Upsert tarefas
    const { error: tErr, count: tCount } = await admin
      .from('tarefas')
      .upsert(SEED_TAREFAS as any[], { onConflict: 'id', ignoreDuplicates: true })
      .select('id')
    if (tErr) throw new Error(`tarefas: ${tErr.message}`)

    // 3) Upsert detalhamentos em lotes de 50
    let dInserted = 0
    const BATCH = 50
    for (let i = 0; i < SEED_DETALHAMENTOS.length; i += BATCH) {
      const batch = (SEED_DETALHAMENTOS as any[]).slice(i, i + BATCH)
      const { error: dErr } = await admin
        .from('detalhamentos')
        .upsert(batch, { onConflict: 'id', ignoreDuplicates: true })
      if (dErr) throw new Error(`detalhamentos[${i}]: ${dErr.message}`)
      dInserted += batch.length
    }

    // 4) Adiciona colunas da migration 012 se não existirem
    // (template_id em perfis + permissão perfis para admin)
    // Nota: ALTER TABLE não suportado via JS client — use SQL Editor se necessário

    return NextResponse.json({
      ok: true,
      tarefas_processadas: SEED_TAREFAS.length,
      detalhamentos_processados: dInserted,
      message: 'Seed executado com sucesso. Detalhamentos disponíveis no dropdown.',
    })
  } catch (e: any) {
    console.error('[admin/seed]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET retorna status atual
export async function GET() {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const admin = createAdminClient()
    const { count: tCount } = await admin.from('tarefas').select('*', { count: 'exact', head: true })
    const { count: dCount } = await admin.from('detalhamentos').select('*', { count: 'exact', head: true })
    return NextResponse.json({
      tarefas_no_banco: tCount,
      detalhamentos_no_banco: dCount,
      tarefas_esperadas: SEED_TAREFAS.length,
      detalhamentos_esperados: SEED_DETALHAMENTOS.length,
      precisa_seed: (dCount ?? 0) < SEED_DETALHAMENTOS.length,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
