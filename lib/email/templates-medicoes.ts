/**
 * Templates de email para o fluxo de medições (serviços).
 *
 * Distinto de templates-fat-direto.ts (material direto) — aqui é a liberação
 * pra emissão de NF de serviços, com bloco financeiro consolidado da obra
 * (acumulado + período + retenção contratual).
 */

const CONTRATANTE = {
  razaoSocial: 'WAVE',
  cnpj: '50.682.110/0001-59',
  endereco: 'Avenida Beira Mar, n.º 1696, Meireles, Fortaleza, Ceará, CEP 60.165-120',
}
const CONTRATADO = {
  razaoSocial: 'FIP ENGENHARIA ELETRICA LTDA',
  cnpj: '26.736.376/0001-52',
  endereco: 'Rua Antônio Gentil, n.º 1660, Sapiranga, Fortaleza, Ceará, CEP 60.833-695',
}
const OBRA = {
  prazoMinDias: 20,
  gestorCargo: 'Gestor de Obras (autorizador)',
  gestorNome: 'Alex Rocha',
  contatoLocalNome: 'Batista (Almoxarife WAVE)',
  contatoLocalTel: '(85) 98757-6240',
}

function fmt(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

function pctFmt(v: number, casas = 2): string {
  if (!Number.isFinite(v)) return '—'
  return `${v.toFixed(casas).replace('.', ',')}%`
}

function dateFmt(iso: string | null | undefined): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('pt-BR') } catch { return '—' }
}

function maskCnpj(v: string | null | undefined): string {
  const d = String(v || '').replace(/\D/g, '')
  if (d.length !== 14) return v || ''
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`
}

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// ============================================================
// Payload do template
// ============================================================

export interface ItemMedido {
  codigo?: string | null
  descricao: string
  qtde?: number | string | null
  valor_total: number
}

export interface LiberacaoMedicaoPayload {
  numero_medicao: number
  periodo_referencia: string  // YYYY-MM
  data_aprovacao: string      // ISO
  contrato_numero: string | null

  /** Itens da medição (código + descrição + qtde + valor) */
  itens: ItemMedido[]
  observacoes?: string | null

  /** Resumo financeiro consolidado */
  resumo: {
    contrato: {
      valor_total: number
      valor_servicos: number
      valor_material_direto: number
      percentual_retencao: number
    }
    servicos: {
      esta_medicao: number
      acumulado: number
      pct_limite: number
      pct_contrato: number
      saldo: number
    }
    material: {
      nfs_recebidas_acumulado: number
      nfs_recebidas_periodo: number
      aprovado_acumulado: number
      aprovado_periodo: number
      pct_recebidas_limite: number
      pct_aprovado_limite: number
      saldo_aprovado: number
      saldo_recebido: number
    }
    periodo: {
      inicio: string | null
      fim: string
      eh_primeira_medicao: boolean
    }
    retencao: {
      valor: number
      percentual_aplicado: number
      material_correspondente: number
      servico_medido: number
      base_retencao: number
      andamento_fisico_pct: number
      liquido_a_pagar: number
    }
  }

  aprovador_nome?: string | null
  reenvio?: boolean
}

// ============================================================
// Template HTML
// ============================================================

export function templateLiberacaoMedicaoFornecedor(p: LiberacaoMedicaoPayload): {
  subject: string
  html: string
  text: string
} {
  const numFmt = String(p.numero_medicao).padStart(3, '0')
  const tag = `MED-${numFmt}`
  const prefixo = p.reenvio ? '[REENVIO] ' : ''
  // valorMedicao usado em totais e header — pega o SERVIÇO MEDIDO (que é o
  // que entra na NF do fornecedor), não o total mat+serv.
  const valorMedicao = p.resumo.retencao.servico_medido || p.resumo.servicos.esta_medicao
  const subject = `${prefixo}[${tag}] Medição aprovada — emita NF de ${fmt(valorMedicao)}`

  const itensHtml = p.itens.map(it => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
        ${it.codigo ? `<span style="font-family:ui-monospace,monospace;background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:11px;margin-right:6px;">${escapeHtml(it.codigo)}</span>` : ''}
        ${escapeHtml(it.descricao)}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${it.qtde ?? ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${fmt(Number(it.valor_total || 0))}</td>
    </tr>
  `).join('')

  const reenvioBadge = p.reenvio ? `
    <div style="background:#fef3c7;border:1px solid #f59e0b;color:#92400e;padding:10px 16px;border-radius:8px;margin-bottom:16px;font-size:13px;">
      <strong>Reenvio</strong> — este e-mail é um reenvio de uma liberação emitida anteriormente.
    </div>
  ` : ''

  // Bloco financeiro: tira coluna "Período" se primeira medição
  const ehPrimeira = p.resumo.periodo.eh_primeira_medicao
  const periodoLabel = ehPrimeira
    ? 'desde o início da obra'
    : `${dateFmt(p.resumo.periodo.inicio)} → ${dateFmt(p.resumo.periodo.fim)}`

  const colunasResumo = ehPrimeira
    ? `
      <th style="padding:8px 12px;text-align:left;font-weight:600;color:#64748b;border-bottom:1px solid #e5e7eb;">Categoria</th>
      <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:1px solid #e5e7eb;">Acumulado</th>
      <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:1px solid #e5e7eb;">Saldo</th>
      <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:1px solid #e5e7eb;">% / Limite</th>
    `
    : `
      <th style="padding:8px 12px;text-align:left;font-weight:600;color:#64748b;border-bottom:1px solid #e5e7eb;">Categoria</th>
      <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:1px solid #e5e7eb;">Período</th>
      <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:1px solid #e5e7eb;">Acumulado</th>
      <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:1px solid #e5e7eb;">Saldo</th>
      <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:1px solid #e5e7eb;">% / Limite</th>
    `

  const linhaResumo = (cat: string, periodoVal: number, acumVal: number, saldoVal: number, pct: number, limite: number, destaque?: string) => ehPrimeira
    ? `<tr ${destaque ? `style="background:${destaque};"` : ''}>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${cat}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${fmt(acumVal)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#475569;">${fmt(saldoVal)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#475569;font-size:12px;">${pctFmt(pct)} / ${fmt(limite)}</td>
      </tr>`
    : `<tr ${destaque ? `style="background:${destaque};"` : ''}>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${cat}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#475569;">${fmt(periodoVal)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${fmt(acumVal)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#475569;">${fmt(saldoVal)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#475569;font-size:12px;">${pctFmt(pct)} / ${fmt(limite)}</td>
      </tr>`

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#0f172a;">
  <div style="max-width:720px;margin:0 auto;padding:24px;">

    ${reenvioBadge}

    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">

      <!-- Header -->
      <div style="background:#0f766e;color:#ffffff;padding:24px;">
        <h1 style="margin:0;font-size:20px;">Medição aprovada — Liberação para emissão de NF</h1>
        <p style="margin:6px 0 0;font-size:13px;opacity:0.9;">${tag} · Período ${escapeHtml(p.periodo_referencia)} · Obra WAVE${p.contrato_numero ? ` · ${escapeHtml(p.contrato_numero)}` : ''}</p>
      </div>

      <!-- Saudação -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#0f172a;">
          Notificação interna da Obra WAVE
        </p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
          A medição <strong>${tag}</strong> referente ao período
          <strong>${escapeHtml(p.periodo_referencia)}</strong> foi
          <strong>${p.reenvio ? 'reenviada' : 'aprovada'}</strong> pela Gestão.
          O fornecedor (FIP Engenharia) está autorizado a emitir Nota Fiscal pelo
          <strong>valor integral medido</strong>.
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

      <!-- 3. RESUMO DA MEDIÇÃO + RETENÇÃO -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">3. Resumo desta medição</h2>
        <table style="width:100%;font-size:14px;">
          <tr><td style="padding:6px 0;color:#64748b;">Material correspondente medido</td><td style="padding:6px 0;text-align:right;">${fmt(p.resumo.retencao.material_correspondente)}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Serviço medido (NF a emitir)</td><td style="padding:6px 0;text-align:right;font-weight:700;font-size:16px;color:#0f766e;">${fmt(p.resumo.retencao.servico_medido)}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Base de retenção (mat + serv)</td><td style="padding:6px 0;text-align:right;color:#475569;">${fmt(p.resumo.retencao.base_retencao)}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Retenção contratual (${pctFmt(p.resumo.retencao.percentual_aplicado, 2)} sobre a base)</td><td style="padding:6px 0;text-align:right;color:#b91c1c;font-weight:600;">− ${fmt(p.resumo.retencao.valor)}</td></tr>
          <tr style="border-top:2px solid #e5e7eb;"><td style="padding:8px 0;color:#0f172a;font-weight:700;">Líquido a pagar (NF − retenção)</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#059669;">${fmt(p.resumo.retencao.liquido_a_pagar)}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Andamento físico desta medição</td><td style="padding:6px 0;text-align:right;">${pctFmt(p.resumo.retencao.andamento_fisico_pct)} do contrato</td></tr>
        </table>

        <!-- Aviso destacado -->
        <div style="margin-top:14px;background:#fffbeb;border:1px solid #f59e0b;color:#92400e;padding:12px 14px;border-radius:8px;font-size:13px;">
          <strong>⚠ Importante — emissão da NF</strong><br>
          A Nota Fiscal de serviço deve ser emitida pelo <strong>VALOR INTEGRAL</strong>
          (${fmt(p.resumo.retencao.servico_medido)}). A retenção de
          <strong>${fmt(p.resumo.retencao.valor)}</strong> (5% sobre material + serviço executados =
          ${fmt(p.resumo.retencao.base_retencao)}) será descontada pelo WAVE no momento do
          pagamento, <strong>conforme cláusulas contratuais</strong>. Não emita NF com valor
          líquido — pode causar divergência fiscal.
        </div>
      </div>

      <!-- 4. RESUMO FINANCEIRO DA OBRA -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;background:#f8fafc;">
        <h2 style="margin:0 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">4. Resumo financeiro da obra</h2>
        <p style="margin:0 0 12px;font-size:11px;color:#94a3b8;">
          ${ehPrimeira
            ? 'Primeira medição — período coincide com o início da obra.'
            : `Período: ${periodoLabel}`}
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;background:#ffffff;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#f1f5f9;">${colunasResumo}</tr>
          </thead>
          <tbody>
            ${linhaResumo('Serviços — esta medição', p.resumo.servicos.esta_medicao, p.resumo.servicos.esta_medicao, 0, 0, 0)}
            ${linhaResumo('Serviços — total medido', 0, p.resumo.servicos.acumulado, p.resumo.servicos.saldo, p.resumo.servicos.pct_limite, p.resumo.contrato.valor_servicos)}
            ${linhaResumo('Material — NFs recebidas', p.resumo.material.nfs_recebidas_periodo, p.resumo.material.nfs_recebidas_acumulado, p.resumo.material.saldo_recebido, p.resumo.material.pct_recebidas_limite, p.resumo.contrato.valor_material_direto)}
            ${linhaResumo('Material — aprovado FIP', p.resumo.material.aprovado_periodo, p.resumo.material.aprovado_acumulado, p.resumo.material.saldo_aprovado, p.resumo.material.pct_aprovado_limite, p.resumo.contrato.valor_material_direto)}
          </tbody>
        </table>
        <p style="margin:14px 0 0;font-size:14px;font-weight:600;color:#0f172a;">
          Andamento físico acumulado:
          <span style="color:#0f766e;">${pctFmt(p.resumo.servicos.pct_contrato)}</span>
          do contrato (${fmt(p.resumo.contrato.valor_total)})
        </p>
      </div>

      <!-- 5. ITENS MEDIDOS -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">5. Itens medidos</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:8px 12px;text-align:left;font-weight:600;color:#64748b;border-bottom:1px solid #e5e7eb;">Descrição</th>
              <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:1px solid #e5e7eb;">Qtde</th>
              <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:1px solid #e5e7eb;">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${itensHtml || `<tr><td colspan="3" style="padding:12px;text-align:center;color:#64748b;">Nenhum item listado.</td></tr>`}
            <tr style="background:#f0fdf4;">
              <td colspan="2" style="padding:10px 12px;font-weight:700;border-top:2px solid #d1d5db;">TOTAL MEDIDO</td>
              <td style="padding:10px 12px;text-align:right;font-weight:700;color:#059669;border-top:2px solid #d1d5db;">${fmt(valorMedicao)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 6. CONDIÇÕES DE RECEBIMENTO -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">6. Condições obrigatórias de recebimento</h2>
        <ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.8;color:#475569;">
          <li>NF emitida pelo <strong>valor integral medido</strong> (não líquido).</li>
          <li>Boleto anexado à NF com prazo vigente.</li>
          <li>Prazo mínimo de pagamento: <strong>${OBRA.prazoMinDias} dias</strong>.</li>
          <li>Retenção de garantia descontada no momento do pagamento, conforme cláusulas contratuais.</li>
        </ul>
      </div>

      <!-- 7. RESPONSÁVEIS -->
      <div style="padding:24px;${p.observacoes ? 'border-bottom:1px solid #e2e8f0;' : ''}">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">7. Responsáveis</h2>
        <table style="width:100%;font-size:14px;">
          <tr><td style="padding:4px 0;color:#64748b;width:240px;">${OBRA.gestorCargo}</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(p.aprovador_nome || OBRA.gestorNome)}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;vertical-align:top;">Contato local (recebimento)</td><td style="padding:4px 0;">${escapeHtml(OBRA.contatoLocalNome)}<br><span style="color:#475569;font-size:13px;">${escapeHtml(OBRA.contatoLocalTel)}</span></td></tr>
        </table>
      </div>

      ${p.observacoes ? `
      <!-- 8. OBSERVAÇÕES -->
      <div style="padding:24px;">
        <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">8. Observações</h2>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;white-space:pre-wrap;">${escapeHtml(p.observacoes)}</p>
      </div>
      ` : ''}

    </div>

    <p style="margin:16px 0 0;font-size:12px;color:#64748b;text-align:center;">
      Este é um e-mail automático de notificação interna da Obra WAVE.<br>
      Dúvidas? Responda este e-mail — sua mensagem vai pra gestão.
    </p>

  </div>
</body>
</html>`

  // Versão texto (fallback pra clientes sem HTML)
  const text = [
    subject,
    '',
    `Medição ${tag} — Período ${p.periodo_referencia} — Obra WAVE`,
    '',
    `RESUMO DA MEDIÇÃO`,
    `  Material correspondente:    ${fmt(p.resumo.retencao.material_correspondente)}`,
    `  Serviço medido (NF a emitir): ${fmt(p.resumo.retencao.servico_medido)}`,
    `  Base de retenção:           ${fmt(p.resumo.retencao.base_retencao)}`,
    `  Retenção (${pctFmt(p.resumo.retencao.percentual_aplicado)}):           − ${fmt(p.resumo.retencao.valor)}`,
    `  Líquido a pagar:            ${fmt(p.resumo.retencao.liquido_a_pagar)}`,
    `  Andamento físico:           ${pctFmt(p.resumo.retencao.andamento_fisico_pct)} do contrato`,
    '',
    `⚠ NF emitida pelo VALOR INTEGRAL do serviço (${fmt(p.resumo.retencao.servico_medido)}).`,
    `   Retenção 5% sobre material + serviço executados, descontada no pagamento.`,
    '',
    `RESUMO FINANCEIRO DA OBRA (${ehPrimeira ? 'desde início' : periodoLabel})`,
    `  Serviços — esta medição:    ${fmt(p.resumo.servicos.esta_medicao)}`,
    `  Serviços — total medido:    ${fmt(p.resumo.servicos.acumulado)} (${pctFmt(p.resumo.servicos.pct_limite)} de ${fmt(p.resumo.contrato.valor_servicos)})`,
    `  Material — NFs recebidas:   ${fmt(p.resumo.material.nfs_recebidas_acumulado)} (${pctFmt(p.resumo.material.pct_recebidas_limite)} de ${fmt(p.resumo.contrato.valor_material_direto)})`,
    `  Material — aprovado FIP:    ${fmt(p.resumo.material.aprovado_acumulado)} (${pctFmt(p.resumo.material.pct_aprovado_limite)} de ${fmt(p.resumo.contrato.valor_material_direto)})`,
    `  Andamento físico acumulado: ${pctFmt(p.resumo.servicos.pct_contrato)} do contrato (${fmt(p.resumo.contrato.valor_total)})`,
    '',
    `ITENS MEDIDOS`,
    ...p.itens.map(it => `  - ${it.codigo ? `${it.codigo} ` : ''}${it.descricao}${it.qtde ? ` (qtde ${it.qtde})` : ''} — ${fmt(Number(it.valor_total || 0))}`),
    `  TOTAL: ${fmt(valorMedicao)}`,
    '',
    `CONDIÇÕES OBRIGATÓRIAS`,
    `  - NF emitida pelo valor integral`,
    `  - Boleto anexado com prazo vigente`,
    `  - Prazo mínimo de pagamento: ${OBRA.prazoMinDias} dias`,
    `  - Retenção descontada no pagamento`,
    '',
    p.observacoes ? `OBSERVAÇÕES\n  ${p.observacoes}\n` : '',
    `— Gestão WAVE`,
  ].filter(Boolean).join('\n')

  return { subject, html, text }
}
