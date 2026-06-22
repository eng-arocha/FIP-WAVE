import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

const BLU = '#1e3a8a'
const BLU_LT = '#dbeafe'
const GRY = '#64748b'
const GRY_LT = '#f8fafc'
const BRD = '#e2e8f0'
const AMB = '#92400e'
const AMB_BG = '#fffbeb'
const GRN = '#065f46'
const GRN_BG = '#f0fdf4'

const s = StyleSheet.create({
  page: { backgroundColor: '#ffffff', padding: '32 36 52 36', fontFamily: 'Helvetica', fontSize: 8 },
  // header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: BLU },
  logo: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: BLU },
  logoSub: { fontSize: 7, color: GRY, marginTop: 2 },
  docTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: BLU },
  docSub: { fontSize: 8, color: GRY, marginTop: 2 },
  // info grid
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 },
  infoItem: { width: '25%', marginBottom: 6 },
  infoLabel: { fontSize: 6.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3 },
  infoValue: { fontSize: 8, color: '#0f172a', fontFamily: 'Helvetica-Bold', marginTop: 1 },
  // section title
  secTitle: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRY, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5, marginTop: 10 },
  // table header
  th: { flexDirection: 'row', backgroundColor: BLU, paddingVertical: 5, paddingHorizontal: 4 },
  thTxt: { color: '#ffffff', fontSize: 6.5, fontFamily: 'Helvetica-Bold' },
  // grupo row
  grRow: { flexDirection: 'row', backgroundColor: '#eff6ff', paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: BLU_LT },
  grTxt: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: BLU },
  // tarefa row
  trRow: { flexDirection: 'row', backgroundColor: '#f1f5f9', paddingVertical: 4, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: BRD },
  trTxt: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#334155' },
  // det row
  dtRow: { flexDirection: 'row', paddingVertical: 3.5, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: BRD },
  dtRowAlt: { flexDirection: 'row', paddingVertical: 3.5, paddingHorizontal: 4, backgroundColor: GRY_LT, borderBottomWidth: 1, borderBottomColor: BRD },
  dtTxt: { fontSize: 7, color: '#334155' },
  // total
  totRow: { flexDirection: 'row', backgroundColor: BLU_LT, paddingVertical: 6, paddingHorizontal: 4, borderTopWidth: 2, borderTopColor: BLU, marginTop: 2 },
  totTxt: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: BLU },
  // pav breakdown
  pavBox: { marginLeft: 24, marginRight: 4, marginTop: 3, marginBottom: 3, padding: 5, backgroundColor: '#fef9c3', borderWidth: 1, borderColor: '#fde68a', borderRadius: 3 },
  pavTitle: { fontSize: 6, color: '#92400e', fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  pavGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  pavCell: { width: 40, padding: 3, borderWidth: 1, borderColor: '#fde68a', borderRadius: 2, alignItems: 'center', backgroundColor: '#fffbeb' },
  pavCellDelta: { width: 40, padding: 3, borderWidth: 1, borderColor: '#f59e0b', borderRadius: 2, alignItems: 'center', backgroundColor: '#fef3c7' },
  pavCellDone: { width: 40, padding: 3, borderWidth: 1, borderColor: '#6ee7b7', borderRadius: 2, alignItems: 'center', backgroundColor: GRN_BG },
  pavNum: { fontSize: 5.5, color: '#78350f' },
  pavPct: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: AMB },
  pavPctDone: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRN },
  pavPctAnt: { fontSize: 5.5, color: '#b45309' },
  // summary cards
  cardRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  card: { flex: 1, padding: 7, borderWidth: 1, borderColor: BRD, borderRadius: 4 },
  cardLabel: { fontSize: 6.5, color: GRY, textTransform: 'uppercase', letterSpacing: 0.3 },
  cardValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#0f172a', marginTop: 2 },
  // footer
  footer: { position: 'absolute', bottom: 24, left: 36, right: 36, borderTopWidth: 1, borderTopColor: BRD, paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between' },
  footerTxt: { fontSize: 6.5, color: '#94a3b8' },
})

// column widths (landscape A4 = 841pt, minus 72pt margins = 769pt usable)
const COL = {
  cod:   '7%',
  desc:  '27%',
  vg:    '10%',
  ant:   '10%',   // Med. Anterior R$
  antPct:'7%',    // Med. Anterior %
  atu:   '10%',   // Med. Atual R$
  atuPct:'7%',    // Med. Atual %
  tot:   '10%',   // Total R$
  totPct:'6%',    // Total %
  sal:   '10%',   // Saldo R$
  salPct:'6%',    // Saldo %
}

function R(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)
}
function P(v: number) { return `${(v * 100).toFixed(1)}%` }
function fmtDate(d?: string) { return d ? new Date(d).toLocaleDateString('pt-BR') : '—' }

// Compact pct for table cells: show "—" when zero
function rPct(pct: number) { return pct === 0 ? '—' : `${(pct * 100).toFixed(1)}%` }
function rVal(v: number) { return v === 0 ? '—' : R(v) }

interface MedicaoPDFProps {
  medicao: any
  itens: any[]
  aprovacoes: any[]
  planilha?: any | null
}

export function MedicaoPDF({ medicao, itens, aprovacoes, planilha }: MedicaoPDFProps) {
  const statusLabels: Record<string, string> = {
    submetido: 'Submetido', em_analise: 'Em Análise',
    aprovado: 'Aprovado', rejeitado: 'Rejeitado', rascunho: 'Rascunho',
  }
  const tipoLabels: Record<string, string> = {
    servico: 'Serviço', faturamento_direto: 'Fat. Direto', misto: 'Misto',
  }

  const totais = planilha?.totais
  const grupos: any[] = planilha?.grupos || []

  // Pav breakdown: only floors with pct > 0 (compact)
  function renderPavBreakdown(pavimentos_pct: Record<string, number>, pavimentos_pct_anterior?: Record<string, number> | null) {
    const floors = Object.entries(pavimentos_pct)
      .map(([k, v]) => ({ num: Number(k), pct: Number(v) }))
      .sort((a, b) => a.num - b.num)
    // Show all floors that have pct > 0
    const active = floors.filter(f => f.pct > 0)
    if (active.length === 0) return null
    return (
      <View style={s.pavBox}>
        <Text style={s.pavTitle}>Breakdown por pavimento (acumulado ao fim desta medição)</Text>
        <View style={s.pavGrid}>
          {active.map(f => {
            const pctAnt = Number(pavimentos_pct_anterior?.[String(f.num)] ?? 0)
            const isDelta = f.pct > pctAnt
            const isDone = f.pct >= 100
            const cellStyle = isDone ? s.pavCellDone : isDelta ? s.pavCellDelta : s.pavCell
            return (
              <View key={f.num} style={cellStyle}>
                <Text style={s.pavNum}>{f.num}º pav</Text>
                {isDelta && pctAnt > 0 && <Text style={s.pavPctAnt}>ant: {pctAnt}%</Text>}
                <Text style={isDone ? s.pavPctDone : s.pavPct}>{f.pct}%</Text>
              </View>
            )
          })}
        </View>
      </View>
    )
  }

  // Fallback table (when planilha is not available) — original simple layout
  function renderFallbackTable() {
    return (
      <View style={s.th}>
        <Text style={[s.thTxt, { width: '8%' }]}>Cód.</Text>
        <Text style={[s.thTxt, { width: '38%' }]}>Descrição</Text>
        <Text style={[s.thTxt, { width: '8%', textAlign: 'center' }]}>Un.</Text>
        <Text style={[s.thTxt, { width: '12%', textAlign: 'right' }]}>Qtd.</Text>
        <Text style={[s.thTxt, { width: '18%', textAlign: 'right' }]}>V. Unit.</Text>
        <Text style={[s.thTxt, { width: '16%', textAlign: 'right' }]}>Total</Text>
      </View>
    )
  }

  let detIdx = 0

  return (
    <Document title={`Medição #${String(medicao.numero).padStart(3,'0')} — ${medicao.contrato?.numero || ''}`}>
      <Page size="A4" orientation="landscape" style={s.page}>

        {/* Header */}
        <View style={s.header} fixed>
          <View>
            <Text style={s.logo}>FIP-WAVE</Text>
            <Text style={s.logoSub}>Sistema de Controle de Medições · FIP Engenharia</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.docTitle}>BOLETIM DE MEDIÇÃO</Text>
            <Text style={s.docSub}>#{String(medicao.numero).padStart(3,'0')} · {medicao.periodo_referencia} · {statusLabels[medicao.status] || medicao.status}</Text>
            <Text style={s.docSub}>{medicao.contrato?.numero || ''} — {medicao.contrato?.descricao || ''}</Text>
          </View>
        </View>

        {/* Info grid */}
        <View style={s.infoGrid}>
          <View style={s.infoItem}>
            <Text style={s.infoLabel}>Contratante</Text>
            <Text style={s.infoValue}>{medicao.contrato?.contratante?.nome || '—'}</Text>
          </View>
          <View style={s.infoItem}>
            <Text style={s.infoLabel}>Contratado</Text>
            <Text style={s.infoValue}>{medicao.contrato?.contratado?.nome || '—'}</Text>
          </View>
          <View style={s.infoItem}>
            <Text style={s.infoLabel}>Tipo</Text>
            <Text style={s.infoValue}>{tipoLabels[medicao.tipo] || medicao.tipo}</Text>
          </View>
          <View style={s.infoItem}>
            <Text style={s.infoLabel}>Solicitante</Text>
            <Text style={s.infoValue}>{medicao.solicitante_nome || '—'}</Text>
          </View>
          <View style={s.infoItem}>
            <Text style={s.infoLabel}>Data Submissão</Text>
            <Text style={s.infoValue}>{fmtDate(medicao.data_submissao)}</Text>
          </View>
          {medicao.data_aprovacao && (
            <View style={s.infoItem}>
              <Text style={s.infoLabel}>Data Aprovação</Text>
              <Text style={s.infoValue}>{fmtDate(medicao.data_aprovacao)}</Text>
            </View>
          )}
          {medicao.observacoes && (
            <View style={{ width: '100%', marginTop: 2, paddingTop: 4, borderTopWidth: 1, borderTopColor: BRD }}>
              <Text style={s.infoLabel}>Observações</Text>
              <Text style={{ fontSize: 7.5, color: '#334155', marginTop: 1 }}>{medicao.observacoes}</Text>
            </View>
          )}
        </View>

        {/* Items table */}
        <Text style={s.secTitle}>Itens da Medição</Text>

        {grupos.length > 0 ? (
          <View style={{ marginTop: 2 }}>
            {/* Table header */}
            <View style={s.th} fixed>
              <Text style={[s.thTxt, { width: COL.cod }]}>Cód.</Text>
              <Text style={[s.thTxt, { width: COL.desc }]}>Descrição</Text>
              <Text style={[s.thTxt, { width: COL.vg, textAlign: 'right' }]}>Valor Global</Text>
              <Text style={[s.thTxt, { width: COL.antPct, textAlign: 'right' }]}>Ant. %</Text>
              <Text style={[s.thTxt, { width: COL.ant, textAlign: 'right' }]}>Med. Anterior</Text>
              <Text style={[s.thTxt, { width: COL.atuPct, textAlign: 'right' }]}>Atu. %</Text>
              <Text style={[s.thTxt, { width: COL.atu, textAlign: 'right' }]}>Med. Atual</Text>
              <Text style={[s.thTxt, { width: COL.totPct, textAlign: 'right' }]}>Tot. %</Text>
              <Text style={[s.thTxt, { width: COL.tot, textAlign: 'right' }]}>Total</Text>
              <Text style={[s.thTxt, { width: COL.salPct, textAlign: 'right' }]}>Sal. %</Text>
              <Text style={[s.thTxt, { width: COL.sal, textAlign: 'right' }]}>Saldo</Text>
            </View>

            {grupos.map((g: any) => (
              <View key={g.id}>
                {/* Grupo row */}
                <View style={s.grRow} wrap={false}>
                  <Text style={[s.grTxt, { width: COL.cod }]}>{g.codigo}</Text>
                  <Text style={[s.grTxt, { width: COL.desc }]}>{g.nome}</Text>
                  <Text style={[s.grTxt, { width: COL.vg, textAlign: 'right' }]}>{R(g.valor_global)}</Text>
                  <Text style={[s.grTxt, { width: COL.antPct, textAlign: 'right' }]}>{rPct(g.pct_anterior)}</Text>
                  <Text style={[s.grTxt, { width: COL.ant, textAlign: 'right' }]}>{rVal(g.valor_anterior)}</Text>
                  <Text style={[s.grTxt, { width: COL.atuPct, textAlign: 'right' }]}>{rPct(g.pct_atual)}</Text>
                  <Text style={[s.grTxt, { width: COL.atu, textAlign: 'right' }]}>{rVal(g.valor_atual)}</Text>
                  <Text style={[s.grTxt, { width: COL.totPct, textAlign: 'right' }]}>{rPct(g.pct_total)}</Text>
                  <Text style={[s.grTxt, { width: COL.tot, textAlign: 'right' }]}>{rVal(g.valor_total)}</Text>
                  <Text style={[s.grTxt, { width: COL.salPct, textAlign: 'right' }]}>{rPct(g.pct_saldo)}</Text>
                  <Text style={[s.grTxt, { width: COL.sal, textAlign: 'right' }]}>{R(g.valor_saldo)}</Text>
                </View>

                {g.tarefas.map((t: any) => (
                  <View key={t.id}>
                    {/* Tarefa row */}
                    <View style={s.trRow} wrap={false}>
                      <Text style={[s.trTxt, { width: COL.cod, paddingLeft: 6 }]}>{t.codigo}</Text>
                      <Text style={[s.trTxt, { width: COL.desc }]}>{t.nome}</Text>
                      <Text style={[s.trTxt, { width: COL.vg, textAlign: 'right' }]}>{R(t.valor_global)}</Text>
                      <Text style={[s.trTxt, { width: COL.antPct, textAlign: 'right' }]}>{rPct(t.pct_anterior)}</Text>
                      <Text style={[s.trTxt, { width: COL.ant, textAlign: 'right' }]}>{rVal(t.valor_anterior)}</Text>
                      <Text style={[s.trTxt, { width: COL.atuPct, textAlign: 'right' }]}>{rPct(t.pct_atual)}</Text>
                      <Text style={[s.trTxt, { width: COL.atu, textAlign: 'right' }]}>{rVal(t.valor_atual)}</Text>
                      <Text style={[s.trTxt, { width: COL.totPct, textAlign: 'right' }]}>{rPct(t.pct_total)}</Text>
                      <Text style={[s.trTxt, { width: COL.tot, textAlign: 'right' }]}>{rVal(t.valor_total)}</Text>
                      <Text style={[s.trTxt, { width: COL.salPct, textAlign: 'right' }]}>{rPct(t.pct_saldo)}</Text>
                      <Text style={[s.trTxt, { width: COL.sal, textAlign: 'right' }]}>{R(t.valor_saldo)}</Text>
                    </View>

                    {t.detalhamentos.map((d: any) => {
                      const alt = detIdx++ % 2 === 0
                      const hasPav = d.pavimentos_pct && Object.keys(d.pavimentos_pct).length > 0
                      const qtdUnit = d.quantidade_contratada > 0
                        ? `${d.quantidade_contratada} × ${R(d.valor_unitario_contratual)}`
                        : R(d.valor_global_item)
                      return (
                        <View key={d.detalhamento_id || d.medicao_item_id}>
                          <View style={[alt ? s.dtRowAlt : s.dtRow]} wrap={false}>
                            <Text style={[s.dtTxt, { width: COL.cod, paddingLeft: 12, color: '#94a3b8' }]}>{d.codigo}</Text>
                            <View style={{ width: COL.desc }}>
                              <Text style={s.dtTxt}>{d.descricao}</Text>
                              <Text style={{ fontSize: 6, color: '#94a3b8', marginTop: 1 }}>{qtdUnit}</Text>
                            </View>
                            <Text style={[s.dtTxt, { width: COL.vg, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{R(d.valor_global_item)}</Text>
                            <Text style={[s.dtTxt, { width: COL.antPct, textAlign: 'right', color: GRY }]}>{rPct(d.pct_anterior)}</Text>
                            <Text style={[s.dtTxt, { width: COL.ant, textAlign: 'right', color: GRY }]}>{rVal(d.valor_anterior)}</Text>
                            <Text style={[s.dtTxt, { width: COL.atuPct, textAlign: 'right', color: d.valor_atual > 0 ? AMB : GRY }]}>{rPct(d.pct_atual)}</Text>
                            <Text style={[s.dtTxt, { width: COL.atu, textAlign: 'right', fontFamily: d.valor_atual > 0 ? 'Helvetica-Bold' : 'Helvetica', color: d.valor_atual > 0 ? AMB : GRY }]}>{rVal(d.valor_atual)}</Text>
                            <Text style={[s.dtTxt, { width: COL.totPct, textAlign: 'right' }]}>{rPct(d.pct_total)}</Text>
                            <Text style={[s.dtTxt, { width: COL.tot, textAlign: 'right' }]}>{rVal(d.valor_total)}</Text>
                            <Text style={[s.dtTxt, { width: COL.salPct, textAlign: 'right', color: GRY }]}>{rPct(d.pct_saldo)}</Text>
                            <Text style={[s.dtTxt, { width: COL.sal, textAlign: 'right', color: GRY }]}>{rVal(d.valor_saldo)}</Text>
                          </View>
                          {hasPav && renderPavBreakdown(d.pavimentos_pct, d.pavimentos_pct_anterior)}
                        </View>
                      )
                    })}
                  </View>
                ))}
              </View>
            ))}

            {/* Totals row */}
            {totais && (
              <View style={s.totRow}>
                <Text style={[s.totTxt, { width: COL.cod }]}> </Text>
                <Text style={[s.totTxt, { width: COL.desc }]}>SUBTOTAL</Text>
                <Text style={[s.totTxt, { width: COL.vg, textAlign: 'right' }]}>{R(totais.valor_global_total)}</Text>
                <Text style={[s.totTxt, { width: COL.antPct, textAlign: 'right' }]}>{rPct(totais.pct_anterior_total)}</Text>
                <Text style={[s.totTxt, { width: COL.ant, textAlign: 'right' }]}>{R(totais.valor_anterior_total)}</Text>
                <Text style={[s.totTxt, { width: COL.atuPct, textAlign: 'right' }]}>{rPct(totais.pct_atual_total)}</Text>
                <Text style={[s.totTxt, { width: COL.atu, textAlign: 'right' }]}>{R(totais.valor_atual_total)}</Text>
                <Text style={[s.totTxt, { width: COL.totPct, textAlign: 'right' }]}>{rPct(totais.pct_total_medido)}</Text>
                <Text style={[s.totTxt, { width: COL.tot, textAlign: 'right' }]}>{R(totais.valor_total_medido)}</Text>
                <Text style={[s.totTxt, { width: COL.salPct, textAlign: 'right' }]}>{rPct(totais.pct_saldo_total)}</Text>
                <Text style={[s.totTxt, { width: COL.sal, textAlign: 'right' }]}>{R(totais.valor_saldo_total)}</Text>
              </View>
            )}
          </View>
        ) : (
          /* Fallback: simple list when planilha not available */
          <View>
            {renderFallbackTable()}
            {itens.map((item: any, i: number) => (
              <View key={item.id || i} style={i % 2 === 0 ? { flexDirection: 'row', padding: '4 4', borderBottomWidth: 1, borderBottomColor: BRD } : { flexDirection: 'row', padding: '4 4', backgroundColor: GRY_LT, borderBottomWidth: 1, borderBottomColor: BRD }}>
                <Text style={[{ fontSize: 7, color: '#94a3b8', width: '8%' }]}>{item.detalhamento?.codigo || '—'}</Text>
                <Text style={[{ fontSize: 7, color: '#334155', width: '38%' }]}>{item.detalhamento?.descricao || '—'}</Text>
                <Text style={[{ fontSize: 7, color: '#334155', width: '8%', textAlign: 'center' }]}>{item.detalhamento?.unidade || '—'}</Text>
                <Text style={[{ fontSize: 7, color: '#334155', width: '12%', textAlign: 'right' }]}>{Number(item.quantidade_medida).toLocaleString('pt-BR')}</Text>
                <Text style={[{ fontSize: 7, color: GRY, width: '16%', textAlign: 'right' }]}>{R(item.valor_unitario)}</Text>
                <Text style={[{ fontSize: 7, color: '#334155', fontFamily: 'Helvetica-Bold', width: '18%', textAlign: 'right' }]}>{R(item.quantidade_medida * item.valor_unitario)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Summary cards */}
        {totais && (
          <View style={s.cardRow}>
            <View style={[s.card, { borderColor: '#bfdbfe' }]}>
              <Text style={s.cardLabel}>Material (Fat. Direto)</Text>
              <Text style={[s.cardValue, { color: '#1d4ed8' }]}>{R(totais.material_atual_total ?? 0)}</Text>
            </View>
            <View style={[s.card, { borderColor: '#a7f3d0' }]}>
              <Text style={s.cardLabel}>Serviço medido</Text>
              <Text style={[s.cardValue, { color: '#047857' }]}>{R(totais.servico_atual_total ?? 0)}</Text>
            </View>
            <View style={[s.card, { borderColor: BRD }]}>
              <Text style={s.cardLabel}>Total da Medição</Text>
              <Text style={[s.cardValue]}>{R(totais.valor_atual_total ?? medicao.valor_total)}</Text>
            </View>
          </View>
        )}

        {/* Approval history */}
        {aprovacoes.length > 0 && (
          <View style={{ marginTop: 12 }}>
            <Text style={s.secTitle}>Histórico de Aprovação</Text>
            {aprovacoes.map((a: any, i: number) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 4, padding: 5, backgroundColor: GRY_LT, borderRadius: 3 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#334155' }}>{a.aprovador_nome}</Text>
                  <Text style={{ fontSize: 6.5, color: GRY }}>{a.acao} · {fmtDate(a.created_at)}</Text>
                  {a.comentario && <Text style={{ fontSize: 6.5, color: '#475569', marginTop: 1 }}>{a.comentario}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>FIP-WAVE · Boletim de Medição · FIP Engenharia</Text>
          <Text style={s.footerTxt} render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
