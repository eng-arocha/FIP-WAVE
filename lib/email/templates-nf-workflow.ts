/**
 * Templates de e-mail do workflow de aprovação de NF de faturamento direto.
 * Cada função recebe um payload e retorna { subject, html }.
 */

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

const fmtBRL = (v: number) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function layout(titulo: string, corpo: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/>
<title>${escapeHtml(titulo)}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;">
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:18px;">${escapeHtml(titulo)}</h2>
    ${corpo}
    <p style="margin-top:24px;font-size:12px;color:#94a3b8;">Gestão WAVE · FIP-WAVE</p>
  </div>
</body></html>`
}

export interface NfAguardandoPayload {
  numero_nf: string
  pedido_codigo: string
  valor: number
  lancado_por: string
}
/** Enviado aos aprovadores quando a contratada lança uma NF. */
export function templateNfAguardandoAprovacao(p: NfAguardandoPayload): { subject: string; html: string } {
  const subject = `NF ${p.numero_nf} aguardando aprovação — pedido ${p.pedido_codigo}`
  const html = layout('NF aguardando aprovação', `
    <p style="color:#334155;font-size:14px;line-height:1.6;">
      <strong>${escapeHtml(p.lancado_por)}</strong> lançou a NF
      <strong>${escapeHtml(p.numero_nf)}</strong> (${fmtBRL(p.valor)}) no pedido
      <strong>${escapeHtml(p.pedido_codigo)}</strong>. Acesse o sistema para aprovar
      ou rejeitar o lançamento.
    </p>`)
  return { subject, html }
}

export interface NfAprovadaPayload {
  numero_nf: string
  pedido_codigo: string
  valor: number
}
/** Enviado à contratada quando o contratante aprova a NF. */
export function templateNfAprovada(p: NfAprovadaPayload): { subject: string; html: string } {
  const subject = `NF ${p.numero_nf} aprovada — pedido ${p.pedido_codigo}`
  const html = layout('NF aprovada', `
    <p style="color:#334155;font-size:14px;line-height:1.6;">
      A NF <strong>${escapeHtml(p.numero_nf)}</strong> (${fmtBRL(p.valor)}) do pedido
      <strong>${escapeHtml(p.pedido_codigo)}</strong> foi <strong>aprovada</strong>.
    </p>`)
  return { subject, html }
}

export interface NfEmCorrecaoPayload {
  numero_nf: string
  pedido_codigo: string
  motivo: string
}
/** Enviado à contratada quando o contratante rejeita a NF para correção. */
export function templateNfEmCorrecao(p: NfEmCorrecaoPayload): { subject: string; html: string } {
  const subject = `NF ${p.numero_nf} precisa de correção — pedido ${p.pedido_codigo}`
  const html = layout('NF devolvida para correção', `
    <p style="color:#334155;font-size:14px;line-height:1.6;">
      A NF <strong>${escapeHtml(p.numero_nf)}</strong> do pedido
      <strong>${escapeHtml(p.pedido_codigo)}</strong> foi devolvida para correção.
    </p>
    <p style="background:#fef2f2;border-left:3px solid #ef4444;padding:10px 14px;
       color:#991b1b;font-size:14px;border-radius:4px;">
      <strong>Motivo:</strong> ${escapeHtml(p.motivo)}
    </p>
    <p style="color:#334155;font-size:14px;">Ajuste a NF no sistema e reenvie.</p>`)
  return { subject, html }
}
