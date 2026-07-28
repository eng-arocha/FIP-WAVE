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
// Empresa que efetivamente emite a NF de SERVIÇO (mão-de-obra) — distinta
// da CONTRATANTE (que é a construtora pagadora). Material vai pela
// CONTRATADO (FIP) via fat-direto.
const WAVE_SPE = {
  razaoSocial: 'WAVE INSTALACOES SPE LTDA',
  cnpj: '65.528.046/0001-23',
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
      /**
       * Valor da NF de serviço a emitir. É serviço − retenção − ajuste de
       * rateio; NÃO recalcular a partir das outras linhas, porque o ajuste
       * nem sempre existe.
       */
      liquido_a_pagar: number
      /**
       * Divergência de rateio material/serviço entre o orçamento do sistema e
       * o do ERP da FIP, sobre o mesmo total medido (migration 074). Já está
       * abatida em `liquido_a_pagar`. Zero quando não há divergência.
       */
      ajuste_material_anterior?: number
      ajuste_material_anterior_motivo?: string | null
    }
  }

  aprovador_nome?: string | null
  reenvio?: boolean

  /**
   * Itens cujo % de medição foi ajustado pelo aprovador porque o
   * fornecedor confirmou que não emitirá mais NF (saldo de pedido
   * aprovado considerado não-faturável). Quando vazio/undefined,
   * a seção destacada não aparece — mantém retrocompatibilidade.
   */
  itens_com_confirmacao_sem_nf?: Array<{
    codigo: string
    descricao: string
    pct_original: number  // %
    pct_ajustado: number  // %
    valor_retido_absorvido: number  // R$
    motivo: string
  }>

  /**
   * Valores de cada NF a emitir nesta medição. A NF de **material (FIP
   * fat-direto)** deve sair PRIMEIRO; só depois de lançada no Informakon
   * é que a NF de **serviço (Wave)** pode ser emitida pelo valor integral
   * — pra o serviço descontar as NFs de material que já estão no sistema.
   */
  nfs_a_emitir: {
    fip_material: { valor: number }   // soma de FIP Fat-Dir
    wave_servico: {
      /** Valor LÍQUIDO da NF (= bruto − débito da retenção). É o valor a faturar. */
      valor: number
      /** Bruto = soma de wave_servico das linhas. Antes do débito da retenção. */
      valor_bruto?: number
      /** Quanto foi descontado nesta NF como pagamento da retenção acumulada. */
      retencao?: number
    }
  }

  /**
   * Somatório de FIP Fat-Dir agrupado por grupo macro (1-19). Usado
   * pra orientar o lançamento do material no Informakon. Vazio quando
   * nenhum item tem fip_faturar > 0.
   */
  fip_por_grupo_macro?: Array<{ grupo: number; nome: string; valor: number }>

  /**
   * Ajustes de quantidade feitos pelo admin durante o fluxo de aprovação
   * (migration 061). Quando preenchido, renderiza um bloco destacado
   * listando o que mudou e por quê — solicitante toma ciência via email.
   */
  ajustes_admin?: Array<{
    codigo: string
    descricao: string
    quantidade_anterior: number
    quantidade_nova: number
    motivo: string
    ajustado_por_nome: string | null
    ajustado_em: string
  }>

  /**
   * Quando a aprovação criou automaticamente um rascunho de solicitação
   * fat-direto (porque ha fip_faturar > 0), passa o id e a URL aqui pra
   * incluir um link no bloco "Ordem obrigatoria de emissao das NFs"
   * orientando o admin a abrir, completar fornecedor/numero e submeter.
   */
  solicitacao_fat_direto_rascunho?: {
    id: string
    url: string
  }

  /** Idem, mas pra a NF Wave de serviço (valor LÍQUIDO já calculado). */
  solicitacao_wave_rascunho?: {
    id: string
    url: string
  }

  /** Detalhamento do livro-razão de retenção pra esta medição. */
  retencao_breakdown?: {
    saldo_antes: number
    credito: number
    debito: number
    saldo_depois: number
    wave_bruto: number
  }
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

  const fipTotal = p.nfs_a_emitir?.fip_material?.valor || 0
  const waveTotal = p.nfs_a_emitir?.wave_servico?.valor || valorMedicao
  const temFipMaterial = fipTotal > 0
  // Divergência de rateio material/serviço (migration 074). Não é retenção:
  // não volta a ser paga depois, só desloca valor de serviço para material.
  const ajusteRateio = Number(p.resumo.retencao.ajuste_material_anterior || 0)
  const motivoAjuste = p.resumo.retencao.ajuste_material_anterior_motivo || null
  const temAjustes = (p.ajustes_admin?.length ?? 0) > 0
  const sufixoAjustes = temAjustes ? ` (c/ ${p.ajustes_admin!.length} ajuste${p.ajustes_admin!.length > 1 ? 's' : ''} do admin)` : ''
  const subject = temFipMaterial
    ? `${prefixo}[${tag}] Medição aprovada${sufixoAjustes} — emita 2 NFs: FIP Material ${fmt(fipTotal)} + Wave Serviço ${fmt(waveTotal)}`
    : `${prefixo}[${tag}] Medição aprovada${sufixoAjustes} — emita NF Wave Serviço ${fmt(waveTotal)}`

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
          ${temFipMaterial
            ? 'Esta medição requer a emissão de <strong>2 Notas Fiscais</strong> em ordem obrigatória — veja o passo-a-passo abaixo.'
            : 'O fornecedor está autorizado a emitir a Nota Fiscal de serviço pelo <strong>valor LÍQUIDO</strong> (já com a retenção contratual descontada — veja "Resumo desta medição" abaixo).'}
        </p>
      </div>

      <!-- 0. ORDEM OBRIGATÓRIA DE EMISSÃO DAS NFs (só quando há FIP material) -->
      ${temFipMaterial ? `
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;background:#fff7ed;">
        <h2 style="margin:0 0 4px;font-size:14px;font-weight:700;color:#9a3412;text-transform:uppercase;letter-spacing:0.5px;">
          ⚠ Ordem obrigatória de emissão das NFs
        </h2>
        <p style="margin:0 0 14px;font-size:12px;color:#9a3412;line-height:1.6;">
          A NF de <strong>material (FIP fat-direto)</strong> precisa entrar
          <strong>primeiro</strong> no sistema Informakon. Só depois disso a
          NF de <strong>serviço (Wave)</strong> pode ser emitida pelo valor
          integral, com as NFs de material já lançadas sendo descontadas
          automaticamente no sistema.
        </p>

        <!-- Passo 1: NF FIP Material -->
        <div style="background:#ffffff;border:2px solid #f97316;border-radius:8px;padding:14px;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="background:#f97316;color:#ffffff;font-weight:700;font-size:13px;padding:3px 10px;border-radius:6px;">1º</span>
            <strong style="font-size:14px;color:#0f172a;">NF FIP — Material (fat-direto)</strong>
          </div>
          <table style="width:100%;font-size:13px;">
            <tr><td style="padding:3px 0;color:#64748b;width:140px;">Emissora</td><td style="padding:3px 0;font-weight:600;">${escapeHtml(CONTRATADO.razaoSocial)}</td></tr>
            <tr><td style="padding:3px 0;color:#64748b;">CNPJ</td><td style="padding:3px 0;font-family:ui-monospace,monospace;">${maskCnpj(CONTRATADO.cnpj)}</td></tr>
            <tr><td style="padding:3px 0;color:#64748b;">Valor da NF</td><td style="padding:3px 0;font-weight:700;font-size:16px;color:#ea580c;">${fmt(fipTotal)}</td></tr>
          </table>
          <p style="margin:8px 0 0;font-size:12px;color:#475569;">
            Lançar no Informakon antes da NF Wave. Detalhamento por grupo macro abaixo.
          </p>
          ${p.solicitacao_fat_direto_rascunho ? `
          <p style="margin:10px 0 0;font-size:13px;">
            <a href="${escapeHtml(p.solicitacao_fat_direto_rascunho.url)}"
               style="display:inline-block;padding:8px 14px;background:#f97316;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:12px;">
              📋 Abrir rascunho de solicitação fat-direto
            </a>
            <span style="color:#64748b;font-size:11px;margin-left:8px;">
              (já criado automaticamente — complete fornecedor/número e submeta)
            </span>
          </p>
          ` : ''}
        </div>

        <!-- Passo 2: NF Wave Serviço (LÍQUIDO) -->
        <div style="background:#ffffff;border:2px solid #0f766e;border-radius:8px;padding:14px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="background:#0f766e;color:#ffffff;font-weight:700;font-size:13px;padding:3px 10px;border-radius:6px;">2º</span>
            <strong style="font-size:14px;color:#0f172a;">NF Wave — Serviço (LÍQUIDA)</strong>
            <span style="font-size:11px;color:#64748b;font-style:italic;">(somente após o Passo 1)</span>
          </div>
          <table style="width:100%;font-size:13px;">
            <tr><td style="padding:3px 0;color:#64748b;width:140px;">Emissora</td><td style="padding:3px 0;font-weight:600;">${escapeHtml(WAVE_SPE.razaoSocial)}</td></tr>
            <tr><td style="padding:3px 0;color:#64748b;">CNPJ</td><td style="padding:3px 0;font-family:ui-monospace,monospace;">${maskCnpj(WAVE_SPE.cnpj)}</td></tr>
            ${p.retencao_breakdown ? `
            <tr><td style="padding:3px 0;color:#64748b;">Bruto (serviço medido)</td><td style="padding:3px 0;color:#64748b;">${fmt(p.retencao_breakdown.wave_bruto)}</td></tr>
            <tr><td style="padding:3px 0;color:#64748b;">Retenção descontada</td><td style="padding:3px 0;color:#b91c1c;">− ${fmt(p.retencao_breakdown.debito)}</td></tr>
            ` : ''}
            <tr><td style="padding:3px 0;color:#64748b;font-weight:600;border-top:1px solid #e5e7eb;">Valor LÍQUIDO da NF</td><td style="padding:3px 0;font-weight:700;font-size:16px;color:#0f766e;border-top:1px solid #e5e7eb;">${fmt(waveTotal)}</td></tr>
          </table>
          <p style="margin:8px 0 0;font-size:12px;color:#475569;">
            Emitir NF pelo <strong>valor LÍQUIDO acima</strong> (já com retenção descontada).
            ${p.solicitacao_wave_rascunho ? `Detalhamento e aprovação interna no <a href="${escapeHtml(p.solicitacao_wave_rascunho.url)}" style="color:#0f766e;font-weight:600;">rascunho criado automaticamente</a>.` : ''}
          </p>
        </div>

        ${p.retencao_breakdown ? `
        <!-- Caixa do livro-razão de retenção -->
        <div style="background:#fefce8;border:1px dashed #ca8a04;border-radius:8px;padding:12px;margin-top:10px;">
          <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#854d0e;">
            📒 Livro-razão de retenção contratual (5%)
          </p>
          <table style="width:100%;font-size:12px;color:#713f12;">
            <tr>
              <td style="padding:2px 0;width:50%;">Saldo antes desta medição</td>
              <td style="padding:2px 0;text-align:right;font-family:ui-monospace,monospace;">${fmt(p.retencao_breakdown.saldo_antes)}</td>
            </tr>
            <tr>
              <td style="padding:2px 0;">Crédito desta medição (5% × mat+serv)</td>
              <td style="padding:2px 0;text-align:right;font-family:ui-monospace,monospace;color:#15803d;">+ ${fmt(p.retencao_breakdown.credito)}</td>
            </tr>
            <tr>
              <td style="padding:2px 0;">Débito (descontado nesta NF Wave)</td>
              <td style="padding:2px 0;text-align:right;font-family:ui-monospace,monospace;color:#b91c1c;">− ${fmt(p.retencao_breakdown.debito)}</td>
            </tr>
            <tr style="border-top:1px solid #ca8a04;">
              <td style="padding:4px 0;font-weight:600;">Saldo depois</td>
              <td style="padding:4px 0;text-align:right;font-weight:700;font-family:ui-monospace,monospace;">${fmt(p.retencao_breakdown.saldo_depois)}</td>
            </tr>
          </table>
          <p style="margin:6px 0 0;font-size:11px;color:#854d0e;">
            ${p.retencao_breakdown.saldo_depois > 0
              ? `Saldo remanescente será abatido nas próximas NFs Wave ou pago ao final via NF de retenção.`
              : `Saldo zerado nesta medição. Próximas medições gerarão novos créditos.`}
          </p>
        </div>
        ` : ''}
      </div>

      <!-- 0b. RESUMO MATERIAL POR GRUPO MACRO -->
      ${(p.fip_por_grupo_macro && p.fip_por_grupo_macro.length > 0) ? `
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <h2 style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">
          Material FIP fat-direto · detalhamento por grupo macro
        </h2>
        <p style="margin:0 0 12px;font-size:12px;color:#94a3b8;">
          Use este resumo pra lançar a NF FIP de material no Informakon antes do Wave.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;background:#f8fafc;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="padding:8px 12px;text-align:left;font-weight:600;color:#64748b;border-bottom:1px solid #e5e7eb;width:60px;">Grupo</th>
              <th style="padding:8px 12px;text-align:left;font-weight:600;color:#64748b;border-bottom:1px solid #e5e7eb;">Categoria</th>
              <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:1px solid #e5e7eb;">FIP fat-direto</th>
            </tr>
          </thead>
          <tbody>
            ${p.fip_por_grupo_macro.map(g => `
              <tr>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:ui-monospace,monospace;font-weight:600;">${g.grupo}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(g.nome)}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${fmt(g.valor)}</td>
              </tr>
            `).join('')}
            <tr style="background:#fff7ed;">
              <td colspan="2" style="padding:10px 12px;font-weight:700;border-top:2px solid #fdba74;">TOTAL FIP MATERIAL</td>
              <td style="padding:10px 12px;text-align:right;font-weight:700;color:#ea580c;border-top:2px solid #fdba74;">${fmt(fipTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      ` : ''}
      ` : ''}

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
          <tr><td style="padding:6px 0;color:#64748b;">Serviço executado</td><td style="padding:6px 0;text-align:right;font-weight:700;font-size:16px;color:#0f766e;">${fmt(p.resumo.retencao.servico_medido)}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Base de retenção (mat + serv)</td><td style="padding:6px 0;text-align:right;color:#475569;">${fmt(p.resumo.retencao.base_retencao)}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Retenção contratual (${pctFmt(p.resumo.retencao.percentual_aplicado, 2)} sobre a base)</td><td style="padding:6px 0;text-align:right;color:#b91c1c;font-weight:600;">− ${fmt(p.resumo.retencao.valor)}</td></tr>
          ${ajusteRateio !== 0 ? `<tr><td style="padding:6px 0;color:#64748b;">Ajuste de rateio material/serviço</td><td style="padding:6px 0;text-align:right;color:${ajusteRateio > 0 ? '#b91c1c' : '#059669'};font-weight:600;">${ajusteRateio > 0 ? '−' : '+'} ${fmt(Math.abs(ajusteRateio))}</td></tr>` : ''}
          <tr style="border-top:2px solid #e5e7eb;"><td style="padding:8px 0;color:#0f172a;font-weight:700;">Líquido a pagar (NF a emitir)</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#059669;">${fmt(p.resumo.retencao.liquido_a_pagar)}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Andamento físico desta medição</td><td style="padding:6px 0;text-align:right;">${pctFmt(p.resumo.retencao.andamento_fisico_pct)} do contrato</td></tr>
        </table>

        <!-- Aviso destacado: como emitir cada NF -->
        <div style="margin-top:14px;background:#fffbeb;border:1px solid #f59e0b;color:#92400e;padding:12px 14px;border-radius:8px;font-size:13px;">
          <strong>⚠ Como emitir cada NF</strong>
          <ul style="margin:8px 0 0;padding-left:20px;line-height:1.6;">
            ${temFipMaterial
              ? `<li><strong>NF FIP material:</strong> emitir pelo valor integral (sem retenção).</li>`
              : ''}
            <li>
              <strong>NF Wave serviço:</strong> emitir pelo valor de
              <strong>${fmt(p.resumo.retencao.liquido_a_pagar)}</strong>${ajusteRateio !== 0
                ? ` — serviço medido (${fmt(p.resumo.retencao.servico_medido)}) menos a retenção contratual (${fmt(p.resumo.retencao.valor)}) e ${ajusteRateio > 0 ? 'menos' : 'mais'} o ajuste de rateio material/serviço (${fmt(Math.abs(ajusteRateio))})`
                : `, já descontada a retenção contratual (${fmt(p.resumo.retencao.valor)})`}.
            </li>
          </ul>
          <p style="margin:8px 0 0;">
            A diferença retida (<strong>${fmt(p.resumo.retencao.valor)}</strong>) será paga
            conforme condições contratuais, mediante emissão de Nota Fiscal de serviço futura específica.
          </p>
          ${ajusteRateio !== 0 ? `<p style="margin:8px 0 0;">
            O ajuste de rateio <strong>não é retenção e não será pago depois</strong>: o total medido
            é o mesmo nos dois sistemas, apenas a divisão entre material e serviço difere${
              motivoAjuste ? `. ${escapeHtml(motivoAjuste)}` : ''}
          </p>` : ''}
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

      ${(p.itens_com_confirmacao_sem_nf && p.itens_com_confirmacao_sem_nf.length > 0) ? `
      <!-- AJUSTE DE PERCENTUAL -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <div style="border:2px solid #f59e0b;background:#fffbeb;border-radius:10px;padding:18px;">
          <h2 style="margin:0 0 6px;font-size:14px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;">
            ⚠ Ajuste de percentual aplicado
          </h2>
          <p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:#78350f;">
            Os itens abaixo tiveram o % de medição ajustado conforme decisão
            do aprovador (saldo de pedido aprovado considerado não-faturável):
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:12px;background:#ffffff;border-radius:6px;overflow:hidden;">
            <thead>
              <tr style="background:#fef3c7;">
                <th style="padding:8px 10px;text-align:left;font-weight:600;color:#92400e;border-bottom:1px solid #fde68a;">Item</th>
                <th style="padding:8px 10px;text-align:left;font-weight:600;color:#92400e;border-bottom:1px solid #fde68a;">Descrição</th>
                <th style="padding:8px 10px;text-align:right;font-weight:600;color:#92400e;border-bottom:1px solid #fde68a;">% Original</th>
                <th style="padding:8px 10px;text-align:right;font-weight:600;color:#92400e;border-bottom:1px solid #fde68a;">% Ajustado</th>
                <th style="padding:8px 10px;text-align:right;font-weight:600;color:#92400e;border-bottom:1px solid #fde68a;">Valor Retido</th>
              </tr>
            </thead>
            <tbody>
              ${p.itens_com_confirmacao_sem_nf.map(it => `
                <tr>
                  <td style="padding:8px 10px;border-bottom:1px solid #fef3c7;font-family:ui-monospace,monospace;font-weight:600;color:#0f172a;">${escapeHtml(it.codigo)}</td>
                  <td style="padding:8px 10px;border-bottom:1px solid #fef3c7;color:#0f172a;">${escapeHtml(it.descricao)}</td>
                  <td style="padding:8px 10px;border-bottom:1px solid #fef3c7;text-align:right;color:#475569;">${pctFmt(it.pct_original)}</td>
                  <td style="padding:8px 10px;border-bottom:1px solid #fef3c7;text-align:right;font-weight:600;color:#92400e;">${pctFmt(it.pct_ajustado)}</td>
                  <td style="padding:8px 10px;border-bottom:1px solid #fef3c7;text-align:right;font-weight:600;color:#b91c1c;">${fmt(it.valor_retido_absorvido)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${p.itens_com_confirmacao_sem_nf.map(it => `
            <p style="margin:12px 0 0;font-size:12px;color:#78350f;line-height:1.6;">
              <strong>${escapeHtml(it.codigo)}</strong> — Motivo registrado:
              <em style="color:#0f172a;">"${escapeHtml(it.motivo)}"</em>
            </p>
          `).join('')}
          <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#78350f;font-style:italic;">
            Esse ajuste protege a retenção contratual quando a NF de material
            não chegará mais (saldo precisa ser encerrado formalmente via
            fluxo de "Solicitar encerramento de saldo").
          </p>
        </div>
      </div>
      ` : ''}

      ${(p.ajustes_admin && p.ajustes_admin.length > 0) ? `
      <!-- AJUSTES DO ADMIN (migration 061) -->
      <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
        <div style="border:2px solid #f97316;background:#fff7ed;border-radius:10px;padding:18px;">
          <h2 style="margin:0 0 6px;font-size:14px;font-weight:700;color:#9a3412;text-transform:uppercase;letter-spacing:0.5px;">
            ✏️ Ajustes feitos pelo admin nesta medição
          </h2>
          <p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:#7c2d12;">
            Os itens abaixo tiveram a quantidade alterada pelo admin durante a
            aprovação. As novas quantidades já estão refletidas nos valores
            desta medição (% medido, Wave, FIP, retenção).
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:12px;background:#ffffff;border-radius:6px;overflow:hidden;">
            <thead>
              <tr style="background:#fed7aa;">
                <th style="padding:8px 10px;text-align:left;font-weight:600;color:#7c2d12;border-bottom:1px solid #fdba74;">Item</th>
                <th style="padding:8px 10px;text-align:left;font-weight:600;color:#7c2d12;border-bottom:1px solid #fdba74;">Descrição</th>
                <th style="padding:8px 10px;text-align:right;font-weight:600;color:#7c2d12;border-bottom:1px solid #fdba74;">Qtd anterior</th>
                <th style="padding:8px 10px;text-align:right;font-weight:600;color:#7c2d12;border-bottom:1px solid #fdba74;">Qtd nova</th>
                <th style="padding:8px 10px;text-align:left;font-weight:600;color:#7c2d12;border-bottom:1px solid #fdba74;">Por</th>
              </tr>
            </thead>
            <tbody>
              ${p.ajustes_admin.map(a => `
                <tr>
                  <td style="padding:8px 10px;border-bottom:1px solid #fed7aa;font-family:ui-monospace,monospace;font-weight:600;color:#0f172a;">${escapeHtml(a.codigo)}</td>
                  <td style="padding:8px 10px;border-bottom:1px solid #fed7aa;color:#0f172a;">${escapeHtml(a.descricao)}</td>
                  <td style="padding:8px 10px;border-bottom:1px solid #fed7aa;text-align:right;color:#475569;">${a.quantidade_anterior}</td>
                  <td style="padding:8px 10px;border-bottom:1px solid #fed7aa;text-align:right;font-weight:700;color:#ea580c;">${a.quantidade_nova}</td>
                  <td style="padding:8px 10px;border-bottom:1px solid #fed7aa;color:#475569;">${escapeHtml(a.ajustado_por_nome ?? '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${p.ajustes_admin.map(a => `
            <p style="margin:12px 0 0;font-size:12px;color:#7c2d12;line-height:1.6;">
              <strong>${escapeHtml(a.codigo)}</strong> — Motivo:
              <em style="color:#0f172a;">"${escapeHtml(a.motivo)}"</em>
            </p>
          `).join('')}
        </div>
      </div>
      ` : ''}

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
          <li>NF FIP material: pelo <strong>valor integral</strong> (sem retenção).</li>
          <li>NF Wave serviço: pelo <strong>valor LÍQUIDO</strong> (já com retenção descontada).</li>
          <li>Boleto anexado a cada NF com prazo vigente.</li>
          <li>Prazo mínimo de pagamento: <strong>${OBRA.prazoMinDias} dias</strong>.</li>
          <li>Retenção 5% acumulada — paga ao final via NF de retenção da Wave SPE.</li>
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
    ...(temFipMaterial ? [
      `⚠ ORDEM OBRIGATÓRIA DE EMISSÃO DAS NFs`,
      `A NF de MATERIAL (FIP fat-direto) deve ser emitida e lançada no Informakon`,
      `ANTES da NF de SERVIÇO (Wave). Só assim o Wave pode descontar as NFs`,
      `de material já lançadas e emitir pelo valor integral.`,
      ``,
      `1º) NF FIP — MATERIAL (fat-direto)`,
      `    Emissora: ${CONTRATADO.razaoSocial}`,
      `    CNPJ:     ${maskCnpj(CONTRATADO.cnpj)}`,
      `    Valor:    ${fmt(fipTotal)}`,
      ``,
      `2º) NF Wave — SERVIÇO (somente após o Passo 1)`,
      `    Emissora: ${WAVE_SPE.razaoSocial}`,
      `    CNPJ:     ${maskCnpj(WAVE_SPE.cnpj)}`,
      `    Valor:    ${fmt(waveTotal)}`,
      ``,
      ...(p.fip_por_grupo_macro && p.fip_por_grupo_macro.length > 0 ? [
        `MATERIAL FIP — DETALHAMENTO POR GRUPO MACRO`,
        ...p.fip_por_grupo_macro.map(g => `  ${String(g.grupo).padStart(2)}. ${g.nome.padEnd(50)} ${fmt(g.valor)}`),
        `  TOTAL FIP MATERIAL: ${fmt(fipTotal)}`,
        ``,
      ] : []),
    ] : []),
    ...(temAjustes ? [
      `✏️ AJUSTES FEITOS PELO ADMIN NESTA MEDIÇÃO`,
      ...p.ajustes_admin!.map(a =>
        `  ${a.codigo} — ${a.descricao}\n` +
        `    Qtd: ${a.quantidade_anterior} → ${a.quantidade_nova}  (por ${a.ajustado_por_nome ?? '—'})\n` +
        `    Motivo: "${a.motivo}"`
      ),
      '',
    ] : []),
    `RESUMO DA MEDIÇÃO`,
    `  Material correspondente:    ${fmt(p.resumo.retencao.material_correspondente)}`,
    `  Serviço executado:           ${fmt(p.resumo.retencao.servico_medido)}`,
    `  Base de retenção:           ${fmt(p.resumo.retencao.base_retencao)}`,
    `  Retenção (${pctFmt(p.resumo.retencao.percentual_aplicado)}):           − ${fmt(p.resumo.retencao.valor)}`,
    ...(ajusteRateio !== 0
      ? [`  Ajuste de rateio mat/serv:  ${ajusteRateio > 0 ? '−' : '+'} ${fmt(Math.abs(ajusteRateio))}`]
      : []),
    `  Líquido a pagar:            ${fmt(p.resumo.retencao.liquido_a_pagar)}`,
    `  Andamento físico:           ${pctFmt(p.resumo.retencao.andamento_fisico_pct)} do contrato`,
    '',
    `⚠ COMO EMITIR CADA NF`,
    `  - NF FIP material: pelo valor integral (sem retenção).`,
    `  - NF Wave serviço: emitir pelo valor de ${fmt(p.resumo.retencao.liquido_a_pagar)}.`,
    ...(ajusteRateio !== 0
      ? [
          `    = serviço medido ${fmt(p.resumo.retencao.servico_medido)}`,
          `      − retenção ${fmt(p.resumo.retencao.valor)}`,
          `      ${ajusteRateio > 0 ? '−' : '+'} ajuste de rateio material/serviço ${fmt(Math.abs(ajusteRateio))}`,
        ]
      : [`    (já descontada a retenção de ${fmt(p.resumo.retencao.valor)})`]),
    `  A diferença retida (${fmt(p.resumo.retencao.valor)}) será paga conforme condições`,
    `  contratuais, mediante emissão de NF de serviço futura específica.`,
    ...(ajusteRateio !== 0
      ? [
          `  O ajuste de rateio NAO e retencao e nao sera pago depois: o total medido e o`,
          `  mesmo nos dois sistemas, apenas a divisao material/servico difere.`,
        ]
      : []),
    '',
    `RESUMO FINANCEIRO DA OBRA (${ehPrimeira ? 'desde início' : periodoLabel})`,
    `  Serviços — esta medição:    ${fmt(p.resumo.servicos.esta_medicao)}`,
    `  Serviços — total medido:    ${fmt(p.resumo.servicos.acumulado)} (${pctFmt(p.resumo.servicos.pct_limite)} de ${fmt(p.resumo.contrato.valor_servicos)})`,
    `  Material — NFs recebidas:   ${fmt(p.resumo.material.nfs_recebidas_acumulado)} (${pctFmt(p.resumo.material.pct_recebidas_limite)} de ${fmt(p.resumo.contrato.valor_material_direto)})`,
    `  Material — aprovado FIP:    ${fmt(p.resumo.material.aprovado_acumulado)} (${pctFmt(p.resumo.material.pct_aprovado_limite)} de ${fmt(p.resumo.contrato.valor_material_direto)})`,
    `  Andamento físico acumulado: ${pctFmt(p.resumo.servicos.pct_contrato)} do contrato (${fmt(p.resumo.contrato.valor_total)})`,
    '',
    ...((p.itens_com_confirmacao_sem_nf && p.itens_com_confirmacao_sem_nf.length > 0) ? [
      `⚠ AJUSTE DE PERCENTUAL APLICADO`,
      `Os itens abaixo tiveram o % de medição ajustado conforme decisão do aprovador`,
      `(saldo de pedido aprovado considerado não-faturável):`,
      ...p.itens_com_confirmacao_sem_nf.map(it =>
        `  ${it.codigo} — ${it.descricao}\n` +
        `    % Original: ${pctFmt(it.pct_original)} → % Ajustado: ${pctFmt(it.pct_ajustado)} | Valor retido: ${fmt(it.valor_retido_absorvido)}\n` +
        `    Motivo: "${it.motivo}"`
      ),
      '',
      `Esse ajuste protege a retenção contratual quando a NF de material não chegará mais`,
      `(saldo precisa ser encerrado formalmente via fluxo de "Solicitar encerramento de saldo").`,
      '',
    ] : []),
    `ITENS MEDIDOS`,
    ...p.itens.map(it => `  - ${it.codigo ? `${it.codigo} ` : ''}${it.descricao}${it.qtde ? ` (qtde ${it.qtde})` : ''} — ${fmt(Number(it.valor_total || 0))}`),
    `  TOTAL: ${fmt(valorMedicao)}`,
    '',
    `CONDIÇÕES OBRIGATÓRIAS`,
    `  - NF FIP: valor integral (sem retenção)`,
    `  - NF Wave: valor LÍQUIDO (= bruto − débito da retenção)`,
    `  - Boleto anexado com prazo vigente`,
    `  - Prazo mínimo de pagamento: ${OBRA.prazoMinDias} dias`,
    `  - Retenção descontada no pagamento`,
    '',
    p.observacoes ? `OBSERVAÇÕES\n  ${p.observacoes}\n` : '',
    `— Gestão WAVE`,
  ].filter(Boolean).join('\n')

  return { subject, html, text }
}
