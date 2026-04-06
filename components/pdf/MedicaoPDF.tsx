import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: { backgroundColor: '#ffffff', padding: 40, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: '#1e3a8a' },
  logo: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#1e3a8a' },
  logoSub: { fontSize: 8, color: '#64748b', marginTop: 2 },
  headerRight: { alignItems: 'flex-end' },
  docTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#1e3a8a' },
  docNum: { fontSize: 10, color: '#64748b', marginTop: 2 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoItem: { width: '48%', marginBottom: 6 },
  infoLabel: { fontSize: 7, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 9, color: '#0f172a', fontFamily: 'Helvetica-Bold', marginTop: 1 },
  table: { marginTop: 4 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#1e3a8a', padding: '6 8', borderRadius: 2 },
  tableHeaderText: { color: '#ffffff', fontSize: 7, fontFamily: 'Helvetica-Bold' },
  tableRow: { flexDirection: 'row', padding: '5 8', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  tableRowAlt: { flexDirection: 'row', padding: '5 8', backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  tableCellText: { fontSize: 8, color: '#334155' },
  totalRow: { flexDirection: 'row', padding: '8 8', backgroundColor: '#eff6ff', borderTopWidth: 2, borderTopColor: '#1e3a8a', marginTop: 2 },
  totalText: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#1e3a8a' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: '#94a3b8' },
})

interface MedicaoPDFProps {
  medicao: any
  itens: any[]
  aprovacoes: any[]
}

function formatCurrencyPDF(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatDatePDF(dateStr?: string): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('pt-BR')
}

export function MedicaoPDF({ medicao, itens, aprovacoes }: MedicaoPDFProps) {
  const statusLabels: Record<string, string> = {
    submetido: 'Submetido', em_analise: 'Em Análise',
    aprovado: 'Aprovado', rejeitado: 'Rejeitado',
  }
  const tipoLabels: Record<string, string> = {
    servico: 'Serviço', faturamento_direto: 'Fat. Direto', misto: 'Misto',
  }

  return (
    <Document title={`Medição #${String(medicao.numero).padStart(3,'0')} — ${medicao.contrato?.numero || ''}`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>FIP-WAVE</Text>
            <Text style={styles.logoSub}>Sistema de Controle de Medições</Text>
            <Text style={[styles.logoSub, { marginTop: 4 }]}>FIP Engenharia</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>BOLETIM DE MEDIÇÃO</Text>
            <Text style={styles.docNum}>#{String(medicao.numero).padStart(3,'0')} · {medicao.periodo_referencia}</Text>
            <Text style={[styles.docNum, { marginTop: 4 }]}>Status: {statusLabels[medicao.status] || medicao.status}</Text>
          </View>
        </View>

        {/* Contract info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dados do Contrato</Text>
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Número do Contrato</Text>
              <Text style={styles.infoValue}>{medicao.contrato?.numero || '—'}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Descrição</Text>
              <Text style={styles.infoValue}>{medicao.contrato?.descricao || '—'}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Contratante</Text>
              <Text style={styles.infoValue}>{medicao.contrato?.contratante?.nome || '—'}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Contratado</Text>
              <Text style={styles.infoValue}>{medicao.contrato?.contratado?.nome || '—'}</Text>
            </View>
          </View>
        </View>

        {/* Measurement info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dados da Medição</Text>
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Período de Referência</Text>
              <Text style={styles.infoValue}>{medicao.periodo_referencia}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Tipo</Text>
              <Text style={styles.infoValue}>{tipoLabels[medicao.tipo] || medicao.tipo}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Solicitante</Text>
              <Text style={styles.infoValue}>{medicao.solicitante_nome}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Data de Submissão</Text>
              <Text style={styles.infoValue}>{formatDatePDF(medicao.data_submissao)}</Text>
            </View>
            {medicao.data_aprovacao && (
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Data de Aprovação</Text>
                <Text style={styles.infoValue}>{formatDatePDF(medicao.data_aprovacao)}</Text>
              </View>
            )}
          </View>
          {medicao.observacoes && (
            <View style={{ marginTop: 8, padding: 8, backgroundColor: '#f8fafc', borderRadius: 4 }}>
              <Text style={[styles.infoLabel, { marginBottom: 2 }]}>Observações</Text>
              <Text style={{ fontSize: 8, color: '#334155' }}>{medicao.observacoes}</Text>
            </View>
          )}
        </View>

        {/* Items table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Itens da Medição ({itens.length} item{itens.length !== 1 ? 's' : ''})</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { width: '8%' }]}>Cód.</Text>
              <Text style={[styles.tableHeaderText, { width: '38%' }]}>Descrição</Text>
              <Text style={[styles.tableHeaderText, { width: '8%', textAlign: 'center' }]}>Un.</Text>
              <Text style={[styles.tableHeaderText, { width: '12%', textAlign: 'right' }]}>Qtd.</Text>
              <Text style={[styles.tableHeaderText, { width: '16%', textAlign: 'right' }]}>V. Unit.</Text>
              <Text style={[styles.tableHeaderText, { width: '18%', textAlign: 'right' }]}>Total</Text>
            </View>
            {itens.map((item: any, i: number) => (
              <View key={item.id || i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                <Text style={[styles.tableCellText, { width: '8%', color: '#94a3b8' }]}>{item.detalhamento?.codigo || '—'}</Text>
                <Text style={[styles.tableCellText, { width: '38%' }]}>{item.detalhamento?.descricao || '—'}</Text>
                <Text style={[styles.tableCellText, { width: '8%', textAlign: 'center' }]}>{item.detalhamento?.unidade || '—'}</Text>
                <Text style={[styles.tableCellText, { width: '12%', textAlign: 'right' }]}>{Number(item.quantidade_medida).toLocaleString('pt-BR')}</Text>
                <Text style={[styles.tableCellText, { width: '16%', textAlign: 'right', color: '#64748b' }]}>{formatCurrencyPDF(item.valor_unitario)}</Text>
                <Text style={[styles.tableCellText, { width: '18%', textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{formatCurrencyPDF(item.quantidade_medida * item.valor_unitario)}</Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={[styles.totalText, { flex: 1 }]}>TOTAL DA MEDIÇÃO</Text>
              <Text style={[styles.totalText, { textAlign: 'right' }]}>{formatCurrencyPDF(medicao.valor_total)}</Text>
            </View>
          </View>
        </View>

        {/* Approval history */}
        {aprovacoes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Histórico de Aprovação</Text>
            {aprovacoes.map((a: any, i: number) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 6, padding: 6, backgroundColor: '#f8fafc', borderRadius: 4 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#334155' }}>{a.aprovador_nome}</Text>
                  <Text style={{ fontSize: 7, color: '#64748b' }}>{a.acao} · {formatDatePDF(a.created_at)}</Text>
                  {a.comentario && <Text style={{ fontSize: 7, color: 'var(--text-3)', marginTop: 2 }}>{a.comentario}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>FIP-WAVE · Sistema de Controle de Medições · FIP Engenharia</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
