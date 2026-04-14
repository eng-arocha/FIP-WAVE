/**
 * Templates de email relacionados a Faturamento Direto.
 *
 * Dados da obra WAVE são lidos do env. O TEXTO DO PRAZO DE PAGAMENTO
 * fica em variável separada pra o gestor validar/ajustar sem redeploy.
 *
 * Env vars:
 *   OBRA_CNPJ                    — CNPJ da obra (destinatário do material)
 *   OBRA_RAZAO_SOCIAL            — Razão social da obra
 *   OBRA_ENDERECO_ENTREGA        — Endereço completo de entrega
 *   OBRA_CONTATO_RESPONSAVEL     — Nome do responsável pela recepção
 *   OBRA_CONTATO_TELEFONE        — Telefone do responsável
 *   OBRA_PRAZO_PAGAMENTO_TEXTO   — Texto oficial do prazo (validar com jurídico)
 *   FAT_DIRETO_EMAIL_FROM_NAME   — Nome do remetente (default: "Gestão WAVE")
 */

const OBRA = {
  razaoSocial:   process.env.OBRA_RAZAO_SOCIAL   || 'OBRA WAVE',
  cnpj:          process.env.OBRA_CNPJ           || '00.000.000/0000-00',
  enderecoEntrega: process.env.OBRA_ENDERECO_ENTREGA || '[CONFIGURAR EM VAR OBRA_ENDERECO_ENTREGA]',
  contatoResp:   process.env.OBRA_CONTATO_RESPONSAVEL || '',
  contatoTel:    process.env.OBRA_CONTATO_TELEFONE    || '',
  prazoPagamento: process.env.OBRA_PRAZO_PAGAMENTO_TEXTO
    || '[Aguardando validação do texto oficial — configure em OBRA_PRAZO_PAGAMENTO_TEXTO]',
}

function fmt(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function maskCnpj(v: string): string {
  const d = (v || '').replace(/\D/g, '')
  if (d.length !== 14) return v
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`
}

export interface SolicitacaoAprovadaPayload {
  numero_fip: number | string
  fornecedor_razao_social?: string | null
  fornecedor_cnpj?: string | null
  fornecedor_contato?: string | null
  valor_total: number
  itens: Array<{ descricao: string; qtde?: number; valor_total: number }>
  observacoes?: string | null
  aprovador_nome?: string | null
}

/**
 * Email enviado ao FORNECEDOR quando a Gestão WAVE aprova uma solicitação
 * de faturamento direto. Inclui dados da obra (CNPJ/endereço/contato) e
 * texto oficial do prazo de pagamento.
 */
export function templateSolicitacaoAprovadaFornecedor(p: SolicitacaoAprovadaPayload): {
  subject: string
  html: string
  text: string
} {
  const fip = `FIP-${String(p.numero_fip).padStart(4, '0')}`
  const subject = `[${fip}] Pedido aprovado — ${OBRA.razaoSocial}`

  const itensHtml = p.itens.map(it => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(it.descricao)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${it.qtde ?? ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${fmt(Number(it.valor_total || 0))}</td>
    </tr>
  `).join('')

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#0f172a;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">

    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">

      <!-- Header -->
      <div style="background:#1e3a8a;color:#ffffff;padding:24px;">
        <h1 style="margin:0;font-size:20px;">Pedido Aprovado ✓</h1>
        <p style="margin:6px 0 0;font-size:13px;opacity:0.9;">${fip} · ${OBRA.razaoSocial}</p>
      </div>

      <!-- Saudação -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <p style="margin:0 0 12px;font-size:15px;">Prezado fornecedor${p.fornecedor_razao_social ? ` <strong>${escapeHtml(p.fornecedor_razao_social)}</strong>` : ''},</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
          A <strong>Gestão da Obra WAVE</strong> confirma a aprovação da sua solicitação de faturamento direto identificada como <strong>${fip}</strong>.
          Abaixo estão os dados para emissão da Nota Fiscal e o prazo oficial de pagamento.
        </p>
      </div>

      <!-- Dados da obra (destinatário NF) -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">Emitir a Nota Fiscal para</h2>
        <table style="width:100%;font-size:14px;">
          <tr>
            <td style="padding:4px 0;color:#64748b;width:160px;">Razão Social</td>
            <td style="padding:4px 0;font-weight:600;">${escapeHtml(OBRA.razaoSocial)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#64748b;">CNPJ</td>
            <td style="padding:4px 0;font-weight:600;font-family:ui-monospace,monospace;">${maskCnpj(OBRA.cnpj)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#64748b;vertical-align:top;">Endereço de entrega</td>
            <td style="padding:4px 0;">${escapeHtml(OBRA.enderecoEntrega)}</td>
          </tr>
          ${OBRA.contatoResp ? `
          <tr>
            <td style="padding:4px 0;color:#64748b;">Contato local</td>
            <td style="padding:4px 0;">${escapeHtml(OBRA.contatoResp)}${OBRA.contatoTel ? ` · ${escapeHtml(OBRA.contatoTel)}` : ''}</td>
          </tr>` : ''}
        </table>
      </div>

      <!-- Itens aprovados -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">Itens aprovados</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="padding:8px 12px;text-align:left;color:#475569;font-weight:600;">Descrição</th>
              <th style="padding:8px 12px;text-align:right;color:#475569;font-weight:600;">Qtde</th>
              <th style="padding:8px 12px;text-align:right;color:#475569;font-weight:600;">Valor</th>
            </tr>
          </thead>
          <tbody>${itensHtml}</tbody>
          <tfoot>
            <tr style="background:#eff6ff;">
              <td colspan="2" style="padding:12px;text-align:right;font-weight:700;color:#1e3a8a;">TOTAL APROVADO</td>
              <td style="padding:12px;text-align:right;font-weight:700;color:#1e3a8a;font-size:15px;">${fmt(p.valor_total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Prazo de pagamento -->
      <div style="padding:24px;background:#fefce8;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#713f12;">Prazo de pagamento</h2>
        <p style="margin:0;font-size:14px;line-height:1.7;color:#422006;white-space:pre-wrap;">${escapeHtml(OBRA.prazoPagamento)}</p>
      </div>

      <!-- Observações -->
      ${p.observacoes ? `
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">Observações</h2>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#475569;white-space:pre-wrap;">${escapeHtml(p.observacoes)}</p>
      </div>` : ''}

      <!-- Rodapé -->
      <div style="padding:20px 24px;background:#f8fafc;font-size:12px;color:#64748b;line-height:1.6;">
        <p style="margin:0 0 4px;">Este é um e-mail automático da gestão da <strong>Obra WAVE</strong>.</p>
        <p style="margin:0;">Qualquer dúvida, responda a este e-mail que sua mensagem será encaminhada ao gestor responsável${p.aprovador_nome ? ` (${escapeHtml(p.aprovador_nome)})` : ''}.</p>
      </div>

    </div>

  </div>
</body>
</html>`

  const text = [
    `${fip} — Pedido Aprovado`,
    ``,
    `Prezado ${p.fornecedor_razao_social || 'fornecedor'},`,
    ``,
    `A Gestão da Obra WAVE confirma a aprovação da solicitação de faturamento direto ${fip}.`,
    ``,
    `EMITIR NF PARA:`,
    `  ${OBRA.razaoSocial}`,
    `  CNPJ: ${maskCnpj(OBRA.cnpj)}`,
    `  Endereço de entrega: ${OBRA.enderecoEntrega}`,
    OBRA.contatoResp ? `  Contato local: ${OBRA.contatoResp}${OBRA.contatoTel ? ' — ' + OBRA.contatoTel : ''}` : '',
    ``,
    `ITENS APROVADOS:`,
    ...p.itens.map(it => `  - ${it.descricao}${it.qtde ? ` (qtde ${it.qtde})` : ''} — ${fmt(Number(it.valor_total || 0))}`),
    ``,
    `TOTAL: ${fmt(p.valor_total)}`,
    ``,
    `PRAZO DE PAGAMENTO:`,
    OBRA.prazoPagamento,
    ``,
    p.observacoes ? `OBSERVAÇÕES: ${p.observacoes}` : '',
    ``,
    `— Gestão WAVE`,
  ].filter(Boolean).join('\n')

  return { subject, html, text }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
