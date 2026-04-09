import { NextResponse } from 'next/server'
import { getPermissoesEfetivas, setPermissoesUsuario } from '@/lib/db/permissoes'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdmin } from '@/lib/api/auth'

/**
 * GET /api/usuarios/[id]/permissoes
 *
 * Retorna as permissões EFETIVAS do usuário (já aplicando a resolução
 * admin → customizadas → template → fallback), junto com o estado da
 * flag de customização e o nome do template herdado. A UI usa isso
 * para mostrar o checklist no modo correto (editável vs. read-only).
 *
 * Resposta:
 *   {
 *     permissoes: [{modulo, acao}, ...],
 *     permissoes_customizadas: boolean,
 *     template_id: string | null,
 *     template_nome: string | null,
 *     fonte: 'admin' | 'customizadas' | 'template' | 'fallback' | 'nenhuma'
 *   }
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const { id } = await params
    const efetivas = await getPermissoesEfetivas(id)

    // Resolve o nome do template para mostrar ao admin
    let template_nome: string | null = null
    if (efetivas.template_id) {
      const admin = createAdminClient()
      const { data } = await admin
        .from('templates_permissao')
        .select('nome')
        .eq('id', efetivas.template_id)
        .single()
      template_nome = data?.nome ?? null
    }

    return NextResponse.json({
      permissoes: efetivas.permissoes,
      permissoes_customizadas: efetivas.permissoes_customizadas,
      template_id: efetivas.template_id,
      template_nome,
      fonte: efetivas.fonte,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * PUT /api/usuarios/[id]/permissoes
 *
 * Atualiza as permissões E/OU a flag de customização do usuário.
 *
 * Body:
 *   {
 *     permissoes?: Array<{modulo, acao}>,
 *     permissoes_customizadas?: boolean
 *   }
 *
 * Comportamento:
 *   - permissoes_customizadas = true + permissoes fornecidas:
 *       marca a flag e salva as permissões específicas (ilha)
 *   - permissoes_customizadas = false:
 *       desmarca a flag e APAGA as permissoes_usuario (volta a herdar
 *       do template em tempo real)
 *   - só permissoes (sem a flag): salva como customizadas por padrão
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const { id } = await params
    const body = await req.json()
    const { permissoes, permissoes_customizadas } = body

    const admin = createAdminClient()

    // Caso 1: desligar customização → apaga permissoes_usuario + flag false
    if (permissoes_customizadas === false) {
      await setPermissoesUsuario(id, []) // limpa a ilha

      const { error } = await admin
        .from('perfis')
        .update({ permissoes_customizadas: false })
        .eq('id', id)
      if (error && !/permissoes_customizadas/.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      return NextResponse.json({ ok: true, permissoes_customizadas: false })
    }

    // Caso 2: ligar customização ou atualizar ilha
    if (Array.isArray(permissoes)) {
      await setPermissoesUsuario(id, permissoes)
    }

    // Seta a flag true (explícito ou implícito quando só vem `permissoes`)
    const setFlag = permissoes_customizadas === true || Array.isArray(permissoes)
    if (setFlag) {
      const { error } = await admin
        .from('perfis')
        .update({ permissoes_customizadas: true })
        .eq('id', id)
      if (error && !/permissoes_customizadas/.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }

    return NextResponse.json({ ok: true, permissoes_customizadas: setFlag })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
