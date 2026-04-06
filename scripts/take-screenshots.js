// Use system playwright's chromium
let chromium
try { chromium = require('playwright').chromium }
catch { chromium = require('playwright-core').chromium }

const path = require('path')
const fs = require('fs')
const mock = require('./mock-data')

const BASE = 'http://localhost:3001'
const OUT = path.join(__dirname, '../docs/manual-screenshots')
const CONTRATO_ID = mock.CONTRATO_ID
const SOL1_ID = 's1000000-0000-0000-0000-000000000001'
const MED1_ID = 'b1000000-0000-0000-0000-000000000001'

// ── API route interceptor ─────────────────────────────────────
async function setupMocks(page) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    // Skip non-GET or let POST go through
    if (method !== 'GET') { await route.continue(); return }

    let body = null

    if (url.includes('/api/contratos') && !url.includes(`/${CONTRATO_ID}`)) {
      body = [{ ...mock.contrato, contratado: { nome: 'WAVE Instalações Prediais Ltda' } }]
    } else if (url.includes(`/api/contratos/${CONTRATO_ID}/acompanhamento`)) {
      body = mock.acompanhamento
    } else if (url.includes(`/api/contratos/${CONTRATO_ID}/cronograma`)) {
      body = mock.curvaS
    } else if (url.includes(`/api/contratos/${CONTRATO_ID}/grupos`)) {
      body = mock.grupos
    } else if (url.includes(`/api/contratos/${CONTRATO_ID}/medicoes/${MED1_ID}`)) {
      body = mock.medicao1Detail
    } else if (url.includes(`/api/contratos/${CONTRATO_ID}/medicoes`)) {
      body = mock.medicoes
    } else if (url.includes(`/api/contratos/${CONTRATO_ID}/fat-direto/solicitacoes/${SOL1_ID}`)) {
      body = mock.solicitacoes[0]
    } else if (url.includes(`/api/contratos/${CONTRATO_ID}/fat-direto/solicitacoes`)) {
      body = mock.solicitacoes
    } else if (url.includes(`/api/contratos/${CONTRATO_ID}/fat-direto/tarefas`)) {
      body = mock.tarefas
    } else if (url.includes(`/api/contratos/${CONTRATO_ID}/estrutura`)) {
      body = mock.estrutura
    } else if (url.includes(`/api/contratos/${CONTRATO_ID}/aditivos`)) {
      body = []
    } else if (url.includes(`/api/contratos/${CONTRATO_ID}`)) {
      body = mock.contrato
    } else if (url.includes('/api/dashboard') || url.includes('/api/stats')) {
      body = mock.dashboard
    }

    if (body !== null) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    } else {
      await route.continue()
    }
  })
}

async function shot(page, filename, label) {
  const filepath = path.join(OUT, filename)
  await page.screenshot({ path: filepath, fullPage: true })
  console.log(`✓ ${label} → ${filename}`)
}

async function goto(page, url, wait = 2000) {
  await page.goto(url)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(wait)
}

;(async () => {
  const execPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    `${process.env.HOME}/.cache/ms-playwright/chromium-1194/chrome-linux/chrome`

  const browser = await chromium.launch({
    headless: true,
    executablePath: execPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })

  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
  })

  const page = await ctx.newPage()
  await setupMocks(page)

  // ── 01 Login ─────────────────────────────────────────────────
  // Temporarily disable mock to show real login page
  await page.unroute('**/api/**')
  await goto(page, `${BASE}/login`, 1500)
  await shot(page, '01-login.png', 'Login')
  await setupMocks(page)

  // ── 02 Dashboard ─────────────────────────────────────────────
  await goto(page, `${BASE}/dashboard`, 2000)
  await shot(page, '02-dashboard.png', 'Dashboard')

  // ── 03 Lista de Contratos ─────────────────────────────────────
  await goto(page, `${BASE}/contratos`, 2500)
  await shot(page, '03-contratos-lista.png', 'Lista de Contratos')

  // ── 04 Detalhe do Contrato — KPIs ────────────────────────────
  await goto(page, `${BASE}/contratos/${CONTRATO_ID}`, 3000)
  await shot(page, '04-contrato-kpis.png', 'Contrato — KPI Cards')

  // Scroll down to show "Visão Geral" tab content + charts
  await page.evaluate(() => window.scrollTo(0, 400))
  await page.waitForTimeout(800)
  await shot(page, '04b-contrato-visao-geral-charts.png', 'Contrato — Visão Geral + Gráficos')

  // Scroll to acompanhamento charts
  await page.evaluate(() => window.scrollTo(0, 1200))
  await page.waitForTimeout(800)
  await shot(page, '04c-acomp-servico.png', 'Gráfico — Acompanhamento Serviço')

  await page.evaluate(() => window.scrollTo(0, 2000))
  await page.waitForTimeout(600)
  await shot(page, '04d-acomp-fatdireto.png', 'Gráfico — Fat. Direto + NFs')

  // ── 05 Aba Medições ──────────────────────────────────────────
  const tabMed = page.locator('button[role="tab"]').filter({ hasText: 'Medições' })
  await tabMed.click().catch(() => {})
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(1200)
  await shot(page, '05-medicoes-aba.png', 'Contrato — Aba Medições')

  // ── 06 Aba Estrutura ─────────────────────────────────────────
  await goto(page, `${BASE}/contratos/${CONTRATO_ID}`, 2000)
  const tabEst = page.locator('button[role="tab"]').filter({ hasText: 'Estrutura' })
  await tabEst.click().catch(() => {})
  await page.waitForTimeout(1200)
  await shot(page, '06-estrutura-wbs.png', 'Contrato — Estrutura WBS')

  // ── 07 Cronograma Curva S ────────────────────────────────────
  await goto(page, `${BASE}/contratos/${CONTRATO_ID}/cronograma`, 3000)
  await shot(page, '07-cronograma-curva-s.png', 'Cronograma — Curva S (Acumulado)')

  // Switch to Mensal view
  const btnMensal = page.locator('button').filter({ hasText: 'Mensal' })
  await btnMensal.click().catch(() => {})
  await page.waitForTimeout(800)
  await shot(page, '07b-cronograma-mensal.png', 'Cronograma — Vista Mensal')

  // ── 08 Faturamento Direto ─────────────────────────────────────
  await goto(page, `${BASE}/contratos/${CONTRATO_ID}/fat-direto`, 2500)
  await shot(page, '08-fat-direto-lista.png', 'Faturamento Direto — Lista de Solicitações')

  // ── 09 Nova Solicitação ───────────────────────────────────────
  await goto(page, `${BASE}/contratos/${CONTRATO_ID}/fat-direto/nova`, 2000)
  await shot(page, '09a-nova-sol-fornecedor.png', 'Nova Solicitação — Dados do Fornecedor')

  // Fill supplier info for a fuller screenshot
  await page.fill('input[placeholder*="empresa fornecedora"]', 'Schneider Electric Brasil Ltda').catch(() => {})
  await page.fill('input[placeholder*="CNPJ"]', '61.649.477/0001-06').catch(() => {})
  await page.fill('input[placeholder*="Contato"]', 'João Silva – (11) 99876-5432').catch(() => {})
  await page.waitForTimeout(500)
  await shot(page, '09b-nova-sol-preenchida.png', 'Nova Solicitação — Formulário Preenchido')

  // ── 10 Detalhe SOL-001 (Aprovada + NF) ───────────────────────
  await goto(page, `${BASE}/contratos/${CONTRATO_ID}/fat-direto/${SOL1_ID}`, 2000)
  await shot(page, '10a-solicitacao-aprovada.png', 'Solicitação Aprovada — Detalhe e NFs')

  // Scroll down to show NF section
  await page.evaluate(() => window.scrollTo(0, 600))
  await page.waitForTimeout(500)
  await shot(page, '10b-solicitacao-nfs.png', 'Solicitação Aprovada — Notas Fiscais')

  // ── 11 SOL-003 (Aguardando Aprovação) ────────────────────────
  const SOL3_ID = 's3000000-0000-0000-0000-000000000003'
  await page.route(`**/fat-direto/solicitacoes/${SOL3_ID}`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock.solicitacoes[2]) })
  })
  await goto(page, `${BASE}/contratos/${CONTRATO_ID}/fat-direto/${SOL3_ID}`, 2000)
  await shot(page, '11-solicitacao-pendente-aprovacao.png', 'Solicitação — Aguardando Aprovação (Ações WAVE)')

  // ── 12 Nova Medição — Step 1 ─────────────────────────────────
  await goto(page, `${BASE}/contratos/${CONTRATO_ID}/medicoes/nova`, 2000)
  await shot(page, '12a-nova-medicao-step1.png', 'Nova Medição — Step 1 (Dados Gerais)')

  // Select type and period, then go to step 2
  const combobox = page.locator('button[role="combobox"]').first()
  await combobox.click().catch(() => {})
  await page.waitForTimeout(400)
  await page.locator('[role="option"]').filter({ hasText: 'Serviço' }).click().catch(() => {})
  await page.fill('input[type="month"]', '2026-06').catch(() => {})
  await page.waitForTimeout(300)
  await shot(page, '12b-nova-medicao-step1-filled.png', 'Nova Medição — Step 1 Preenchido')
  const nextBtn = page.locator('button').filter({ hasText: 'Próximo' })
  await nextBtn.click().catch(() => {})
  await page.waitForTimeout(2500)
  await shot(page, '12c-nova-medicao-step2.png', 'Nova Medição — Step 2 (Seleção de Itens)')

  // Select some percentages
  const pct25btns = page.locator('button').filter({ hasText: '25%' })
  const count = await pct25btns.count()
  for (let i = 0; i < Math.min(3, count); i++) {
    await pct25btns.nth(i).click().catch(() => {})
  }
  await page.waitForTimeout(600)
  await shot(page, '12d-nova-medicao-step2-selected.png', 'Nova Medição — Itens Selecionados')

  // ── 13 Detalhe Medição Aprovada ──────────────────────────────
  await page.route(`**/medicoes/${MED1_ID}`, async (route) => {
    if (route.request().method() === 'GET')
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock.medicao1Detail) })
    else await route.continue()
  })
  await goto(page, `${BASE}/contratos/${CONTRATO_ID}/medicoes/${MED1_ID}`, 2000)
  await shot(page, '13-medicao-aprovada-detalhe.png', 'Medição Aprovada — Detalhe Completo')

  await browser.close()
  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.png'))
  console.log(`\n✅ ${files.length} screenshots saved to docs/manual-screenshots/`)
  files.forEach(f => console.log(`   • ${f}`))
})()
