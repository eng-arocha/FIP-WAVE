import { Document, Page, View, Text, StyleSheet, Image } from '@react-pdf/renderer'
import type { DashboardModo } from '@/types/dashboard'
import { valoresPorModo, totalizarRows, percentuais, colunasExport, fmtPct, type FlatRow, type ColunaExport, type Percentuais } from '@/lib/export/visao-geral'

const BLU = '#1e3a8a'
const BLU_LT = '#dbeafe'
const SLT = '#f1f5f9'
const GRY = '#64748b'
const BRD = '#e2e8f0'
const LAR = '#b45309'

const s = StyleSheet.create({
  page: { backgroundColor: '#fff', padding: '28 28 40 28', fontFamily: 'Helvetica', fontSize: 8 },
  h1: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: BLU },
  sub: { fontSize: 7, color: GRY, marginTop: 2, marginBottom: 10 },
  chart: { width: '100%', marginBottom: 10, objectFit: 'contain' },
  thead: { flexDirection: 'row', backgroundColor: BLU, color: '#fff', fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BRD },
  cCod: { width: '12%', padding: 3 },
  cItem: { flex: 1, padding: 3 },
  cNum: { width: '12%', padding: 3, textAlign: 'right' },
  cPct: { width: '8%', padding: 3, textAlign: 'right' },
  tfoot: { flexDirection: 'row', backgroundColor: BLU, color: '#fff', fontFamily: 'Helvetica-Bold' },
})

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function VisaoGeralPDF({
  rows, modo, contratoNome, chartImage,
}: { rows: FlatRow[]; modo: DashboardModo; contratoNome: string; chartImage?: string | null }) {
  const modoLabel = modo === 'material' ? 'Material' : modo === 'servico' ? 'Serviço' : 'Total'
  const colunas = colunasExport(modo)
  // Raízes do conjunto filtrado, pra não somar o mesmo dinheiro em 2-3 níveis.
  const tot = totalizarRows(rows, modo)
  const estilo = (c: ColunaExport) => (c.tipo === 'pct' ? s.cPct : s.cNum)
  const texto = (c: ColunaExport, v: Parameters<ColunaExport['valor']>[0], p: Percentuais) => {
    const val = c.valor(v, p)
    return c.tipo === 'pct' ? fmtPct(val) : fmt(val ?? 0)
  }
  return (
    <Document>
      {/* Material/Serviço têm 5-6 colunas numéricas: paisagem pra caber o nome do item. */}
      <Page size="A4" orientation={modo === 'total' ? 'portrait' : 'landscape'} style={s.page} wrap>
        <Text style={s.h1}>Visão Geral — {contratoNome} ({modoLabel})</Text>
        <Text style={s.sub}>Gerado em {new Date().toLocaleString('pt-BR')}</Text>
        {chartImage ? <Image src={chartImage} style={s.chart} /> : null}

        <View style={s.thead} fixed>
          <Text style={s.cCod}>Código</Text>
          <Text style={s.cItem}>Item</Text>
          {colunas.map(c => <Text key={c.label} style={estilo(c)}>{c.label}</Text>)}
        </View>

        {rows.map(({ item, level }) => {
          const v = valoresPorModo(item, modo)
          const p = percentuais(item)
          const bg = level === 0 ? BLU_LT : level === 1 ? SLT : '#fff'
          const bold = level === 0 ? 'Helvetica-Bold' : 'Helvetica'
          const color = level === 0 ? BLU : '#1f2937'
          return (
            <View key={`${item.id}-${level}`} style={[s.row, { backgroundColor: bg }]} wrap={false}>
              <Text style={[s.cCod, { fontFamily: bold, color }]}>{item.codigo}</Text>
              <Text style={[s.cItem, { fontFamily: bold, color, paddingLeft: 3 + level * 10 }]}>{item.nome}</Text>
              {colunas.map(c => {
                const alerta = c.alerta?.(p) ?? false
                return (
                  <Text key={c.label} style={[estilo(c), { fontFamily: alerta ? 'Helvetica-Bold' : bold, color: alerta ? LAR : color }]}>
                    {texto(c, v, p)}
                  </Text>
                )
              })}
            </View>
          )
        })}

        <View style={s.tfoot} wrap={false}>
          <Text style={s.cCod}>TOTAL</Text>
          <Text style={s.cItem}></Text>
          {colunas.map(c => (
            <Text key={c.label} style={estilo(c)}>
              {texto(c, { contratado: tot.contratado, realizado: tot.realizado, saldo: tot.saldo, pendenteNf: tot.pendenteNf }, tot.pct)}
            </Text>
          ))}
        </View>

        {modo !== 'total' && (
          <Text style={{ marginTop: 6, fontSize: 7, color: GRY }}>
            % de serviço medido inclui medições em aprovação (submetidas, em análise ou autorizadas). Realizado e Saldo contam só medição aprovada.
            {modo === 'material' ? ' Em laranja: material faturado atrás do serviço medido — a FIP precisa faturar.' : ''}
          </Text>
        )}

        <Text style={{ position: 'absolute', bottom: 20, left: 28, right: 28, fontSize: 7, color: GRY, textAlign: 'center' }}
          render={({ pageNumber, totalPages }) => `${contratoNome} · Visão Geral · pág. ${pageNumber}/${totalPages}`} fixed />
      </Page>
    </Document>
  )
}
