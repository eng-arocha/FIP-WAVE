/**
 * Templates de email para alertas de pedidos fat-direto atrasados.
 *
 *  - Banner pós-NF (15 dias): pedido novo recebeu NF mas há pedidos
 *    aprovados antes dele ainda sem NF correspondente.
 *  - Relatório mensal (30 dias, em outro arquivo).
 */

const GESTOR_FIP_NOME = process.env.GESTOR_FIP_NOME || 'Leonardo'
const GESTOR_WAVE_ASSINATURA = 'Alex Rocha — Wave Instalações SPE Ltda'

function fmt(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}
function escapeHtml(s: string | null | undefined): string {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}
function fmtDateBR(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return String(d)
  return dt.toLocaleDateString('pt-BR')
}

export interface PedidoAtrasadoLinha {
  numero_pedido_fip: number | string
  data_aprovacao: string
  valor_total: number
  total_nfs: number
  saldo: number
  dias_decorridos: number
}

export interface PedidosAtrasadosPayload {
  numero_contrato: string
  periodo?: string
  dias_alerta: number
  numero_nf_recente: string
  numero_pedido_recente: number | string
  data_aprov_pedido_recente: string
  pedidos_atrasados: PedidoAtrasadoLinha[]
}

export function templatePedidosAtrasados(p: PedidosAtrasadosPayload): { subject: string; html: string } {
  const subject = `⚠ Pedido(s) anterior(es) com saldo pendente de NF — Contrato ${p.numero_contrato}`

  const linhas = p.pedidos_atrasados.map(l => `
    <tr>
      <td style="padding: 6px 12px; border: 1px solid #E5E7EB;">PED-${escapeHtml(String(l.numero_pedido_fip))}</td>
      <td style="text-align: right; padding: 6px 12px; border: 1px solid #E5E7EB;">${fmtDateBR(l.data_aprovacao)}</td>
      <td style="text-align: right; padding: 6px 12px; border: 1px solid #E5E7EB;">${fmt(l.valor_total)}</td>
      <td style="text-align: right; padding: 6px 12px; border: 1px solid #E5E7EB;">${fmt(l.total_nfs)}</td>
      <td style="text-align: right; padding: 6px 12px; border: 1px solid #E5E7EB; font-weight: bold; color: #B45309;">${fmt(l.saldo)}</td>
      <td style="text-align: right; padding: 6px 12px; border: 1px solid #E5E7EB;">${l.dias_decorridos} dias</td>
    </tr>
  `).join('')

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1F2937; line-height: 1.55; max-width: 760px; margin: 0 auto; padding: 24px;">

  <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 12px 16px; border-radius: 6px; margin-bottom: 24px;">
    <strong style="color: #92400E;">⚠ Pedidos anteriores com saldo pendente</strong>
  </div>

  <p>Prezado(a) <strong>${escapeHtml(GESTOR_FIP_NOME)}</strong>,</p>

  <p>Recebemos hoje a NF nº <strong>${escapeHtml(p.numero_nf_recente)}</strong> referente ao pedido <strong>PED-${escapeHtml(String(p.numero_pedido_recente))}</strong>, aprovado em <strong>${fmtDateBR(p.data_aprov_pedido_recente)}</strong>.</p>

  <p>Ao registrar esta NF, identificamos no sistema <strong>${p.pedidos_atrasados.length} pedido(s) aprovado(s) anteriormente a este e ainda sem NF lançada</strong> (parcial ou total), com saldo pendente há mais de <strong>${p.dias_alerta} dias</strong>:</p>

  <table style="border-collapse: collapse; width: 100%; max-width: 720px; font-size: 13px;">
    <thead>
      <tr style="background: #F3F4F6;">
        <th style="text-align: left;  padding: 8px 12px; border: 1px solid #E5E7EB;">Pedido</th>
        <th style="text-align: right; padding: 8px 12px; border: 1px solid #E5E7EB;">Aprovado em</th>
        <th style="text-align: right; padding: 8px 12px; border: 1px solid #E5E7EB;">Valor aprovado</th>
        <th style="text-align: right; padding: 8px 12px; border: 1px solid #E5E7EB;">NFs lançadas</th>
        <th style="text-align: right; padding: 8px 12px; border: 1px solid #E5E7EB;">Saldo pendente</th>
        <th style="text-align: right; padding: 8px 12px; border: 1px solid #E5E7EB;">Dias</th>
      </tr>
    </thead>
    <tbody>${linhas}</tbody>
  </table>

  <p style="margin-top: 16px;"><strong>Solicitamos formalmente:</strong></p>
  <ol style="padding-left: 24px;">
    <li><strong>Confirmação se há previsão de entrega</strong> dos materiais correspondentes a esses pedidos. Em caso afirmativo, pedimos a <strong>data atualizada por escrito</strong> para registro neste contrato.</li>
    <li><strong>Caso a entrega não se confirme</strong>, solicitamos que a FIP encaminhe o <strong>encerramento formal dos pedidos</strong> acima, com devolução do saldo, através do sistema FIP-Wave. Isso libera o teto de faturamento direto para outras compras previstas no contrato.</li>
    <li>Pedidos aprovados há mais de ${p.dias_alerta} dias sem NF correspondente <strong>distorcem o controle de saldo</strong> do contrato e podem comprometer a previsão de novas aprovações.</li>
  </ol>

  <p>Permanecemos à disposição para esclarecimentos.</p>

  <p style="margin-top: 32px;">Atenciosamente,<br>
    <strong>${escapeHtml(GESTOR_WAVE_ASSINATURA)}</strong><br>
    Contrato ${escapeHtml(p.numero_contrato)}${p.periodo ? ' · ' + escapeHtml(p.periodo) : ''}
  </p>

</body>
</html>`

  return { subject, html }
}
