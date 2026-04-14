import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

/**
 * Página PÚBLICA de verificação de boletim de medição.
 *
 * Acesso: qualquer pessoa com o link/QR code do boletim. Mostra:
 *  - Que o hash é válido (existe no banco)
 *  - Resumo dos dados oficiais (contrato, medição, valor, aprovador)
 *  - Quando foi emitido
 *
 * Não vaza dados sensíveis: só informações que já estariam no PDF
 * impresso. É uma "verificação de integridade" — confirma que o que
 * você tem em mãos é o documento oficial.
 *
 * SSR (server component) — sem 'use client'. Lê direto do Supabase.
 */
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ hash: string }>
}

export default async function VerificarBoletim({ params }: Props) {
  const { hash } = await params

  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    return <Status icon="✕" titulo="Hash inválido" detalhe="O código informado não tem o formato esperado." cor="#EF4444" />
  }

  let medicao: any = null
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('medicoes')
      .select(`
        id, numero, periodo_referencia, valor_total, status,
        data_aprovacao, boletim_emitido_em, boletim_hash,
        contrato:contratos!inner ( numero, descricao,
          contratante:empresas!contratos_contratante_id_fkey ( nome ),
          contratado:empresas!contratos_contratado_id_fkey ( nome )
        )
      `)
      .eq('boletim_hash', hash)
      .maybeSingle()
    medicao = data
  } catch {/* segue exibindo "não encontrado" */}

  if (!medicao) {
    return (
      <Status
        icon="?"
        titulo="Boletim não encontrado"
        detalhe="Esse hash não corresponde a nenhum boletim emitido. O documento pode ter sido adulterado ou ainda não foi emitido oficialmente."
        cor="#F59E0B"
      />
    )
  }

  const fmtMoney = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleString('pt-BR') : '—'
  const m: any = medicao

  return (
    <div style={{ minHeight: '100vh', background: '#0b1220', color: '#e5e7eb', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid #10B981', borderRadius: 12, padding: 24, textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 48, color: '#10B981', marginBottom: 8 }}>✓</div>
          <h1 style={{ margin: 0, fontSize: 22, color: '#10B981' }}>Boletim Verificado</h1>
          <p style={{ marginTop: 6, fontSize: 13, color: '#a7f3d0' }}>
            Este documento corresponde ao boletim oficial emitido pelo sistema FIP-WAVE.
          </p>
        </div>

        <Section titulo="Identificação">
          <Linha label="Contrato"           valor={m.contrato?.numero} />
          <Linha label="Descrição"          valor={m.contrato?.descricao} />
          <Linha label="Contratante"        valor={m.contrato?.contratante?.nome} />
          <Linha label="Contratado"         valor={m.contrato?.contratado?.nome} />
        </Section>

        <Section titulo="Medição">
          <Linha label="Número"             valor={`#${m.numero}`} />
          <Linha label="Período"            valor={m.periodo_referencia} />
          <Linha label="Status"             valor={String(m.status).toUpperCase()} />
          <Linha label="Valor total"        valor={fmtMoney(Number(m.valor_total ?? 0))} />
          <Linha label="Data de aprovação"  valor={fmtDate(m.data_aprovacao)} />
        </Section>

        <Section titulo="Emissão do Boletim">
          <Linha label="Emitido em"         valor={fmtDate(m.boletim_emitido_em)} />
          <Linha label="Hash SHA-256"       valor={hash} mono />
        </Section>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#64748b', marginTop: 32 }}>
          Verificação realizada em {new Date().toLocaleString('pt-BR')}.
          {' '}<Link href="/" style={{ color: '#3b82f6' }}>Voltar à aplicação</Link>
        </p>
      </div>
    </div>
  )
}

function Status({ icon, titulo, detalhe, cor }: { icon: string; titulo: string; detalhe: string; cor: string }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0b1220', color: '#e5e7eb', fontFamily: 'system-ui, sans-serif', padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: 480, textAlign: 'center', padding: 32, border: `1px solid ${cor}`, borderRadius: 12, background: `${cor}15` }}>
        <div style={{ fontSize: 48, color: cor, marginBottom: 8 }}>{icon}</div>
        <h1 style={{ margin: 0, fontSize: 22, color: cor }}>{titulo}</h1>
        <p style={{ marginTop: 8, fontSize: 13, color: '#cbd5e1' }}>{detalhe}</p>
        <p style={{ marginTop: 24, fontSize: 11 }}>
          <Link href="/" style={{ color: '#3b82f6' }}>Ir para a aplicação</Link>
        </p>
      </div>
    </div>
  )
}

function Section({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#1f2937', border: '1px solid #334155', borderRadius: 8, padding: 16, marginBottom: 12 }}>
      <h2 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#94a3b8', margin: 0, marginBottom: 12 }}>{titulo}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )
}

function Linha({ label, valor, mono }: { label: string; valor: any; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #334155', paddingBottom: 6 }}>
      <span style={{ fontSize: 12, color: '#94a3b8' }}>{label}</span>
      <span style={{
        fontSize: mono ? 10 : 13,
        fontFamily: mono ? 'ui-monospace, monospace' : 'inherit',
        color: '#e5e7eb',
        textAlign: 'right',
        wordBreak: mono ? 'break-all' : 'normal',
        maxWidth: '60%',
      }}>{valor ?? '—'}</span>
    </div>
  )
}
