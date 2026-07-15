import { Document, Page, View, Text, StyleSheet, Image } from '@react-pdf/renderer'
import type { DashboardModo } from '@/types/dashboard'
import { valoresPorModo, type FlatRow } from '@/lib/export/visao-geral'

const BLU = '#1e3a8a'
const BLU_LT = '#dbeafe'
const SLT = '#f1f5f9'
const GRY = '#64748b'
const BRD = '#e2e8f0'

const s = StyleSheet.create({
  page: { backgroundColor: '#fff', padding: '28 28 40 28', fontFamily: 'Helvetica', fontSize: 8 },
  h1: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: BLU },
  sub: { fontSize: 7, color: GRY, marginTop: 2, marginBottom: 10 },
  chart: { width: '100%', marginBottom: 10, objectFit: 'contain' },
  thead: { flexDirection: 'row', backgroundColor: BLU, color: '#fff', fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BRD },
  cCod: { width: '12%', padding: 3 },
  cItem: { width: '46%', padding: 3 },
  cNum: { width: '14%', padding: 3, textAlign: 'right' },
  tfoot: { flexDirection: 'row', backgroundColor: BLU, color: '#fff', fontFamily: 'Helvetica-Bold' },
})

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function VisaoGeralPDF({
  rows, modo, contratoNome, chartImage,
}: { rows: FlatRow[]; modo: DashboardModo; contratoNome: string; chartImage?: string | null }) {
  const modoLabel = modo === 'material' ? 'Material' : modo === 'servico' ? 'Serviço' : 'Total'
  const saldoLabel = valoresPorModo(rows[0]?.item ?? ({} as any), modo).saldoLabel
  let totC = 0, totR = 0, totS = 0
  for (const { item, level } of rows) {
    if (level !== 0) continue
    const v = valoresPorModo(item, modo)
    totC += v.contratado; totR += v.realizado; totS += v.saldo
  }
  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        <Text style={s.h1}>Visão Geral — {contratoNome} ({modoLabel})</Text>
        <Text style={s.sub}>Gerado em {new Date().toLocaleString('pt-BR')}</Text>
        {chartImage ? <Image src={chartImage} style={s.chart} /> : null}

        <View style={s.thead} fixed>
          <Text style={s.cCod}>Código</Text>
          <Text style={s.cItem}>Item</Text>
          <Text style={s.cNum}>Contratado</Text>
          <Text style={s.cNum}>Realizado</Text>
          <Text style={s.cNum}>{saldoLabel}</Text>
        </View>

        {rows.map(({ item, level }) => {
          const v = valoresPorModo(item, modo)
          const bg = level === 0 ? BLU_LT : level === 1 ? SLT : '#fff'
          const bold = level === 0 ? 'Helvetica-Bold' : 'Helvetica'
          const color = level === 0 ? BLU : '#1f2937'
          return (
            <View key={`${item.id}-${level}`} style={[s.row, { backgroundColor: bg }]} wrap={false}>
              <Text style={[s.cCod, { fontFamily: bold, color }]}>{item.codigo}</Text>
              <Text style={[s.cItem, { fontFamily: bold, color, paddingLeft: 3 + level * 10 }]}>{item.nome}</Text>
              <Text style={[s.cNum, { fontFamily: bold, color }]}>{fmt(v.contratado)}</Text>
              <Text style={[s.cNum, { fontFamily: bold, color }]}>{fmt(v.realizado)}</Text>
              <Text style={[s.cNum, { fontFamily: bold, color }]}>{fmt(v.saldo)}</Text>
            </View>
          )
        })}

        <View style={s.tfoot} wrap={false}>
          <Text style={s.cCod}>TOTAL</Text>
          <Text style={s.cItem}></Text>
          <Text style={s.cNum}>{fmt(totC)}</Text>
          <Text style={s.cNum}>{fmt(totR)}</Text>
          <Text style={s.cNum}>{fmt(totS)}</Text>
        </View>

        <Text style={{ position: 'absolute', bottom: 20, left: 28, right: 28, fontSize: 7, color: GRY, textAlign: 'center' }}
          render={({ pageNumber, totalPages }) => `${contratoNome} · Visão Geral · pág. ${pageNumber}/${totalPages}`} fixed />
      </Page>
    </Document>
  )
}
