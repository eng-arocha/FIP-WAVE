/**
 * Template de email do RELATÓRIO MENSAL de pedidos fat-direto
 * com saldo pendente há mais de 30 dias.
 *
 * Tom escala conforme `sequencia_cobranca`:
 *   1 = primeira cobrança (informativo/firme)
 *   2 = reincidência (mais firme, cita histórico)
 *   3+ = risco contratual (alerta de suspensão)
 */

const GESTOR_FIP_NOME = process.env.GESTOR_FIP_NOME || 'Leonardo'
const GESTOR_WAVE_ASSINATURA = 'Alex Rocha — Wave Instalações SPE Ltda'

const MES_NOMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

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

export interface RelatorioMensalPayload {
  numero_contrato: string
  ano: number
  mes: number
  sequencia_cobranca: number
  qtd_pedidos: number
  valor_total_atrasado: number
  pedidos: Array<{
    numero_pedido_fip: number | string
    data_aprovacao: string
    valor_total: number
    total_nfs: number
    saldo: number
    dias_decorridos: number
  }>
}

export function templateRelatorioMensal(p: RelatorioMensalPayload): { subject: string; html: string } {
  const mesNome = MES_NOMES[p.mes - 1] || ''

  // Tom escalado por sequencia_cobranca
  let prefixo: string
  let bannerCor: string
  let bannerBg: string
  let bannerBorda: string
  let textoIntro: string
  let textoEscalada: string

  if (p.sequencia_cobranca === 1) {
    prefixo = '📋'
    bannerCor = '#1D4ED8'
    bannerBg = '#EFF6FF'
    bannerBorda = '#3B82F6'
    textoIntro = 'Encaminhamos o relatório mensal dos pedidos de faturamento direto deste contrato com saldo pendente há mais de 30 dias.'
    textoEscalada = ''
  } else if (p.sequencia_cobranca === 2) {
    prefixo = '⚠'
    bannerCor = '#92400E'
    bannerBg = '#FEF3C7'
    bannerBorda = '#F59E0B'
    textoIntro = 'Encaminhamos o relatório mensal dos pedidos de faturamento direto deste contrato com saldo pendente há mais de 30 dias. <strong>Esta é a 2ª cobrança recorrente</strong> — alguns dos pedidos abaixo já constaram em relatório anterior.'
    textoEscalada = '<p style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 8px 12px; margin: 12px 0; border-radius: 4px;"><strong style="color: #92400E;">Atenção:</strong> a recorrência destes pedidos sem regularização pode comprometer o controle financeiro do contrato. Solicitamos retorno em até <strong>5 dias úteis</strong>.</p>'
  } else {
    prefixo = '🚨'
    bannerCor = '#991B1B'
    bannerBg = '#FEE2E2'
    bannerBorda = '#EF4444'
    textoIntro = `Encaminhamos o relatório mensal dos pedidos de faturamento direto deste contrato com saldo pendente há mais de 30 dias. <strong>Esta é a ${p.sequencia_cobranca}ª cobrança consecutiva</strong> — pedidos abaixo permanecem sem NF correspondente em sucessivos meses.`
    textoEscalada = '<p style="background: #FEE2E2; border-left: 4px solid #EF4444; padding: 8px 12px; margin: 12px 0; border-radius: 4px;"><strong style="color: #991B1B;">Risco contratual:</strong> a permanência destes pedidos sem regularização pode implicar <strong>suspensão temporária do faturamento direto</strong> neste contrato e revisão das condições de aprovação de novos pedidos. Solicitamos manifestação formal em até <strong>3 dias úteis</strong>.</p>'
  }

  const subject = `${prefixo} Relatório mensal · pedidos fat-direto > 30 dias (${mesNome}/${p.ano}) — Contrato ${p.numero_contrato}`

  const linhas = p.pedidos.map(l => `
    <tr>
      <td style="padding: 6px 12px; border: 1px solid #E5E7EB;">PED-${escapeHtml(String(l.numero_pedido_fip))}</td>
      <td style="text-align: right; padding: 6px 12px; border: 1px solid #E5E7EB;">${fmtDateBR(l.data_aprovacao)}</td>
      <td style="text-align: right; padding: 6px 12px; border: 1px solid #E5E7EB;">${fmt(l.valor_total)}</td>
      <td style="text-align: right; padding: 6px 12px; border: 1px solid #E5E7EB;">${fmt(l.total_nfs)}</td>
      <td style="text-align: right; padding: 6px 12px; border: 1px solid #E5E7EB; font-weight: bold; color: ${bannerCor};">${fmt(l.saldo)}</td>
      <td style="text-align: right; padding: 6px 12px; border: 1px solid #E5E7EB;">${l.dias_decorridos} dias</td>
    </tr>
  `).join('')

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1F2937; line-height: 1.55; max-width: 760px; margin: 0 auto; padding: 24px;">

  <div style="background: ${bannerBg}; border-left: 4px solid ${bannerBorda}; padding: 12px 16px; border-radius: 6px; margin-bottom: 24px;">
    <strong style="color: ${bannerCor};">${prefixo} Relatório mensal · ${escapeHtml(mesNome)}/${p.ano} · ${p.sequencia_cobranca}ª cobrança</strong>
  </div>

  <p>Prezado(a) <strong>${escapeHtml(GESTOR_FIP_NOME)}</strong>,</p>

  <p>${textoIntro}</p>

  <p><strong>Resumo:</strong> ${p.qtd_pedidos} pedido(s) · valor total comprometido sem NF: <strong style="color: ${bannerCor};">${fmt(p.valor_total_atrasado)}</strong></p>

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

  ${textoEscalada}

  <p style="margin-top: 16px;"><strong>Solicitamos formalmente:</strong></p>
  <ol style="padding-left: 24px;">
    <li><strong>Confirmação por escrito</strong> da previsão atualizada de entrega de cada pedido listado.</li>
    <li>Para pedidos sem previsão concreta de entrega, solicitamos o <strong>encerramento formal no sistema FIP-Wave</strong> (com devolução do saldo), liberando o teto de faturamento direto pra outras compras do contrato.</li>
    <li>Pedimos retorno consolidado por email referente a todos os pedidos acima.</li>
  </ol>

  <p>Permanecemos à disposição para esclarecimentos.</p>

  <p style="margin-top: 32px;">Atenciosamente,<br>
    <strong>${escapeHtml(GESTOR_WAVE_ASSINATURA)}</strong><br>
    Contrato ${escapeHtml(p.numero_contrato)} · Relatório de ${escapeHtml(mesNome)}/${p.ano}
  </p>

</body>
</html>`

  return { subject, html }
}
