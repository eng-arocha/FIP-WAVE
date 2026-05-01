// Route de divergência (PR 1) — força redeploy se Vercel falhou no anterior
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { parseBody } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  criarNotaFiscal,
  criarPedidoCoberturaDivergencia,
  recusarNotaFiscalPorDivergencia,
  verificarTeto,
  NFMatchError,
} from '@/lib/db/fat-direto'
import {
  templateDivergenciaAviso,
  templateDivergenciaRecusa,
} from '@/lib/email/templates-divergencia'
import { sendEmail } from '@/lib/email/send'
import { listarUsuariosAtreladosAoContrato } from '@/lib/db/usuarios-contrato'

const Body = z.object({
  acao: z.enum(['cobrir', 'recusar']),
  motivo: z.string().trim().min(5, 'Motivo deve ter ao menos 5 caracteres.').max(2000),
  // dry_run=true: NÃO persiste, só calcula e retorna HTML do email + envolvidos
  dry_run: z.boolean().optional(),
  // Dados da NF (mesmo schema do POST /nfs)
  nf: z.object({
    numero_nf: z.string().trim().min(1).max(50),
    emitente: z.string().max(500).optional(),
    cnpj_emitente: z.string().max(20).optional(),
    valor: z.number().positive().finite(),
    data_emissao: z.string(),
    data_recebimento: z.string().optional(),
    data_vencimento: z.string().optional(),
    descricao: z.string().max(2000).optional(),
    arquivo_url: z.string().url().optional(),
    override_data_anterior: z.boolean().optional(),
  }),
  // Quem recebe o email (no resolver real, não no dry_run)
  destinatarios_ids: z.array(z.string().uuid()).optional(),
})

/**
 * POST /api/contratos/[id]/fat-direto/solicitacoes/[solId]/divergencia/resolver
 *
 * Resolve um caso de divergência de valor de NF (excede saldo do pedido +
 * fora da tolerância configurada do contrato). Dois caminhos:
 *
 *   acao='cobrir'  → registra NF com override + emite pedido de cobertura
 *                   pelo excedente (auto-aprovado, vinculado ao pedido pai)
 *                   + dispara email de aviso "controle rigoroso FIP".
 *
 *   acao='recusar' → registra NF como rejeitada (tipo='divergencia_sem_saldo')
 *                   + dispara email de recusa exigindo pagamento direto FIP.
 *
 * Modo dry_run=true: NÃO persiste nada. Calcula valores, gera HTML do
 * email e devolve a lista de envolvidos do contrato (pra UI montar o
 * modal de preview e o usuário revisar antes de confirmar).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const check = await assertPermissao('aprovacoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: check.status })
    }

    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { acao, motivo, dry_run, nf, destinatarios_ids } = parsed.data
    const { id: contratoId, solId } = await params

    const admin = createAdminClient()

    // Carrega solicitação pai + contrato
    const { data: pai, error: paiErr } = await admin
      .from('solicitacoes_fat_direto')
      .select(`
        id, numero, numero_pedido_fip, contrato_id, status, valor_total,
        fornecedor_razao_social, fornecedor_cnpj, data_aprovacao
      `)
      .eq('id', solId)
      .single()
    if (paiErr || !pai) {
      return NextResponse.json({ error: 'Solicitação não encontrada.' }, { status: 404 })
    }
    if ((pai as any).contrato_id !== contratoId) {
      return NextResponse.json({ error: 'Solicitação não pertence a este contrato.' }, { status: 400 })
    }

    const { data: contrato } = await admin
      .from('contratos')
      .select('id, numero, descricao, valor_material_direto, tolerancia_nf_valor, percentual_retencao')
      .eq('id', contratoId)
      .single()
    if (!contrato) return NextResponse.json({ error: 'Contrato não encontrado.' }, { status: 404 })

    const tolerancia = Number((contrato as any).tolerancia_nf_valor ?? 0)

    // Saldo do pedido pai (antes da NF)
    const { data: nfsAtivas } = await admin
      .from('notas_fiscais_fat_direto')
      .select('valor, status')
      .eq('solicitacao_id', solId)
    const somaAtivas = (nfsAtivas || [])
      .filter((n: any) => n.status !== 'rejeitada')
      .reduce((s: number, n: any) => s + Number(n.valor || 0), 0)
    const saldoPedido = Number((pai as any).valor_total || 0) - somaAtivas
    const excedente = nf.valor - saldoPedido

    if (excedente <= tolerancia + 0.01) {
      return NextResponse.json(
        { error: 'NF não excede a tolerância configurada — não há divergência pra resolver.', excedente, tolerancia },
        { status: 400 },
      )
    }

    // Saldo de teto fat-direto (consulta via verificarTeto)
    // verificarTeto retorna null se NÃO há violação (cabe), ou retorno com saldo_disponivel
    let saldoTeto: number
    let teto: number
    let totalAprovAntes: number
    {
      const probe = await verificarTeto(contratoId, excedente)
      if (probe) {
        // não cabe — saldo_disponivel é o que sobra
        saldoTeto = Number(probe.saldo_disponivel ?? 0)
        teto = Number(probe.teto ?? 0)
        totalAprovAntes = Number(probe.total_aprovado ?? 0)
      } else {
        // cabe — busca diretamente do contrato pra retornar info correta
        teto = Number((contrato as any).valor_material_direto ?? 0)
        // re-soma aprovado direto pra precisão
        const { data: solsAprov } = await admin
          .from('solicitacoes_fat_direto')
          .select('valor_total')
          .eq('contrato_id', contratoId)
          .eq('status', 'aprovado')
          .is('deletado_em', null)
        totalAprovAntes = (solsAprov || []).reduce((s: number, x: any) => s + Number(x.valor_total || 0), 0)
        saldoTeto = teto - totalAprovAntes
      }
    }

    // Validação: caminho B só se houver saldo de teto suficiente
    if (acao === 'cobrir' && saldoTeto < excedente) {
      return NextResponse.json(
        {
          error: 'Saldo de teto fat-direto insuficiente pra emitir pedido de cobertura.',
          saldo_teto: saldoTeto, excedente,
        },
        { status: 400 },
      )
    }

    // ============================================================
    // DRY-RUN: calcula valores + gera preview de email, sem persistir
    // ============================================================
    if (dry_run) {
      const envolvidos = await listarUsuariosAtreladosAoContrato(contratoId)
      let preview: { subject: string; html: string }

      if (acao === 'cobrir') {
        const totalAprovDepois = totalAprovAntes + excedente
        preview = templateDivergenciaAviso({
          numero_contrato: (contrato as any).numero,
          numero_nf: nf.numero_nf,
          data_emissao: nf.data_emissao,
          fornecedor: (pai as any).fornecedor_razao_social || nf.emitente || '—',
          valor_nf: nf.valor,
          numero_pedido_original: (pai as any).numero_pedido_fip ?? (pai as any).numero,
          excedente,
          numero_pedido_novo: '(será alocado)', // só na execução real
          teto,
          total_aprov_antes: totalAprovAntes,
          total_aprov_depois: totalAprovDepois,
          saldo_antes: saldoTeto,
          saldo_depois: saldoTeto - excedente,
        })
      } else {
        preview = templateDivergenciaRecusa({
          numero_contrato: (contrato as any).numero,
          numero_nf: nf.numero_nf,
          data_emissao: nf.data_emissao,
          fornecedor: (pai as any).fornecedor_razao_social || nf.emitente || '—',
          cnpj_emitente: nf.cnpj_emitente,
          valor_nf: nf.valor,
          numero_pedido_original: (pai as any).numero_pedido_fip ?? (pai as any).numero,
          saldo_pedido: saldoPedido,
          excedente,
          tolerancia,
          saldo_teto: saldoTeto,
          arquivo_url: nf.arquivo_url || null,
        })
      }

      return NextResponse.json({
        dry_run: true,
        acao,
        excedente,
        tolerancia,
        saldo_pedido: saldoPedido,
        saldo_teto: saldoTeto,
        teto,
        total_aprov_antes: totalAprovAntes,
        envolvidos: envolvidos.map(u => ({ id: u.id, nome: u.nome, email: u.email, perfil: u.perfil })),
        preview,
      })
    }

    // ============================================================
    // EXECUÇÃO REAL: persiste + dispara email
    // ============================================================
    if (acao === 'cobrir') {
      // 1) Persiste NF com override (passa no validador que respeita override)
      const novaNf = await criarNotaFiscal({
        solicitacao_id: solId,
        numero_nf: nf.numero_nf,
        emitente: nf.emitente,
        cnpj_emitente: nf.cnpj_emitente,
        valor: nf.valor,
        data_emissao: nf.data_emissao,
        data_recebimento: nf.data_recebimento,
        data_vencimento: nf.data_vencimento,
        descricao: nf.descricao,
        arquivo_url: nf.arquivo_url,
        override_data_anterior: nf.override_data_anterior,
        override_excede_saldo: true,
        motivo_divergencia: motivo,
      })

      // 2) Cria pedido de cobertura
      const novoPedido = await criarPedidoCoberturaDivergencia({
        contrato_id: contratoId,
        pedido_pai_id: solId,
        nf_id: (novaNf as any).id,
        excedente,
        motivo,
        aprovador_id: check.userId,
      })

      // 3) Dispara email se houver destinatários selecionados
      let emailEnviado = false
      const destinos: string[] = []
      if (destinatarios_ids && destinatarios_ids.length > 0) {
        const envolvidos = await listarUsuariosAtreladosAoContrato(contratoId)
        const selecionados = envolvidos.filter(u => destinatarios_ids.includes(u.id))
        const emails = selecionados.map(u => u.email).filter(Boolean) as string[]

        if (emails.length > 0) {
          const tpl = templateDivergenciaAviso({
            numero_contrato: (contrato as any).numero,
            numero_nf: nf.numero_nf,
            data_emissao: nf.data_emissao,
            fornecedor: (pai as any).fornecedor_razao_social || nf.emitente || '—',
            valor_nf: nf.valor,
            numero_pedido_original: (pai as any).numero_pedido_fip ?? (pai as any).numero,
            excedente,
            numero_pedido_novo: novoPedido.numero_pedido_fip,
            teto,
            total_aprov_antes: totalAprovAntes,
            total_aprov_depois: totalAprovAntes + excedente,
            saldo_antes: saldoTeto,
            saldo_depois: saldoTeto - excedente,
          })
          const r = await sendEmail({
            to: emails,
            subject: tpl.subject,
            html: tpl.html,
            tipo: 'lembrete',
          })
          emailEnviado = r.success
          destinos.push(...emails)
        }
      }

      await audit({
        event: 'nf.divergencia_cobertura_emitida',
        entity_type: 'solicitacao_fat_direto',
        entity_id: solId,
        actor_id: check.userId,
        actor_email: check.userEmail ?? null,
        metadata: {
          nf_id: (novaNf as any).id,
          novo_pedido_id: novoPedido.id,
          numero_pedido_fip: novoPedido.numero_pedido_fip,
          excedente,
          motivo,
          email_enviado: emailEnviado,
          destinos,
        },
        request: req,
      })

      return NextResponse.json({
        ok: true,
        acao: 'cobrir',
        nf: novaNf,
        novo_pedido: novoPedido,
        email_enviado: emailEnviado,
        destinos,
      })
    }

    // acao === 'recusar'
    // 1) Cadastra a NF tentando o caminho normal — mas sabemos que vai falhar
    //    pelo VALOR_EXCEDE_SALDO. Estratégia: persiste DIRETO via insert com
    //    status='rejeitada' (sem passar pelo 3-way match completo).
    const insertPayload: any = {
      solicitacao_id: solId,
      numero_nf: nf.numero_nf,
      emitente: nf.emitente || (pai as any).fornecedor_razao_social,
      cnpj_emitente: nf.cnpj_emitente,
      valor: nf.valor,
      data_emissao: nf.data_emissao,
      data_recebimento: nf.data_recebimento ?? null,
      data_vencimento: nf.data_vencimento ?? null,
      descricao: nf.descricao,
      url_arquivo: nf.arquivo_url ?? null,
      status: 'rejeitada',
    }
    let nfId: string
    {
      const r = await admin.from('notas_fiscais_fat_direto').insert(insertPayload).select().single()
      if (r.error) throw r.error
      nfId = (r.data as any).id
    }

    // 2) Marca tipo_rejeicao + motivo
    await recusarNotaFiscalPorDivergencia({
      nf_id: nfId,
      motivo,
      aprovador_id: check.userId,
    })

    // 3) Dispara email de recusa se houver destinatários selecionados
    let emailEnviado = false
    const destinos: string[] = []
    if (destinatarios_ids && destinatarios_ids.length > 0) {
      const envolvidos = await listarUsuariosAtreladosAoContrato(contratoId)
      const selecionados = envolvidos.filter(u => destinatarios_ids.includes(u.id))
      const emails = selecionados.map(u => u.email).filter(Boolean) as string[]

      if (emails.length > 0) {
        const tpl = templateDivergenciaRecusa({
          numero_contrato: (contrato as any).numero,
          numero_nf: nf.numero_nf,
          data_emissao: nf.data_emissao,
          fornecedor: (pai as any).fornecedor_razao_social || nf.emitente || '—',
          cnpj_emitente: nf.cnpj_emitente,
          valor_nf: nf.valor,
          numero_pedido_original: (pai as any).numero_pedido_fip ?? (pai as any).numero,
          saldo_pedido: saldoPedido,
          excedente,
          tolerancia,
          saldo_teto: saldoTeto,
          arquivo_url: nf.arquivo_url || null,
        })
        const r = await sendEmail({
          to: emails,
          subject: tpl.subject,
          html: tpl.html,
          tipo: 'rejeitado',
        })
        emailEnviado = r.success
        destinos.push(...emails)
      }
    }

    await audit({
      event: 'nf.divergencia_recusada',
      entity_type: 'nota_fiscal_fat_direto',
      entity_id: nfId,
      actor_id: check.userId,
      actor_email: check.userEmail ?? null,
      metadata: {
        solicitacao_id: solId,
        excedente,
        saldo_teto: saldoTeto,
        motivo,
        email_enviado: emailEnviado,
        destinos,
      },
      request: req,
    })

    return NextResponse.json({
      ok: true,
      acao: 'recusar',
      nf_id: nfId,
      email_enviado: emailEnviado,
      destinos,
    })
  } catch (e: any) {
    if (e instanceof NFMatchError) {
      return NextResponse.json(
        { error: e.message, code: e.code, detail: e.detail },
        { status: 422 },
      )
    }
    if ((e as any)?.message === 'TETO_EXCEDIDO_NA_COBERTURA') {
      return NextResponse.json(
        { error: 'Saldo de teto fat-direto insuficiente.', detail: (e as any).violation },
        { status: 422 },
      )
    }
    return apiError(e)
  }
}
