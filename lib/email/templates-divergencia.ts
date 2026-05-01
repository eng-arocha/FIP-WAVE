/**
 * Templates de email para divergência de valor em NF de fat-direto:
 *  - Aviso (caminho B): NF aceita com pedido de cobertura emitido
 *  - Recusa (caminho C): NF recusada, pagamento direto da FIP exigido
 *
 * Sempre passam pelo email-preview pro gestor revisar antes do envio.
 */

const GESTOR_FIP_NOME = process.env.GESTOR_FIP_NOME || 'Leonardo'
const GESTOR_WAVE_ASSINATURA = 'Alex Rocha — Wave Instalações SPE Ltda'

function fmt(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function escapeHtml(s: string | null | undefined): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function fmtDateBR(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return String(d)
  return dt.toLocaleDateString('pt-BR')
}

// ============================================================
// CAMINHO B — Aviso de divergência aceita com pedido de cobertura
// ============================================================
export interface DivergenciaAvisoPayload {
  numero_contrato: string
  periodo?: string
  numero_nf: string
  data_emissao: string
  fornecedor: string
  valor_nf: number
  numero_pedido_original: number | string
  excedente: number
  numero_pedido_novo: number | string
  // saldos do teto fat-direto
  teto: number
  total_aprov_antes: number
  total_aprov_depois: number
  saldo_antes: number
  saldo_depois: number
}

export function templateDivergenciaAviso(p: DivergenciaAvisoPayload): { subject: string; html: string } {
  const subject = `⚠ Divergência de ${fmt(p.excedente)} na NF nº ${p.numero_nf} — pedido de cobertura emitido (Contrato ${p.numero_contrato})`

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1F2937; line-height: 1.55; max-width: 720px; margin: 0 auto; padding: 24px;">

  <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 12px 16px; border-radius: 6px; margin-bottom: 24px;">
    <strong style="color: #92400E;">⚠ Divergência detectada — pedido de cobertura emitido</strong>
  </div>

  <p>Prezado(a) <strong>${escapeHtml(GESTOR_FIP_NOME)}</strong>,</p>

  <p>Recebemos a NF nº <strong>${escapeHtml(p.numero_nf)}</strong> emitida em <strong>${fmtDateBR(p.data_emissao)}</strong> por <strong>${escapeHtml(p.fornecedor)}</strong>, no valor de <strong>${fmt(p.valor_nf)}</strong>.</p>

  <p>O valor desta NF excedeu em <strong style="color: #B45309;">${fmt(p.excedente)}</strong> o saldo do pedido <strong>PED-${escapeHtml(String(p.numero_pedido_original))}</strong>, vinculado a este contrato.</p>

  <p>Como há saldo disponível no teto de faturamento direto deste contrato, autorizamos a emissão de um pedido de cobertura: <strong>PED-${escapeHtml(String(p.numero_pedido_novo))}</strong>, no valor de <strong>${fmt(p.excedente)}</strong>, com a justificativa: <em>"Cobertura de divergência da NF nº ${escapeHtml(p.numero_nf)} sobre o pedido PED-${escapeHtml(String(p.numero_pedido_original))}"</em>.</p>

  <div style="background: #FEF2F2; border-left: 4px solid #EF4444; padding: 12px 16px; border-radius: 6px; margin: 16px 0;">
    <strong style="color: #991B1B;">Atenção — registro formal:</strong>
    <ul style="margin: 8px 0 0; padding-left: 20px;">
      <li>O controle de valores entre NFs e pedidos de faturamento direto <strong>deve ser rigoroso</strong> por parte da FIP. Cada divergência consome saldo de teto que estava reservado para outras compras previstas no contrato.</li>
      <li><strong>Em caso de nova divergência sem saldo de teto disponível, a NF será recusada e o pagamento deverá ser realizado diretamente pela FIP</strong>, com a medição do valor correspondente em orçamento condicionada à apresentação do comprovante de pagamento.</li>
    </ul>
  </div>

  <p><strong>Saldo do contrato após esta cobertura:</strong></p>
  <table style="border-collapse: collapse; width: 100%; max-width: 560px;">
    <thead>
      <tr style="background: #F3F4F6;">
        <th style="text-align: left;  padding: 8px 12px; border: 1px solid #E5E7EB;"></th>
        <th style="text-align: right; padding: 8px 12px; border: 1px solid #E5E7EB;">Antes</th>
        <th style="text-align: right; padding: 8px 12px; border: 1px solid #E5E7EB;">Depois</th>
      </tr>
    </thead>
    <tbody>
      <tr><td style="padding: 8px 12px; border: 1px solid #E5E7EB;">Teto fat-direto</td><td style="text-align: right; padding: 8px 12px; border: 1px solid #E5E7EB;">${fmt(p.teto)}</td><td style="text-align: right; padding: 8px 12px; border: 1px solid #E5E7EB;">${fmt(p.teto)}</td></tr>
      <tr><td style="padding: 8px 12px; border: 1px solid #E5E7EB;">Total aprovado</td><td style="text-align: right; padding: 8px 12px; border: 1px solid #E5E7EB;">${fmt(p.total_aprov_antes)}</td><td style="text-align: right; padding: 8px 12px; border: 1px solid #E5E7EB;">${fmt(p.total_aprov_depois)}</td></tr>
      <tr><td style="padding: 8px 12px; border: 1px solid #E5E7EB;">Saldo restante</td><td style="text-align: right; padding: 8px 12px; border: 1px solid #E5E7EB;">${fmt(p.saldo_antes)}</td><td style="text-align: right; padding: 8px 12px; border: 1px solid #E5E7EB; font-weight: bold; color: ${p.saldo_depois < 0 ? '#EF4444' : '#10B981'};">${fmt(p.saldo_depois)}</td></tr>
    </tbody>
  </table>

  <p style="margin-top: 24px;">Solicitamos a confirmação do recebimento desta comunicação.</p>

  <p style="margin-top: 32px;">Atenciosamente,<br>
    <strong>${escapeHtml(GESTOR_WAVE_ASSINATURA)}</strong><br>
    Contrato ${escapeHtml(p.numero_contrato)}${p.periodo ? ' · ' + escapeHtml(p.periodo) : ''}
  </p>

</body>
</html>`

  return { subject, html }
}

// ============================================================
// CAMINHO C — Recusa de NF por divergência sem saldo de teto
// ============================================================
export interface DivergenciaRecusaPayload {
  numero_contrato: string
  periodo?: string
  numero_nf: string
  data_emissao: string
  fornecedor: string
  cnpj_emitente?: string | null
  valor_nf: number
  numero_pedido_original: number | string
  saldo_pedido: number
  excedente: number
  tolerancia: number
  saldo_teto: number
  arquivo_url?: string | null
}

export function templateDivergenciaRecusa(p: DivergenciaRecusaPayload): { subject: string; html: string } {
  const subject = `❌ NF nº ${p.numero_nf} RECUSADA — pagamento direto pela FIP (Contrato ${p.numero_contrato})`

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1F2937; line-height: 1.55; max-width: 720px; margin: 0 auto; padding: 24px;">

  <div style="background: #FEE2E2; border-left: 4px solid #EF4444; padding: 12px 16px; border-radius: 6px; margin-bottom: 24px;">
    <strong style="color: #991B1B;">❌ NF recusada — pagamento direto pela FIP</strong>
  </div>

  <p>Prezado(a) <strong>${escapeHtml(GESTOR_FIP_NOME)}</strong>,</p>

  <p>Comunicamos formalmente que a NF abaixo, recebida para faturamento direto neste contrato, <strong>foi recusada</strong> pelo sistema FIP-Wave por exceder o saldo do pedido vinculado e por não haver saldo de teto disponível para emissão de pedido de cobertura. ${p.arquivo_url ? 'A NF original segue <strong>em anexo</strong>.' : ''}</p>

  <p><strong>Dados da NF recusada:</strong></p>
  <table style="border-collapse: collapse; width: 100%; max-width: 560px;">
    <tbody>
      <tr><td style="padding: 6px 12px; border: 1px solid #E5E7EB;">Número</td><td style="padding: 6px 12px; border: 1px solid #E5E7EB; font-weight: bold;">${escapeHtml(p.numero_nf)}</td></tr>
      <tr><td style="padding: 6px 12px; border: 1px solid #E5E7EB;">Emitente</td><td style="padding: 6px 12px; border: 1px solid #E5E7EB;">${escapeHtml(p.fornecedor)}${p.cnpj_emitente ? ' (CNPJ ' + escapeHtml(p.cnpj_emitente) + ')' : ''}</td></tr>
      <tr><td style="padding: 6px 12px; border: 1px solid #E5E7EB;">Data de emissão</td><td style="padding: 6px 12px; border: 1px solid #E5E7EB;">${fmtDateBR(p.data_emissao)}</td></tr>
      <tr><td style="padding: 6px 12px; border: 1px solid #E5E7EB;">Valor da NF</td><td style="padding: 6px 12px; border: 1px solid #E5E7EB; font-weight: bold;">${fmt(p.valor_nf)}</td></tr>
      <tr><td style="padding: 6px 12px; border: 1px solid #E5E7EB;">Pedido vinculado</td><td style="padding: 6px 12px; border: 1px solid #E5E7EB;">PED-${escapeHtml(String(p.numero_pedido_original))}</td></tr>
      <tr><td style="padding: 6px 12px; border: 1px solid #E5E7EB;">Saldo do pedido</td><td style="padding: 6px 12px; border: 1px solid #E5E7EB;">${fmt(p.saldo_pedido)}</td></tr>
      <tr><td style="padding: 6px 12px; border: 1px solid #E5E7EB;">Excedente</td><td style="padding: 6px 12px; border: 1px solid #E5E7EB; font-weight: bold; color: #B91C1C;">${fmt(p.excedente)}</td></tr>
      <tr><td style="padding: 6px 12px; border: 1px solid #E5E7EB;">Tolerância configurada</td><td style="padding: 6px 12px; border: 1px solid #E5E7EB;">${fmt(p.tolerancia)}</td></tr>
      <tr><td style="padding: 6px 12px; border: 1px solid #E5E7EB;">Saldo de teto disponível</td><td style="padding: 6px 12px; border: 1px solid #E5E7EB; font-weight: bold; color: #B91C1C;">${fmt(p.saldo_teto)} (insuficiente)</td></tr>
    </tbody>
  </table>

  <p style="margin-top: 16px;"><strong>Procedimento obrigatório:</strong></p>
  <ol style="padding-left: 24px;">
    <li><strong>O pagamento desta NF deve ser realizado diretamente pela FIP Engenharia Elétrica Ltda</strong> (CNPJ 26.736.376/0001-52), sem reembolso por meio do faturamento direto deste contrato.</li>
    <li><strong>A medição do valor correspondente em orçamento</strong> (parcela de material efetivamente executada) <strong>somente será realizada após a apresentação tácita do comprovante de pagamento desta NF</strong>, anexado ao sistema FIP-Wave na ficha da NF recusada.</li>
    <li>A FIP permanece integralmente responsável pelo cumprimento desta NF perante o fornecedor e pelo arquivamento dos respectivos comprovantes para fins de auditoria contratual.</li>
    <li>Recomendamos revisão imediata do controle interno de NFs e pedidos de faturamento direto, para evitar reincidência. Divergências consecutivas sem saldo de cobertura podem implicar suspensão temporária do faturamento direto neste contrato.</li>
  </ol>

  <p>Permanecemos à disposição para esclarecimentos.</p>

  <p style="margin-top: 32px;">Atenciosamente,<br>
    <strong>${escapeHtml(GESTOR_WAVE_ASSINATURA)}</strong><br>
    Contrato ${escapeHtml(p.numero_contrato)}${p.periodo ? ' · ' + escapeHtml(p.periodo) : ''}
  </p>

  ${p.arquivo_url ? `<p style="margin-top: 24px; color: #6B7280; font-size: 12px;">Anexo: <a href="${escapeHtml(p.arquivo_url)}">${escapeHtml(p.numero_nf)}.pdf</a></p>` : ''}

</body>
</html>`

  return { subject, html }
}
