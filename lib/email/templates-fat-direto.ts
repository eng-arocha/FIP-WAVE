/**
 * Template oficial de email de autorização de Faturamento Direto.
 *
 * Enviado ao FORNECEDOR quando a Gestão WAVE aprova uma solicitação,
 * com CC para todos os usuários atrelados à obra.
 *
 * Dados CONTRATANTE/CONTRATADO são fixos (podem ser sobrescritos por env).
 * Dados da obra (endereço entrega, contato local) vêm de env vars
 * ou usam os defaults oficiais hardcoded abaixo.
 *
 * Env vars (todas opcionais — têm defaults oficiais):
 *   CONTRATANTE_RAZAO_SOCIAL   (default: "WAVE")
 *   CONTRATANTE_CNPJ           (default: "50.682.110/0001-59")
 *   CONTRATANTE_ENDERECO       (default: endereço oficial Meireles)
 *   CONTRATADO_RAZAO_SOCIAL    (default: "FIP ENGENHARIA ELETRICA LTDA")
 *   CONTRATADO_CNPJ            (default: "26.736.376/0001-52")
 *   CONTRATADO_ENDERECO        (default: endereço oficial Sapiranga)
 *   OBRA_ENDERECO_ENTREGA      (default: mesmo da CONTRATANTE)
 *   OBRA_CONTATO_LOCAL_NOME    (default: "Batista (Almoxarife WAVE)")
 *   OBRA_CONTATO_LOCAL_TELEFONE (default: "(85) 98757-6240")
 *   OBRA_GESTOR_NOME           (default: "Alex Rocha")
 *   OBRA_GESTOR_CARGO          (default: "Gestor de Obras")
 *   OBRA_PRAZO_MIN_DIAS        (default: "20")
 */

const CONTRATANTE = {
  razaoSocial: process.env.CONTRATANTE_RAZAO_SOCIAL || 'WAVE',
  cnpj:        process.env.CONTRATANTE_CNPJ         || '50.682.110/0001-59',
  endereco:    process.env.CONTRATANTE_ENDERECO     ||
    'Avenida Beira Mar, n.º 1696, Meireles, Fortaleza, Ceará, CEP 60.165-120',
}

const CONTRATADO = {
  razaoSocial: process.env.CONTRATADO_RAZAO_SOCIAL || 'FIP ENGENHARIA ELETRICA LTDA',
  cnpj:        process.env.CONTRATADO_CNPJ         || '26.736.376/0001-52',
  endereco:    process.env.CONTRATADO_ENDERECO     ||
    'Rua Antônio Gentil, n.º 1660, Sapiranga, Fortaleza, Ceará, CEP 60.833-695',
}

const OBRA = {
  enderecoEntrega: process.env.OBRA_ENDERECO_ENTREGA ||
    'Avenida Beira Mar, n.º 1696, Meireles, Fortaleza, Ceará, CEP 60.165-120',
  contatoLocalNome: process.env.OBRA_CONTATO_LOCAL_NOME || 'Batista (Almoxarife WAVE)',
  contatoLocalTel:  process.env.OBRA_CONTATO_LOCAL_TELEFONE || '(85) 98757-6240',
  gestorNome:  process.env.OBRA_GESTOR_NOME  || 'Alex Rocha',
  gestorCargo: process.env.OBRA_GESTOR_CARGO || 'Gestor de Obras',
  prazoMinDias: Number(process.env.OBRA_PRAZO_MIN_DIAS || '20'),
}

function fmt(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function maskCnpj(v: string | null | undefined): string {
  const d = (v || '').replace(/\D/g, '')
  if (d.length !== 14) return v || ''
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`
}

function escapeHtml(s: string | null | undefined): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
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
  /** Usado em reenvios — aparece como badge "Reenvio" no topo */
  reenvio?: boolean
}

/**
 * Email oficial de autorização de faturamento direto ao fornecedor.
 * Formato aprovado: contratante + contratado + fornecedor + destinatário NF
 * + itens + condições (boleto + prazo min) + responsáveis.
 */
export function templateSolicitacaoAprovadaFornecedor(p: SolicitacaoAprovadaPayload): {
  subject: string
  html: string
  text: string
} {
  const fip = `FIP-${String(p.numero_fip).padStart(4, '0')}`
  const prefixo = p.reenvio ? '[REENVIO] ' : ''
  const subject = `${prefixo}[${fip}] Autorização de Faturamento Direto — Obra WAVE`

  const itensHtml = p.itens.map(it => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(it.descricao)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${it.qtde ?? ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${fmt(Number(it.valor_total || 0))}</td>
    </tr>
  `).join('')

  const reenvioBadge = p.reenvio ? `
    <div style="background:#fef3c7;border:1px solid #f59e0b;color:#92400e;padding:10px 16px;border-radius:8px;margin-bottom:16px;font-size:13px;">
      <strong>Reenvio</strong> — este e-mail é um reenvio de uma autorização emitida anteriormente. Use esta versão como referência atualizada.
    </div>
  ` : ''

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#0f172a;">
  <div style="max-width:680px;margin:0 auto;padding:24px;">

    ${reenvioBadge}

    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">

      <!-- Header -->
      <div style="background:#1e3a8a;color:#ffffff;padding:24px;">
        <h1 style="margin:0;font-size:20px;">Autorização de Faturamento Direto</h1>
        <p style="margin:6px 0 0;font-size:13px;opacity:0.9;">${fip} · Obra WAVE</p>
      </div>

      <!-- Saudação -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <p style="margin:0 0 12px;font-size:15px;">
          Prezado(a)${p.fornecedor_razao_social ? ` <strong>${escapeHtml(p.fornecedor_razao_social)}</strong>` : ''},
        </p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
          A <strong>Gestão da Obra WAVE</strong> <strong>autoriza a emissão de Nota Fiscal em
          faturamento direto</strong> para o pedido identificado como <strong>${fip}</strong>,
          nos termos descritos abaixo.
        </p>
      </div>

      <!-- 1. CONTRATANTE -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">1. Contratante</h2>
        <table style="width:100%;font-size:14px;">
          <tr><td style="padding:4px 0;color:#64748b;width:160px;">Razão Social</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(CONTRATANTE.razaoSocial)}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;">CNPJ</td><td style="padding:4px 0;font-weight:600;font-family:ui-monospace,monospace;">${maskCnpj(CONTRATANTE.cnpj)}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;vertical-align:top;">Endereço</td><td style="padding:4px 0;">${escapeHtml(CONTRATANTE.endereco)}</td></tr>
        </table>
      </div>

      <!-- 2. CONTRATADO -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">2. Contratado (executor da obra)</h2>
        <table style="width:100%;font-size:14px;">
          <tr><td style="padding:4px 0;color:#64748b;width:160px;">Razão Social</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(CONTRATADO.razaoSocial)}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;">CNPJ</td><td style="padding:4px 0;font-weight:600;font-family:ui-monospace,monospace;">${maskCnpj(CONTRATADO.cnpj)}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;vertical-align:top;">Endereço</td><td style="padding:4px 0;">${escapeHtml(CONTRATADO.endereco)}</td></tr>
        </table>
      </div>

      <!-- 3. FORNECEDOR -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">3. Fornecedor (destinatário desta autorização)</h2>
        <table style="width:100%;font-size:14px;">
          <tr><td style="padding:4px 0;color:#64748b;width:160px;">Razão Social</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(p.fornecedor_razao_social || '—')}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;">CNPJ</td><td style="padding:4px 0;font-weight:600;font-family:ui-monospace,monospace;">${maskCnpj(p.fornecedor_cnpj)}</td></tr>
          ${p.fornecedor_contato ? `<tr><td style="padding:4px 0;color:#64748b;vertical-align:top;">Contato</td><td style="padding:4px 0;">${escapeHtml(p.fornecedor_contato)}</td></tr>` : ''}
        </table>
      </div>

      <!-- 4. Emitir NF para -->
      <div style="padding:24px;background:#eff6ff;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#1e3a8a;">4. Emitir Nota Fiscal para</h2>
        <table style="width:100%;font-size:14px;">
          <tr><td style="padding:4px 0;color:#64748b;width:160px;">Razão Social</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(CONTRATANTE.razaoSocial)}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;">CNPJ</td><td style="padding:4px 0;font-weight:600;font-family:ui-monospace,monospace;">${maskCnpj(CONTRATANTE.cnpj)}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;vertical-align:top;">Endereço de entrega</td><td style="padding:4px 0;">${escapeHtml(OBRA.enderecoEntrega)}</td></tr>
        </table>
      </div>

      <!-- 5. Itens autorizados -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">5. Itens autorizados</h2>
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

      <!-- 6. CONDIÇÕES OBRIGATÓRIAS -->
      <div style="padding:24px;background:#fef2f2;border-left:4px solid #dc2626;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#991b1b;">6. ⚠️ Condições obrigatórias de recebimento</h2>
        <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.8;color:#1f2937;">
          <li>A <strong>Nota Fiscal</strong> só será recebida com <strong>boleto anexado</strong> com prazo vigente.</li>
          <li><strong>Prazo mínimo de pagamento: ${OBRA.prazoMinDias} dias</strong> a contar da entrega do material.</li>
          <li>A <strong>Nota Fiscal só será recebida no momento da entrega do material na obra</strong>.</li>
        </ul>
        <p style="margin:12px 0 0;font-size:13px;color:#991b1b;font-weight:600;">
          O não cumprimento de qualquer condição acima resulta na recusa do recebimento da Nota Fiscal.
        </p>
      </div>

      <!-- 7. Responsáveis -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">7. Responsáveis</h2>
        <table style="width:100%;font-size:14px;">
          <tr>
            <td style="padding:4px 0;color:#64748b;width:220px;">${escapeHtml(OBRA.gestorCargo)} (autorizador)</td>
            <td style="padding:4px 0;font-weight:600;">${escapeHtml(p.aprovador_nome || OBRA.gestorNome)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#64748b;vertical-align:top;">Contato local (recebimento)</td>
            <td style="padding:4px 0;">
              <strong>${escapeHtml(OBRA.contatoLocalNome)}</strong><br>
              <span style="font-family:ui-monospace,monospace;">${escapeHtml(OBRA.contatoLocalTel)}</span>
            </td>
          </tr>
        </table>
      </div>

      ${p.observacoes ? `
      <!-- 8. Observações -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">8. Observações do pedido</h2>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#475569;white-space:pre-wrap;">${escapeHtml(p.observacoes)}</p>
      </div>` : ''}

      <!-- Rodapé -->
      <div style="padding:20px 24px;background:#f8fafc;font-size:12px;color:#64748b;line-height:1.6;">
        <p style="margin:0 0 4px;">Este é um e-mail automático da Gestão da <strong>Obra WAVE</strong>.</p>
        <p style="margin:0;">Dúvidas? Responda este e-mail — sua mensagem será encaminhada à gestão.</p>
      </div>

    </div>

  </div>
</body>
</html>`

  const text = [
    `${fip} — AUTORIZAÇÃO DE FATURAMENTO DIRETO — OBRA WAVE`,
    p.reenvio ? '*** REENVIO ***' : '',
    '',
    `Prezado(a) ${p.fornecedor_razao_social || 'fornecedor'},`,
    '',
    `A Gestão da Obra WAVE autoriza a emissão de NF em faturamento direto`,
    `para o pedido ${fip}, nos termos abaixo.`,
    '',
    `1. CONTRATANTE`,
    `   ${CONTRATANTE.razaoSocial} — CNPJ: ${maskCnpj(CONTRATANTE.cnpj)}`,
    `   ${CONTRATANTE.endereco}`,
    '',
    `2. CONTRATADO (executor)`,
    `   ${CONTRATADO.razaoSocial} — CNPJ: ${maskCnpj(CONTRATADO.cnpj)}`,
    `   ${CONTRATADO.endereco}`,
    '',
    `3. FORNECEDOR (destinatário desta autorização)`,
    `   ${p.fornecedor_razao_social || '—'}`,
    `   CNPJ: ${maskCnpj(p.fornecedor_cnpj)}`,
    p.fornecedor_contato ? `   Contato: ${p.fornecedor_contato}` : '',
    '',
    `4. EMITIR NF PARA`,
    `   ${CONTRATANTE.razaoSocial} — CNPJ: ${maskCnpj(CONTRATANTE.cnpj)}`,
    `   Endereço de entrega: ${OBRA.enderecoEntrega}`,
    '',
    `5. ITENS AUTORIZADOS`,
    ...p.itens.map(it => `   - ${it.descricao}${it.qtde ? ` (qtde ${it.qtde})` : ''} — ${fmt(Number(it.valor_total || 0))}`),
    `   TOTAL: ${fmt(p.valor_total)}`,
    '',
    `6. CONDIÇÕES OBRIGATÓRIAS`,
    `   - NF só com boleto anexado e prazo vigente`,
    `   - Prazo mínimo de pagamento: ${OBRA.prazoMinDias} dias`,
    `   - NF só recebida no momento da entrega do material na obra`,
    `   O não cumprimento resulta na recusa da NF.`,
    '',
    `7. RESPONSÁVEIS`,
    `   ${OBRA.gestorCargo}: ${p.aprovador_nome || OBRA.gestorNome}`,
    `   Contato local: ${OBRA.contatoLocalNome} — ${OBRA.contatoLocalTel}`,
    '',
    p.observacoes ? `8. OBSERVAÇÕES\n   ${p.observacoes}` : '',
    '',
    `— Gestão WAVE`,
  ].filter(Boolean).join('\n')

  return { subject, html, text }
}
