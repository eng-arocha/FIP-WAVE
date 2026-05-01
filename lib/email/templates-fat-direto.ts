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
        <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#0f172a;">
          Notificação interna da Obra WAVE
        </p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
          A solicitação de <strong>faturamento direto ${fip}</strong> foi
          <strong>${p.reenvio ? 'reenviada' : 'aprovada'}</strong> pela Gestão.
          Abaixo os dados oficiais a serem comunicados ao fornecedor
          <strong>${escapeHtml(p.fornecedor_razao_social || '')}</strong> e as condições
          obrigatórias de recebimento da NF na obra.
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
        <p style="margin:0 0 4px;">Este é um e-mail automático de notificação interna da <strong>Obra WAVE</strong>.</p>
        <p style="margin:0;">Dúvidas? Responda este e-mail — sua mensagem vai pra gestão.</p>
      </div>

    </div>

  </div>
</body>
</html>`

  const text = [
    `${fip} — AUTORIZAÇÃO DE FATURAMENTO DIRETO — OBRA WAVE (notificação interna)`,
    p.reenvio ? '*** REENVIO ***' : '',
    '',
    `A solicitação de faturamento direto ${fip} foi ${p.reenvio ? 'reenviada' : 'aprovada'} pela Gestão WAVE.`,
    `Dados oficiais a serem comunicados ao fornecedor ${p.fornecedor_razao_social || ''} e condições abaixo.`,
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

// ============================================================
// Template: Pedido encerrado com devolução de saldo
// ============================================================

export interface PedidoEncerradoPayload {
  numero_fip: number
  fornecedor_razao_social: string | null
  fornecedor_cnpj: string | null
  valor_original: number
  total_nfs: number
  saldo_devolvido: number
  motivo: string | null
  encerrado_por_nome: string | null
  data_encerramento: string // ISO
  devolucoes: Array<{
    descricao: string
    valor: number
    codigo_detalhamento?: string | null
  }>
}

/**
 * E-mail de notificação interna informando que um pedido aprovado foi
 * encerrado e o saldo retornou aos itens originais. Mesmo layout visual
 * do template de aprovação.
 */
export function templatePedidoEncerrado(p: PedidoEncerradoPayload): {
  subject: string
  html: string
  text: string
} {
  const fip = `FIP-${String(p.numero_fip).padStart(4, '0')}`
  const subject = `[${fip}] Pedido encerrado — saldo de ${fmt(p.saldo_devolvido)} devolvido`

  const dataFmt = (() => {
    try { return new Date(p.data_encerramento).toLocaleDateString('pt-BR') }
    catch { return '' }
  })()

  const devolucoesHtml = p.devolucoes
    .filter(d => d.valor > 0)
    .map(d => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
          ${d.codigo_detalhamento ? `<span style="font-family:ui-monospace,monospace;background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:11px;margin-right:6px;">${escapeHtml(d.codigo_detalhamento)}</span>` : ''}
          ${escapeHtml(d.descricao)}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#059669;">+ ${fmt(d.valor)}</td>
      </tr>
    `).join('')

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#0f172a;">
  <div style="max-width:680px;margin:0 auto;padding:24px;">

    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">

      <!-- Header -->
      <div style="background:#475569;color:#ffffff;padding:24px;">
        <h1 style="margin:0;font-size:20px;">Pedido encerrado — saldo devolvido</h1>
        <p style="margin:6px 0 0;font-size:13px;opacity:0.9;">${fip} · Obra WAVE</p>
      </div>

      <!-- Saudação -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#0f172a;">
          Notificação interna da Obra WAVE
        </p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
          O pedido <strong>${fip}</strong> foi <strong>encerrado</strong> em
          ${dataFmt} por <strong>${escapeHtml(p.encerrado_por_nome || 'Gestão')}</strong>.
          O saldo não-utilizado de <strong>${fmt(p.saldo_devolvido)}</strong> foi
          devolvido aos itens originais e está disponível para novos pedidos.
        </p>
      </div>

      <!-- 1. RESUMO FINANCEIRO -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">1. Resumo financeiro</h2>
        <table style="width:100%;font-size:14px;">
          <tr><td style="padding:6px 0;color:#64748b;">Valor original do pedido</td><td style="padding:6px 0;text-align:right;font-weight:600;">${fmt(p.valor_original)}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Total recebido em NFs</td><td style="padding:6px 0;text-align:right;font-weight:600;">${fmt(p.total_nfs)}</td></tr>
          <tr style="border-top:2px solid #e5e7eb;"><td style="padding:8px 0;color:#0f172a;font-weight:700;">Saldo devolvido aos itens</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#059669;">${fmt(p.saldo_devolvido)}</td></tr>
        </table>
      </div>

      <!-- 2. FORNECEDOR -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">2. Fornecedor</h2>
        <table style="width:100%;font-size:14px;">
          <tr><td style="padding:4px 0;color:#64748b;width:160px;">Razão Social</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(p.fornecedor_razao_social || '—')}</td></tr>
          ${p.fornecedor_cnpj ? `<tr><td style="padding:4px 0;color:#64748b;">CNPJ</td><td style="padding:4px 0;font-weight:600;font-family:ui-monospace,monospace;">${maskCnpj(p.fornecedor_cnpj)}</td></tr>` : ''}
        </table>
      </div>

      <!-- 3. DEVOLUÇÃO POR ITEM -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">3. Devolução por item (saldo liberado)</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:8px 12px;text-align:left;font-weight:600;color:#64748b;border-bottom:1px solid #e5e7eb;">Descrição</th>
              <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:1px solid #e5e7eb;">Valor devolvido</th>
            </tr>
          </thead>
          <tbody>
            ${devolucoesHtml || `<tr><td colspan="2" style="padding:12px;text-align:center;color:#64748b;">Nenhuma devolução listada.</td></tr>`}
            <tr style="background:#f0fdf4;">
              <td style="padding:10px 12px;font-weight:700;border-top:2px solid #d1d5db;">TOTAL DEVOLVIDO</td>
              <td style="padding:10px 12px;text-align:right;font-weight:700;color:#059669;border-top:2px solid #d1d5db;">${fmt(p.saldo_devolvido)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      ${p.motivo ? `
      <!-- 4. MOTIVO -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">4. Motivo</h2>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;white-space:pre-wrap;">${escapeHtml(p.motivo)}</p>
      </div>
      ` : ''}

      <!-- 5. RESPONSÁVEL -->
      <div style="padding:24px;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">${p.motivo ? '5' : '4'}. Encerrado por</h2>
        <p style="margin:0;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(p.encerrado_por_nome || 'Gestão WAVE')}</p>
      </div>

    </div>

    <p style="margin:16px 0 0;font-size:12px;color:#64748b;text-align:center;">
      Este é um e-mail automático de notificação interna da Obra WAVE.<br>
      Dúvidas? Responda este e-mail — sua mensagem vai pra gestão.
    </p>

  </div>
</body>
</html>`

  const text = [
    `${subject}`,
    '',
    `O pedido ${fip} foi ENCERRADO em ${dataFmt} por ${p.encerrado_por_nome || 'Gestão'}.`,
    `Saldo de ${fmt(p.saldo_devolvido)} devolvido aos itens originais.`,
    '',
    `1. RESUMO FINANCEIRO`,
    `   Valor original: ${fmt(p.valor_original)}`,
    `   Total NFs:      ${fmt(p.total_nfs)}`,
    `   Devolvido:      ${fmt(p.saldo_devolvido)}`,
    '',
    `2. FORNECEDOR`,
    `   ${p.fornecedor_razao_social || '—'}`,
    p.fornecedor_cnpj ? `   CNPJ: ${maskCnpj(p.fornecedor_cnpj)}` : '',
    '',
    `3. DEVOLUÇÃO POR ITEM`,
    ...p.devolucoes.filter(d => d.valor > 0).map(d => `   + ${fmt(d.valor)} — ${d.descricao}`),
    `   TOTAL: ${fmt(p.saldo_devolvido)}`,
    '',
    p.motivo ? `4. MOTIVO\n   ${p.motivo}` : '',
    '',
    `— Gestão WAVE`,
  ].filter(Boolean).join('\n')

  return { subject, html, text }
}

// ============================================================
// Template: Solicitação de encerramento de saldo (aprovador)
// ============================================================

export interface SolicitacaoEncerramentoSaldoEmailInput {
  // Identificação
  numero_pedido_fip: number | null
  contrato_numero: string  // ex: "WAVE-2025-001"
  fornecedor_razao_social: string

  // Valores
  valor_pedido: number
  total_nfs_lancadas: number
  saldo_solicitado: number  // = valor_pedido - total_nfs

  // Solicitação
  motivo: string
  solicitado_por_nome: string
  solicitado_por_email: string
  solicitado_em: string  // ISO timestamp

  // Links
  url_aprovacao: string  // ex: https://fip-wave.vercel.app/contratos/{id}/encerramentos
  contrato_id: string
}

/**
 * E-mail enviado ao aprovador quando alguém solicita o encerramento do
 * saldo de um pedido de faturamento direto. O aprovador revisa, aprova
 * ou rejeita a solicitação — ao aprovar, o saldo é devolvido ao teto
 * de faturamento direto do contrato.
 */
export function templateSolicitacaoEncerramentoSaldo(
  input: SolicitacaoEncerramentoSaldoEmailInput,
): { subject: string; html: string; text: string } {
  const fip = input.numero_pedido_fip != null
    ? `FIP-${String(input.numero_pedido_fip).padStart(4, '0')}`
    : 'FIP-—'

  const subject = `[FIP-WAVE] Solicitação de encerramento de saldo — Pedido ${fip} (${input.contrato_numero})`

  const dataFmt = (() => {
    try {
      return new Date(input.solicitado_em).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch { return input.solicitado_em }
  })()

  // Quantas NFs foram lançadas (não temos contagem direta, então o copy
  // diz só o valor — se o caller quiser nomes, pode passar no motivo)
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#0f172a;">
  <div style="max-width:680px;margin:0 auto;padding:24px;">

    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">

      <!-- Header -->
      <div style="background:#b45309;color:#ffffff;padding:24px;">
        <h1 style="margin:0;font-size:20px;">Solicitação de encerramento de saldo</h1>
        <p style="margin:6px 0 0;font-size:13px;opacity:0.9;">${fip} · ${escapeHtml(input.contrato_numero)} · Aguardando sua decisão</p>
      </div>

      <!-- Saudação -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#0f172a;">
          Prezado(a) Aprovador,
        </p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
          <strong>${escapeHtml(input.fornecedor_razao_social)}</strong> solicitou o
          encerramento do saldo do pedido <strong>${fip}</strong>
          (contrato <strong>${escapeHtml(input.contrato_numero)}</strong>).
        </p>
      </div>

      <!-- 1. RESUMO FINANCEIRO -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">1. Resumo financeiro</h2>
        <table style="width:100%;font-size:14px;">
          <tr><td style="padding:6px 0;color:#64748b;">Valor do pedido</td><td style="padding:6px 0;text-align:right;font-weight:600;">${fmt(input.valor_pedido)}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">NFs lançadas</td><td style="padding:6px 0;text-align:right;font-weight:600;">${fmt(input.total_nfs_lancadas)}</td></tr>
          <tr style="border-top:2px solid #e5e7eb;"><td style="padding:8px 0;color:#0f172a;font-weight:700;">Saldo solicitado para encerramento</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#b45309;">${fmt(input.saldo_solicitado)}</td></tr>
        </table>
      </div>

      <!-- 2. MOTIVO DECLARADO -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">2. Motivo declarado</h2>
        <blockquote style="margin:0;padding:12px 16px;background:#f8fafc;border-left:4px solid #b45309;font-size:14px;line-height:1.6;color:#0f172a;font-style:italic;white-space:pre-wrap;">${escapeHtml(input.motivo)}</blockquote>
      </div>

      <!-- 3. EFEITO DA APROVAÇÃO -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;background:#eff6ff;">
        <p style="margin:0;font-size:14px;line-height:1.6;color:#1e3a8a;">
          Após sua aprovação, o saldo de <strong>${fmt(input.saldo_solicitado)}</strong>
          será cancelado e devolvido ao teto de faturamento direto do contrato —
          ficará disponível pra outros pedidos.
        </p>
      </div>

      <!-- 4. CTA -->
      <div style="padding:24px;text-align:center;border-bottom:1px solid #e2e8f0;">
        <a href="${escapeHtml(input.url_aprovacao)}"
           style="display:inline-block;background:#b45309;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
          Revisar e decidir →
        </a>
      </div>

      <!-- 5. SOLICITANTE -->
      <div style="padding:24px;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">Solicitação</h2>
        <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">
          Solicitado por <strong>${escapeHtml(input.solicitado_por_nome)}</strong>
          (<a href="mailto:${escapeHtml(input.solicitado_por_email)}" style="color:#1e3a8a;">${escapeHtml(input.solicitado_por_email)}</a>)
          em ${escapeHtml(dataFmt)}.
        </p>
      </div>

    </div>

    <p style="margin:16px 0 0;font-size:12px;color:#64748b;text-align:center;">
      Este é um e-mail automático de notificação interna da Obra WAVE.<br>
      Dúvidas? Responda este e-mail — sua mensagem vai pra gestão.
    </p>

  </div>
</body>
</html>`

  const text = [
    subject,
    '',
    `Prezado(a) Aprovador,`,
    '',
    `${input.fornecedor_razao_social} solicitou o encerramento do saldo do pedido ${fip} (contrato ${input.contrato_numero}).`,
    '',
    `1. RESUMO FINANCEIRO`,
    `   Valor do pedido:                    ${fmt(input.valor_pedido)}`,
    `   NFs lançadas:                       ${fmt(input.total_nfs_lancadas)}`,
    `   Saldo solicitado para encerramento: ${fmt(input.saldo_solicitado)}`,
    '',
    `2. MOTIVO DECLARADO`,
    `   "${input.motivo}"`,
    '',
    `Após sua aprovação, o saldo de ${fmt(input.saldo_solicitado)} será cancelado`,
    `e devolvido ao teto de faturamento direto do contrato — ficará disponível`,
    `pra outros pedidos.`,
    '',
    `Revisar e decidir: ${input.url_aprovacao}`,
    '',
    `Solicitado por ${input.solicitado_por_nome} (${input.solicitado_por_email}) em ${dataFmt}.`,
    '',
    `— Gestão WAVE`,
  ].join('\n')

  return { subject, html, text }
}

// ============================================================
// Template: Encerramento de saldo APROVADO (notifica fornecedor)
// ============================================================

export interface EncerramentoSaldoAprovadoEmailInput {
  numero_pedido_fip: number | null
  contrato_numero: string
  fornecedor_razao_social: string
  valor_pedido: number
  saldo_cancelado: number
  motivo_solicitacao: string
  decidido_por_nome: string
  decidido_em: string
  url_pedido: string  // link de volta pro pedido
}

/**
 * E-mail enviado ao fornecedor (com cópia interna) quando o aprovador
 * APROVA a solicitação de encerramento de saldo. Confirma que o saldo
 * foi cancelado e está de volta ao teto do contrato.
 */
export function templateEncerramentoSaldoAprovado(
  input: EncerramentoSaldoAprovadoEmailInput,
): { subject: string; html: string; text: string } {
  const fip = input.numero_pedido_fip != null
    ? `FIP-${String(input.numero_pedido_fip).padStart(4, '0')}`
    : 'FIP-—'

  const subject = `[FIP-WAVE] Encerramento aprovado — Pedido ${fip}`

  const dataFmt = (() => {
    try {
      return new Date(input.decidido_em).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch { return input.decidido_em }
  })()

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#0f172a;">
  <div style="max-width:680px;margin:0 auto;padding:24px;">

    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">

      <!-- Header -->
      <div style="background:#166534;color:#ffffff;padding:24px;">
        <h1 style="margin:0;font-size:20px;">Encerramento de saldo aprovado</h1>
        <p style="margin:6px 0 0;font-size:13px;opacity:0.9;">${fip} · ${escapeHtml(input.contrato_numero)}</p>
      </div>

      <!-- Saudação -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#0f172a;">
          ${escapeHtml(input.fornecedor_razao_social)},
        </p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
          Sua solicitação de encerramento do saldo do pedido <strong>${fip}</strong>
          foi <strong style="color:#166534;">APROVADA</strong>.
        </p>
      </div>

      <!-- 1. RESUMO -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">1. Resumo</h2>
        <table style="width:100%;font-size:14px;">
          <tr><td style="padding:6px 0;color:#64748b;">Valor do pedido</td><td style="padding:6px 0;text-align:right;font-weight:600;">${fmt(input.valor_pedido)}</td></tr>
          <tr style="border-top:2px solid #e5e7eb;"><td style="padding:8px 0;color:#0f172a;font-weight:700;">Saldo cancelado e devolvido ao teto</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#166534;">${fmt(input.saldo_cancelado)}</td></tr>
        </table>
        <p style="margin:14px 0 0;font-size:14px;line-height:1.6;color:#475569;">
          Esse valor agora está disponível pra novos pedidos de faturamento
          direto neste contrato.
        </p>
      </div>

      <!-- 2. MOTIVO ORIGINAL -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">2. Motivo da solicitação</h2>
        <blockquote style="margin:0;padding:12px 16px;background:#f8fafc;border-left:4px solid #166534;font-size:14px;line-height:1.6;color:#0f172a;font-style:italic;white-space:pre-wrap;">${escapeHtml(input.motivo_solicitacao)}</blockquote>
      </div>

      <!-- 3. CTA -->
      <div style="padding:24px;text-align:center;border-bottom:1px solid #e2e8f0;">
        <a href="${escapeHtml(input.url_pedido)}"
           style="display:inline-block;background:#166534;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
          Ver pedido →
        </a>
      </div>

      <!-- 4. DECISÃO -->
      <div style="padding:24px;">
        <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">
          Aprovado por <strong>${escapeHtml(input.decidido_por_nome)}</strong>
          em ${escapeHtml(dataFmt)}.
        </p>
      </div>

    </div>

    <p style="margin:16px 0 0;font-size:12px;color:#64748b;text-align:center;">
      Este é um e-mail automático de notificação interna da Obra WAVE.<br>
      Dúvidas? Responda este e-mail — sua mensagem vai pra gestão.
    </p>

  </div>
</body>
</html>`

  const text = [
    subject,
    '',
    `${input.fornecedor_razao_social},`,
    '',
    `Sua solicitação de encerramento do saldo do pedido ${fip} foi APROVADA.`,
    '',
    `1. RESUMO`,
    `   Valor do pedido:                    ${fmt(input.valor_pedido)}`,
    `   Saldo cancelado e devolvido ao teto: ${fmt(input.saldo_cancelado)}`,
    '',
    `Esse valor agora está disponível pra novos pedidos de faturamento direto neste contrato.`,
    '',
    `2. MOTIVO DA SOLICITAÇÃO`,
    `   "${input.motivo_solicitacao}"`,
    '',
    `Ver pedido: ${input.url_pedido}`,
    '',
    `Aprovado por ${input.decidido_por_nome} em ${dataFmt}.`,
    '',
    `— Gestão WAVE`,
  ].join('\n')

  return { subject, html, text }
}

// ============================================================
// Template: Encerramento de saldo REJEITADO (notifica fornecedor)
// ============================================================

export interface EncerramentoSaldoRejeitadoEmailInput {
  numero_pedido_fip: number | null
  contrato_numero: string
  fornecedor_razao_social: string
  saldo_solicitado: number
  motivo_rejeicao: string
  decidido_por_nome: string
  decidido_em: string
  url_pedido: string
}

/**
 * E-mail enviado ao fornecedor quando o aprovador REJEITA a solicitação
 * de encerramento de saldo. O saldo continua aberto, aguardando NF.
 */
export function templateEncerramentoSaldoRejeitado(
  input: EncerramentoSaldoRejeitadoEmailInput,
): { subject: string; html: string; text: string } {
  const fip = input.numero_pedido_fip != null
    ? `FIP-${String(input.numero_pedido_fip).padStart(4, '0')}`
    : 'FIP-—'

  const subject = `[FIP-WAVE] Encerramento REJEITADO — Pedido ${fip}`

  const dataFmt = (() => {
    try {
      return new Date(input.decidido_em).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch { return input.decidido_em }
  })()

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#0f172a;">
  <div style="max-width:680px;margin:0 auto;padding:24px;">

    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">

      <!-- Header -->
      <div style="background:#991b1b;color:#ffffff;padding:24px;">
        <h1 style="margin:0;font-size:20px;">Encerramento de saldo rejeitado</h1>
        <p style="margin:6px 0 0;font-size:13px;opacity:0.9;">${fip} · ${escapeHtml(input.contrato_numero)}</p>
      </div>

      <!-- Saudação -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#0f172a;">
          ${escapeHtml(input.fornecedor_razao_social)},
        </p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
          Sua solicitação de encerramento de saldo do pedido <strong>${fip}</strong>
          foi <strong style="color:#991b1b;">REJEITADA</strong> pelo aprovador.
        </p>
      </div>

      <!-- 1. SITUAÇÃO ATUAL -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;background:#fef2f2;">
        <p style="margin:0;font-size:14px;line-height:1.6;color:#991b1b;">
          O saldo de <strong>${fmt(input.saldo_solicitado)}</strong> continua
          <strong>aberto</strong>, aguardando NF.
        </p>
      </div>

      <!-- 2. MOTIVO DA REJEIÇÃO -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">2. Motivo da rejeição</h2>
        <blockquote style="margin:0;padding:12px 16px;background:#fef2f2;border-left:4px solid #991b1b;font-size:14px;line-height:1.6;color:#0f172a;font-style:italic;white-space:pre-wrap;">${escapeHtml(input.motivo_rejeicao)}</blockquote>
      </div>

      <!-- 3. CTA -->
      <div style="padding:24px;text-align:center;border-bottom:1px solid #e2e8f0;">
        <a href="${escapeHtml(input.url_pedido)}"
           style="display:inline-block;background:#991b1b;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
          Ver pedido →
        </a>
      </div>

      <!-- 4. DECISÃO -->
      <div style="padding:24px;">
        <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">
          Decidido por <strong>${escapeHtml(input.decidido_por_nome)}</strong>
          em ${escapeHtml(dataFmt)}.
        </p>
      </div>

    </div>

    <p style="margin:16px 0 0;font-size:12px;color:#64748b;text-align:center;">
      Este é um e-mail automático de notificação interna da Obra WAVE.<br>
      Dúvidas? Responda este e-mail — sua mensagem vai pra gestão.
    </p>

  </div>
</body>
</html>`

  const text = [
    subject,
    '',
    `${input.fornecedor_razao_social},`,
    '',
    `Sua solicitação de encerramento de saldo do pedido ${fip} foi REJEITADA pelo aprovador.`,
    '',
    `O saldo de ${fmt(input.saldo_solicitado)} continua ABERTO, aguardando NF.`,
    '',
    `MOTIVO DA REJEIÇÃO`,
    `   "${input.motivo_rejeicao}"`,
    '',
    `Ver pedido: ${input.url_pedido}`,
    '',
    `Decidido por ${input.decidido_por_nome} em ${dataFmt}.`,
    '',
    `— Gestão WAVE`,
  ].join('\n')

  return { subject, html, text }
}
