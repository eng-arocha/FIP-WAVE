import { Medicao, Contrato } from '@/types'
import { formatCurrency, formatDatetime } from '@/lib/utils'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

interface EmailTemplate {
  subject: string
  html: string
}

export function templateNovaMedicao(medicao: Medicao, contrato: Contrato): EmailTemplate {
  return {
    subject: `[FIP-WAVE] Nova Medição #${String(medicao.numero).padStart(3, '0')} - ${contrato.descricao}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px;">
        <div style="background: #1e3a5f; color: white; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">FIP-WAVE | Controle de Medições</h1>
          <p style="margin: 4px 0 0; opacity: 0.8; font-size: 14px;">Nova solicitação de medição aguardando aprovação</p>
        </div>
        <div style="background: white; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb;">
          <h2 style="color: #1e3a5f; margin-top: 0;">Medição #${String(medicao.numero).padStart(3, '0')}</h2>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Contrato</td>
              <td style="padding: 8px 0; font-weight: 600; font-size: 14px;">${contrato.numero} - ${contrato.descricao}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Período</td>
              <td style="padding: 8px 0; font-weight: 600; font-size: 14px;">${medicao.periodo_referencia}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Valor Solicitado</td>
              <td style="padding: 8px 0; font-weight: 700; font-size: 16px; color: #1e3a5f;">${formatCurrency(medicao.valor_total)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Solicitante</td>
              <td style="padding: 8px 0; font-size: 14px;">${medicao.solicitante_nome}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Data/Hora</td>
              <td style="padding: 8px 0; font-size: 14px;">${formatDatetime(medicao.data_submissao || medicao.created_at)}</td>
            </tr>
          </table>
          ${medicao.observacoes ? `<div style="background: #f9fafb; padding: 12px; border-radius: 6px; margin: 16px 0;"><p style="margin: 0; font-size: 14px; color: #374151;"><strong>Observações:</strong> ${medicao.observacoes}</p></div>` : ''}
          <div style="margin-top: 24px; text-align: center;">
            <a href="${BASE_URL}/contratos/${contrato.id}/medicoes/${medicao.id}"
               style="background: #1e3a5f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
              Analisar e Aprovar Medição
            </a>
          </div>
        </div>
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">FIP-WAVE · Sistema de Controle de Medições</p>
      </div>
    `,
  }
}

export function templateMedicaoAprovada(medicao: Medicao, contrato: Contrato, comentario?: string): EmailTemplate {
  return {
    subject: `[FIP-WAVE] ✅ Medição #${String(medicao.numero).padStart(3, '0')} APROVADA - ${contrato.descricao}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px;">
        <div style="background: #166534; color: white; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">✅ Medição Aprovada</h1>
          <p style="margin: 4px 0 0; opacity: 0.8; font-size: 14px;">Sua medição foi analisada e aprovada</p>
        </div>
        <div style="background: white; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb;">
          <h2 style="color: #166534; margin-top: 0;">Medição #${String(medicao.numero).padStart(3, '0')} - Aprovada</h2>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Contrato</td>
              <td style="padding: 8px 0; font-weight: 600; font-size: 14px;">${contrato.numero}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Valor Aprovado</td>
              <td style="padding: 8px 0; font-weight: 700; font-size: 18px; color: #166534;">${formatCurrency(medicao.valor_total)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Data Aprovação</td>
              <td style="padding: 8px 0; font-size: 14px;">${formatDatetime(medicao.data_aprovacao || new Date().toISOString())}</td>
            </tr>
          </table>
          ${comentario ? `<div style="background: #f0fdf4; padding: 12px; border-radius: 6px; border-left: 4px solid #166534; margin: 16px 0;"><p style="margin: 0; font-size: 14px; color: #374151;"><strong>Comentário do aprovador:</strong> ${comentario}</p></div>` : ''}
          <div style="margin-top: 24px; text-align: center;">
            <a href="${BASE_URL}/contratos/${contrato.id}/medicoes/${medicao.id}"
               style="background: #166534; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
              Ver Comprovante
            </a>
          </div>
        </div>
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">FIP-WAVE · Sistema de Controle de Medições</p>
      </div>
    `,
  }
}

export function templateMedicaoRejeitada(medicao: Medicao, contrato: Contrato, motivo: string): EmailTemplate {
  return {
    subject: `[FIP-WAVE] ❌ Medição #${String(medicao.numero).padStart(3, '0')} REJEITADA - ${contrato.descricao}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px;">
        <div style="background: #991b1b; color: white; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">❌ Medição Rejeitada</h1>
          <p style="margin: 4px 0 0; opacity: 0.8; font-size: 14px;">Sua medição requer ajustes</p>
        </div>
        <div style="background: white; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb;">
          <h2 style="color: #991b1b; margin-top: 0;">Medição #${String(medicao.numero).padStart(3, '0')} - Rejeitada</h2>
          <div style="background: #fef2f2; padding: 16px; border-radius: 6px; border-left: 4px solid #991b1b; margin: 16px 0;">
            <p style="margin: 0 0 4px; font-size: 12px; color: #991b1b; font-weight: 600; text-transform: uppercase;">Motivo da Rejeição</p>
            <p style="margin: 0; font-size: 14px; color: #374151;">${motivo}</p>
          </div>
          <p style="font-size: 14px; color: #6b7280;">Corrija os itens indicados e resubmeta a medição para aprovação.</p>
          <div style="margin-top: 24px; text-align: center;">
            <a href="${BASE_URL}/contratos/${contrato.id}/medicoes/${medicao.id}"
               style="background: #991b1b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
              Ver Detalhes
            </a>
          </div>
        </div>
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">FIP-WAVE · Sistema de Controle de Medições</p>
      </div>
    `,
  }
}
