import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertPermissao } from '@/lib/api/auth'
import { aprovarMedicao } from '@/lib/db/medicoes'
import { sendEmail } from '@/lib/email/send'
import { templateMedicaoAprovada } from '@/lib/email/templates'
import { templateLiberacaoMedicaoFornecedor } from '@/lib/email/templates-medicoes'
import { calcularResumoFinanceiroObra } from '@/lib/db/resumo-financeiro-obra'
import { apiError } from '@/lib/api/error-response'
import { parseBody } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'
import { emitWebhook } from '@/lib/api/webhooks'
import { assertMfaForRole } from '@/lib/api/mfa'
import { log } from '@/lib/log'

const Body = z.object({
  comentario: z.string().max(2000).optional().default(''),
  // Payload opcional usado apenas pra compor o email original — validação leve.
  medicao: z.any().optional(),
  /** Se true e destinatarios_ids preenchido, dispara também o email de
   *  Liberação para NF (template novo, com resumo financeiro consolidado). */
  notificar_envolvidos: z.boolean().optional(),
  destinatarios_ids: z.array(z.string().uuid()).optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string; medicaoId: string }> }) {
  try {
    // SEGURANÇA: exige autenticação E permissão `medicoes.aprovar`.
    // O nome/email do aprovador é derivado da SESSÃO, não do body — impede
    // que qualquer cliente forje a identidade de outro usuário.
    const check = await assertPermissao('medicoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Apenas usuários com permissão de aprovação podem aprovar medições.' },
        { status: check.status }
      )
    }

    // P1.10: MFA obrigatório pra aprovação (quando MFA_ENFORCED=true).
    // Sem feature flag, retorna ok=true. Com flag, exige aal2.
    const mfa = await assertMfaForRole('aprovador')
    if (!mfa.ok) {
      return NextResponse.json({ error: mfa.reason, code: 'MFA_REQUIRED' }, { status: 403 })
    }

    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { comentario, medicao, notificar_envolvidos, destinatarios_ids } = parsed.data
    const { id: contratoId, medicaoId } = await params

    // Recupera nome do aprovador a partir do perfil (não confia no body)
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data: perfilAprovador } = await admin
      .from('perfis')
      .select('nome, email')
      .eq('id', check.userId)
      .single()

    const aprovadorNome  = perfilAprovador?.nome  ?? check.userEmail ?? 'Aprovador'
    const aprovadorEmail = perfilAprovador?.email ?? check.userEmail ?? ''

    await aprovarMedicao(medicaoId, aprovadorNome, aprovadorEmail, comentario)

    await audit({
      event: 'medicao.aprovada',
      entity_type: 'medicao',
      entity_id: medicaoId,
      actor_id: check.userId,
      actor_nome: aprovadorNome,
      actor_email: aprovadorEmail,
      metadata: { comentario: comentario || null },
      request: req,
    })

    // C — Auto-cria 2 rascunhos de solicitação na aprovação:
    //   1) FIP material (fat-direto)  — itens com fip_faturar > 0
    //   2) Wave serviço                — itens com wave_servico > 0,
    //      valor_total = wave_servico LÍQUIDO (após desconto da retenção 5%)
    // Best-effort: se uma falhar, segue mas loga. O ID de cada uma vai pro
    // response e pro email.
    let solicitacaoFipId: string | null = null
    let solicitacaoFipValor: number | null = null
    let solicitacaoWaveId: string | null = null
    let solicitacaoWaveValor: number | null = null
    let valorWaveBruto = 0
    let valorWaveLiquido = 0
    let saldoRetencaoAntes = 0
    let creditoRetencao = 0
    let debitoRetencao = 0
    let saldoRetencaoDepois = 0
    try {
      const { calcularInformaconData } = await import('@/lib/db/informacon-data')
      const { criarSolicitacaoRascunhoDeMedicao } = await import('@/lib/db/fat-direto')
      const { aplicarRetencaoDaAprovacao } = await import('@/lib/db/retencao')
      const informacon = await calcularInformaconData(admin, contratoId, medicaoId)
      if (informacon) {
        const dataAprovacao = new Date().toISOString()
        const pctRetencao = informacon.medicao.contrato.percentual_retencao || 5
        valorWaveBruto = informacon.totais.wave_servico

        // === Aplica retenção via livro-razão (migration 062). Crédito do 5%
        // da medição + débito até o limite do saldo na NF Wave. Best-effort:
        // se a tabela ainda não existe (migration 062 pendente), cai no
        // fallback que usa o cálculo legado (5% × dados_informakon).
        try {
          const ret = await aplicarRetencaoDaAprovacao(admin, {
            contrato_id: contratoId,
            medicao_id: medicaoId,
            medicao_numero: informacon.medicao.numero,
            // Usa a MESMA base que aparece no card "Estimativa de retenção
            // contratual" da página da medição — exclui material retido.
            base_retencao: informacon.totais.base_retencao,
            wave_bruto: valorWaveBruto,
            pct_retencao: pctRetencao,
            aprovador_id: check.userId,
          })
          saldoRetencaoAntes = ret.saldo_antes
          creditoRetencao = ret.credito_aplicado
          debitoRetencao = ret.debito_aplicado
          saldoRetencaoDepois = ret.saldo_depois
          valorWaveLiquido = ret.wave_liquido
        } catch (e: any) {
          const msg = e?.message || ''
          if (msg.includes('retencao_movimentos') || msg.includes('aplicar_movimento_retencao')) {
            log.warn('migration_062_pendente_fallback_retencao', {
              medicao_id: medicaoId,
              error: msg,
            })
            // Fallback legado: NF Wave continua bruta, retenção é só informativa.
            // Ao rodar a 062, próximas medições começam com saldo zero — pode
            // gerar uma "calibragem" se houver medições já aprovadas antes.
            valorWaveLiquido = Math.max(0, valorWaveBruto - informacon.totais.retencao)
            creditoRetencao = informacon.totais.retencao
            debitoRetencao = creditoRetencao
          } else {
            throw e
          }
        }

        // === Rascunho 1 — FIP Material ===
        const itensFip = informacon.linhas
          .filter(l => l.fip_faturar > 0)
          .map(l => ({
            detalhamento_id: l.detalhamento_id,
            descricao: l.descricao,
            valor_total: l.fip_faturar,
          }))
        if (itensFip.length > 0) {
          try {
            const sol = await criarSolicitacaoRascunhoDeMedicao({
              contrato_id: contratoId,
              solicitante_id: check.userId,
              medicao_id: medicaoId,
              medicao_numero: informacon.medicao.numero,
              data_aprovacao: dataAprovacao,
              tipo: 'fip_material',
              // Aprovacao da medicao IMPLICA aprovacao deste pedido — ja
              // cria com status='aprovado'.
              aprovador_id: check.userId,
              itens: itensFip,
            })
            solicitacaoFipId = sol.id
            solicitacaoFipValor = Number(sol.valor_total ?? 0)
            await audit({
              event: 'solicitacao_fat_direto.rascunho_auto_criado_da_medicao',
              entity_type: 'solicitacao_fat_direto',
              entity_id: sol.id,
              actor_id: check.userId,
              actor_nome: aprovadorNome,
              actor_email: aprovadorEmail,
              metadata: { medicao_id: medicaoId, tipo: 'fip_material', valor_total: solicitacaoFipValor },
              request: req,
            })
          } catch (e: any) {
            log.warn('rascunho_fip_material_falhou', { medicao_id: medicaoId, error: e?.message })
          }
        }

        // === Rascunho 2 — Wave Serviço (líquido) ===
        const itensWave = informacon.linhas
          .filter(l => l.wave_servico > 0)
          .map(l => ({
            detalhamento_id: l.detalhamento_id,
            descricao: l.descricao,
            valor_total: l.wave_servico,
          }))
        if (itensWave.length > 0) {
          try {
            const obsWave =
              `Saldo de retenção antes desta medição: R$ ${saldoRetencaoAntes.toFixed(2).replace('.', ',')}. ` +
              `Crédito de retenção desta medição (5% × mat+serv): R$ ${creditoRetencao.toFixed(2).replace('.', ',')}. ` +
              `Valor BRUTO da NF Wave: R$ ${valorWaveBruto.toFixed(2).replace('.', ',')}. ` +
              `Desconto de retenção aplicado nesta NF: R$ ${debitoRetencao.toFixed(2).replace('.', ',')}. ` +
              `Valor LÍQUIDO a emitir: R$ ${valorWaveLiquido.toFixed(2).replace('.', ',')}. ` +
              `Saldo de retenção remanescente: R$ ${saldoRetencaoDepois.toFixed(2).replace('.', ',')}.`
            const sol = await criarSolicitacaoRascunhoDeMedicao({
              contrato_id: contratoId,
              solicitante_id: check.userId,
              medicao_id: medicaoId,
              medicao_numero: informacon.medicao.numero,
              data_aprovacao: dataAprovacao,
              tipo: 'wave_servico',
              observacoes_extra: obsWave,
              // Aprovacao da medicao IMPLICA aprovacao deste pedido — ja
              // cria com status='aprovado'.
              aprovador_id: check.userId,
              itens: itensWave,
            })
            solicitacaoWaveId = sol.id
            solicitacaoWaveValor = Number(sol.valor_total ?? 0)
            await audit({
              event: 'solicitacao_wave_servico.rascunho_auto_criado_da_medicao',
              entity_type: 'solicitacao_fat_direto',
              entity_id: sol.id,
              actor_id: check.userId,
              actor_nome: aprovadorNome,
              actor_email: aprovadorEmail,
              metadata: {
                medicao_id: medicaoId,
                tipo: 'wave_servico',
                valor_bruto: valorWaveBruto,
                valor_liquido: valorWaveLiquido,
                retencao_descontada: debitoRetencao,
                saldo_retencao_apos: saldoRetencaoDepois,
              },
              request: req,
            })
          } catch (e: any) {
            log.warn('rascunho_wave_servico_falhou', { medicao_id: medicaoId, error: e?.message })
          }
        }
      }
    } catch (e: any) {
      log.warn('rascunhos_auto_falharam', {
        medicao_id: medicaoId,
        error: e?.message,
      })
    }
    // Mantém o nome antigo `solicitacaoFatDiretoId` pra compat com o resto
    // do código (usado no template e no response).
    const solicitacaoFatDiretoId = solicitacaoFipId
    const solicitacaoFatDiretoValor = solicitacaoFipValor

    // Webhook outbound (best-effort, não bloqueia resposta)
    void emitWebhook('medicao.aprovada', {
      medicao_id: medicaoId,
      aprovador: { nome: aprovadorNome, email: aprovadorEmail },
      comentario: comentario || null,
    })

    // Email original (mantido pra compatibilidade — vai pro solicitante)
    if (medicao?.contrato) {
      const tpl = templateMedicaoAprovada(medicao, medicao.contrato, comentario)
      await sendEmail({
        to: medicao.solicitante_email,
        cc: [medicao.contrato.contratante?.email_contato, medicao.contrato.contratado?.email_contato].filter(Boolean) as string[],
        subject: tpl.subject,
        html: tpl.html,
      }).catch(() => null)
    }

    // Email NOVO de Liberação para NF (com resumo financeiro consolidado),
    // disparado apenas se admin marcou "Notificar envolvidos" e selecionou
    // destinatários. Não bloqueia o response em caso de falha.
    let emailLiberacao: { ok: boolean; qtd?: number; erro?: string } = { ok: false }
    if (notificar_envolvidos && (destinatarios_ids?.length ?? 0) > 0) {
      try {
        emailLiberacao = await dispararEmailLiberacaoMedicao({
          contratoId,
          medicaoId,
          aprovadorNome,
          destinatariosIds: destinatarios_ids!,
          solicitacaoFatDiretoId,
          solicitacaoWaveId,
          valorWaveLiquido,
          retencaoBreakdown: {
            saldo_antes: saldoRetencaoAntes,
            credito: creditoRetencao,
            debito: debitoRetencao,
            saldo_depois: saldoRetencaoDepois,
            wave_bruto: valorWaveBruto,
          },
        })
      } catch (e: any) {
        log.warn('email_liberacao_medicao_falhou', { medicaoId, error: e?.message })
        emailLiberacao = { ok: false, erro: e?.message || 'falha ao enviar' }
      }
    }

    return NextResponse.json({
      ok: true,
      email_liberacao: emailLiberacao,
      rascunhos_criados: {
        fip_material: solicitacaoFipId
          ? { id: solicitacaoFipId, valor_total: solicitacaoFipValor }
          : null,
        wave_servico: solicitacaoWaveId
          ? {
              id: solicitacaoWaveId,
              valor_bruto: solicitacaoWaveValor,
              valor_liquido: valorWaveLiquido,
              retencao_descontada: debitoRetencao,
              saldo_retencao_apos: saldoRetencaoDepois,
            }
          : null,
      },
    })
  } catch (e: any) {
    return apiError(e)
  }
}

/**
 * Dispara o email NOVO de Liberação de Medição pra emissão de NF.
 * Inclui o bloco de Resumo Financeiro da Obra (acumulado + período + retenção).
 */
async function dispararEmailLiberacaoMedicao(args: {
  contratoId: string
  medicaoId: string
  aprovadorNome: string
  destinatariosIds: string[]
  solicitacaoFatDiretoId?: string | null
  solicitacaoWaveId?: string | null
  valorWaveLiquido?: number
  retencaoBreakdown?: {
    saldo_antes: number
    credito: number
    debito: number
    saldo_depois: number
    wave_bruto: number
  }
}): Promise<{ ok: boolean; qtd?: number; erro?: string }> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  // Carrega medição com itens + contrato pra montar o template
  const { data: med } = await admin
    .from('medicoes')
    .select(`
      id, numero, periodo_referencia, valor_total, observacoes, data_aprovacao,
      contrato:contrato_id ( id, numero ),
      medicao_itens (
        quantidade_medida, valor_medido,
        detalhamento:detalhamentos ( codigo, descricao )
      )
    `)
    .eq('id', args.medicaoId)
    .single()

  if (!med) return { ok: false, erro: 'medição não encontrada' }

  // Carrega itens com confirmação "sem mais NF" pra incluir na seção
  // destacada do email (best-effort — se a 060 não rodou ou falha de
  // schema, segue sem a seção).
  let itensComConfirmacao: Array<{
    codigo: string
    descricao: string
    pct_original: number
    pct_ajustado: number
    valor_retido_absorvido: number
    motivo: string
  }> | undefined

  // Resolve emails dos destinatários (valida vínculo com o contrato)
  const { data: vinculos } = await admin
    .from('usuarios_contratos')
    .select('usuario_id, perfis:usuario_id(id, email, nome)')
    .eq('contrato_id', args.contratoId)
    .in('usuario_id', args.destinatariosIds)

  const emails: string[] = []
  for (const v of (vinculos || []) as any[]) {
    const e = v.perfis?.email
    if (e) emails.push(e)
  }
  if (emails.length === 0) return { ok: false, erro: 'nenhum destinatário válido' }

  const resumo = await calcularResumoFinanceiroObra({
    contrato_id: args.contratoId,
    medicao_id: args.medicaoId,
  })

  // FIP material + Wave serviço + itens com ajuste + somatório FIP por
  // grupo macro — calculados direto via lib/db/informacon-data (sem
  // self-fetch HTTP, que falha em prod no Vercel).
  const { agruparPorMacro } = await import('@/lib/data/grupos-macro')
  const { calcularInformaconData } = await import('@/lib/db/informacon-data')
  let fipMaterialTotal = 0
  let waveServicoTotal = 0
  let fipPorGrupoMacro: Array<{ grupo: number; nome: string; valor: number }> = []
  let ajustesAdmin: Array<{
    codigo: string
    descricao: string
    quantidade_anterior: number
    quantidade_nova: number
    motivo: string
    ajustado_por_nome: string | null
    ajustado_em: string
  }> = []

  try {
    const informacon = await calcularInformaconData(admin, args.contratoId, args.medicaoId)
    if (informacon) {
      const linhas = informacon.linhas

      // 1) Itens com ajuste sem-NF (seção destacada amarela)
      const linhasComAjuste = linhas.filter(l => l.ajuste_aplicado && l.confirmacao_sem_nf)
      if (linhasComAjuste.length > 0) {
        itensComConfirmacao = linhasComAjuste.map(l => ({
          codigo: String(l.codigo ?? '—'),
          descricao: String(l.descricao ?? '—'),
          pct_original: Number(l.pct_serv_med_original ?? 0),
          pct_ajustado: Number(l.pct_serv_med ?? 0),
          valor_retido_absorvido: Number(l.material_retido ?? 0),
          motivo: String(l.confirmacao_sem_nf_motivo ?? ''),
        }))
      }

      // 2) Totais e somatório por grupo macro pro bloco de NFs
      fipMaterialTotal = linhas.reduce((s, l) => s + l.fip_faturar, 0)
      waveServicoTotal = linhas.reduce((s, l) => s + l.wave_servico, 0)
      fipPorGrupoMacro = agruparPorMacro(
        linhas
          .filter(l => l.fip_faturar > 0)
          .map(l => ({ codigo: l.codigo, valor: l.fip_faturar })),
      )

      // Convergência (A): retenção do email = retenção do informacon
      // (5% × dados_informakon). Antes divergia em 5% × material_retido.
      resumo.retencao.valor = informacon.totais.retencao
      resumo.retencao.base_retencao = informacon.totais.base_retencao
      resumo.retencao.liquido_a_pagar = waveServicoTotal - informacon.totais.retencao

      // 3) Ajustes feitos pelo admin (migration 061) — agrupa por item, pega
      // o ajuste mais recente de cada item pra mostrar no email
      for (const l of linhas) {
        if (l.foi_ajustado_pelo_admin && l.ajustes_admin.length > 0) {
          const ultimo = l.ajustes_admin[l.ajustes_admin.length - 1]
          ajustesAdmin.push({
            codigo: l.codigo,
            descricao: l.descricao,
            quantidade_anterior: ultimo.quantidade_anterior,
            quantidade_nova: ultimo.quantidade_nova,
            motivo: ultimo.motivo,
            ajustado_por_nome: ultimo.ajustado_por_nome,
            ajustado_em: ultimo.ajustado_em,
          })
        }
      }
    }
  } catch (e: any) {
    log.warn('email_dados_informacon_falhou', {
      medicaoId: args.medicaoId,
      error: e?.message,
    })
  }

  const tpl = templateLiberacaoMedicaoFornecedor({
    numero_medicao: (med as any).numero,
    periodo_referencia: (med as any).periodo_referencia ?? '—',
    data_aprovacao: (med as any).data_aprovacao ?? new Date().toISOString(),
    contrato_numero: (med as any).contrato?.numero ?? null,
    itens: ((med as any).medicao_itens || []).map((it: any) => ({
      codigo: it.detalhamento?.codigo ?? null,
      descricao: it.detalhamento?.descricao ?? '',
      qtde: it.quantidade_medida ?? null,
      valor_total: Number(it.valor_medido || 0),
    })),
    observacoes: (med as any).observacoes,
    resumo,
    aprovador_nome: args.aprovadorNome,
    reenvio: false,
    itens_com_confirmacao_sem_nf: itensComConfirmacao,
    nfs_a_emitir: {
      fip_material: { valor: fipMaterialTotal },
      // NF Wave: valor LÍQUIDO (= bruto − débito do livro-razão de retenção).
      // O breakdown completo (saldo antes/depois, crédito, débito) vai pro
      // bloco de retenção do email. Se o cálculo de retenção falhou,
      // valorWaveLiquido fica em 0 — nesse caso volta pro bruto pra não
      // exibir R$ 0,00.
      wave_servico: {
        valor: (args.valorWaveLiquido && args.valorWaveLiquido > 0)
          ? args.valorWaveLiquido
          : waveServicoTotal,
        valor_bruto: args.retencaoBreakdown?.wave_bruto ?? waveServicoTotal,
        retencao: args.retencaoBreakdown?.debito ?? 0,
      },
    },
    retencao_breakdown: args.retencaoBreakdown,
    fip_por_grupo_macro: fipPorGrupoMacro,
    ajustes_admin: ajustesAdmin.length > 0 ? ajustesAdmin : undefined,
    solicitacao_fat_direto_rascunho: args.solicitacaoFatDiretoId
      ? {
          id: args.solicitacaoFatDiretoId,
          url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://fip-wave.vercel.app'}/contratos/${args.contratoId}/fat-direto/solicitacoes/${args.solicitacaoFatDiretoId}`,
        }
      : undefined,
    solicitacao_wave_rascunho: args.solicitacaoWaveId
      ? {
          id: args.solicitacaoWaveId,
          url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://fip-wave.vercel.app'}/contratos/${args.contratoId}/fat-direto/solicitacoes/${args.solicitacaoWaveId}`,
        }
      : undefined,
  })

  const envio = await sendEmail({
    to: emails,
    subject: tpl.subject,
    html: tpl.html,
    tipo: 'aprovado',
  })
  if (!envio.success) return { ok: false, qtd: emails.length, erro: envio.error || 'Falha ao enviar' }

  log.info('email_liberacao_medicao_enviado', {
    medicaoId: args.medicaoId,
    qtd: emails.length,
    saldo_retencao: resumo.retencao.valor,
  })
  return { ok: true, qtd: emails.length }
}
