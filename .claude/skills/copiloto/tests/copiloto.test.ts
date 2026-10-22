import { expect, mock, test } from 'claude-code/testing'

// Monta o "mundo" por baixo do mod: uso da sessão, modelo, perguntas e o fim da fila do prompt
function mundo(on: any, opts: { ctx: number; modelo: string; respostas: (q: string) => string }) {
  const perguntas: string[] = []
  const recebidos: { text: string; context?: readonly string[] }[] = []
  mock.store(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: opts.ctx * 2000, window: 200000, percent: opts.ctx }, rateLimits: [] } }))
  on('session.model', () => ({ value: opts.modelo }))
  on('session.messages', () => ({ value: [] }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.read', () => ({ deny: 'sem arquivo no teste' }))
  on('model.complete', () => ({ value: { isAnswered: true, text: 'medio', usage: {} } }))
  // $.ui.ask abre o diálogo AskUserQuestion: respondemos no lugar da pessoa
  on('tool.call', { tool: 'AskUserQuestion' }, (_$: any, e: any) => {
    const q = String(e.questions?.[0]?.question ?? '')
    perguntas.push(q)
    return { result: { questions: e.questions, answers: { [q]: opts.respostas(q) } } }
  })
  on('prompt.submit', (_$: any, e: any) => {
    recebidos.push({ text: e.text, context: e.context })
    return { text: e.text, context: e.context }
  })
  return { perguntas, recebidos }
}

test('/quem carol marca quem está usando', async ($, on) => {
  mundo(on, { ctx: 10, modelo: 'claude-opus-5-5', respostas: () => 'ALEX' })
  const r = await $.command.run({ command: 'quem', args: 'carol' })
  expect(r.text).toBe('Quem está usando agora: CAROL.')
})

test('assunto da Carol: pergunta quem está usando e avisa o Claude', async ($, on) => {
  const m = mundo(on, { ctx: 10, modelo: 'claude-opus-5-5', respostas: () => 'CAROL' })
  await $.prompt.submit({ text: 'Revise o PPC do curso de farmácia e aponte lacunas' })
  expect(m.perguntas[0]).toContain('CAROL')
  expect(m.recebidos.length).toBe(1)
  expect((m.recebidos[0]?.context ?? []).join('\n')).toContain('Quem está usando agora: CAROL')
})

test('estudos: oferece MATEUS ou MARINA', async ($, on) => {
  const m = mundo(on, { ctx: 10, modelo: 'claude-opus-5-5', respostas: () => 'MARINA' })
  await $.prompt.submit({ text: 'Monte um simulado de biologia para o vestibular da UECE' })
  expect(m.perguntas[0]).toContain('MATEUS ou MARINA')
  expect((m.recebidos[0]?.context ?? []).join('\n')).toContain('MARINA')
})

test('pedido simples no opus: sugere haiku antes de enviar', async ($, on) => {
  const m = mundo(on, {
    ctx: 10,
    modelo: 'claude-opus-5-5',
    respostas: q => (q.includes('Quem') ? 'ALEX' : 'Usar haiku neste pedido'),
  })
  await $.prompt.submit({ text: 'renomeie a variável x para total' })
  expect(m.perguntas.some(q => q.includes('haiku'))).toBe(true)
  expect(m.recebidos.length).toBe(1)
})

test('contexto cheio: oferece compactar; "Seguir assim" deixa passar', async ($, on) => {
  const m = mundo(on, {
    ctx: 90,
    modelo: 'claude-sonnet-5-5',
    respostas: q => (q.includes('Quem') ? 'ALEX' : 'Seguir assim'),
  })
  await $.prompt.submit({ text: 'agora ajuste o cálculo do cronograma da obra para considerar feriados' })
  expect(m.perguntas.some(q => q.includes('Contexto em 90%'))).toBe(true)
  expect(m.recebidos.length).toBe(1)
})

test('/p responde a pergunta lateral sem interromper a tarefa', async ($, on) => {
  mundo(on, { ctx: 10, modelo: 'claude-opus-5-5', respostas: () => 'ALEX' })
  const linhas: string[] = []
  on('model.fork', () => ({ value: { isAnswered: true, text: 'O deploy vai para a Vercel.', usage: {} } }))
  on('ui.log', (_$: any, e: any) => {
    linhas.push(String(e.text))
    return { value: undefined }
  })
  const r = await $.command.run({ command: 'p', args: 'para onde vai o deploy?' })
  expect(r.text ?? '').toBe('')
  expect(linhas.join('\n')).toContain('O deploy vai para a Vercel.')
})

test('mesmo arquivo editado 5 vezes: pergunta e pode pedir outra abordagem', async ($, on) => {
  const m = mundo(on, { ctx: 10, modelo: 'claude-opus-5-5', respostas: () => 'Pedir outra abordagem' })
  on('tool.call', { tool: 'Edit' }, () => ({ result: 'ok' }))
  let ultimo: any = null
  for (let i = 0; i < 5; i++) ultimo = await $.tool.call({ tool: 'Edit', file_path: 'src/app.ts', old_string: 'a', new_string: 'b' })
  expect(m.perguntas.some(q => q.includes('app.ts'))).toBe(true)
  expect(JSON.stringify(ultimo)).toContain('abordagem diferente')
})

const FAIXA = {
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { bodyRows: 10, offset: 0 }, view: {} } as any,
}

test('faixa mostra os 7 botões em todas as telas que desenham', async ($, on) => {
  mundo(on, { ctx: 10, modelo: 'claude-opus-5-5', respostas: () => 'ALEX' })
  await $.command.run({ command: 'quem', args: 'carol' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'copiloto', surface, ...FAIXA })
    for (const key of ['usuario', 'perguntar', 'painel', 'resumo', 'especialista', 'ideia', 'melhorar'])
      expect(await ui.find({ key })).toBeDefined()
    expect((await ui.find({ key: 'usuario' }))?.text).toContain('CAROL')
    await ui.unmount()
  }
})

test('botão do especialista liga e desliga', async ($, on) => {
  mundo(on, { ctx: 10, modelo: 'claude-opus-5-5', respostas: () => 'ALEX' })
  const ui = await $.ui.mount({ plugin: 'copiloto', surface: 'terminal', ...FAIXA })
  expect((await ui.find({ key: 'especialista' }))?.text).toContain('🔔')
  await ui.press({ key: 'especialista' })
  expect((await ui.find({ key: 'especialista' }))?.text).toContain('🔕')
  await ui.unmount()
})

test('/ideia anota na lista de ideias do Copiloto', async ($, on) => {
  mundo(on, { ctx: 10, modelo: 'claude-opus-5-5', respostas: () => 'ALEX' })
  const gravados: { path: string; text: string }[] = []
  on('fs.write', (_$: any, e: any) => {
    gravados.push({ path: String(e.path), text: String(e.text ?? e.content ?? '') })
    return { value: undefined }
  })
  await $.command.run({ command: 'ideia', args: 'mostrar custo do dia' })
  expect(gravados[0]?.path).toContain('IDEIAS.md')
  expect(JSON.stringify(gravados)).toContain('mostrar custo do dia')
})

test('/melhorar salva o pedido e abre uma janela paralela', async ($, on) => {
  mundo(on, { ctx: 10, modelo: 'claude-opus-5-5', respostas: () => 'ALEX' })
  const comandos: string[][] = []
  on('fs.write', () => ({ value: undefined }))
  on('process.run', (_$: any, e: any) => {
    comandos.push((e.argv ?? e) as string[])
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  const r = await $.command.run({ command: 'melhorar', args: 'perguntar menos sobre compactar' })
  expect(r.text).toContain('janela nova')
  expect(JSON.stringify(comandos)).toContain('MELHORIA-PENDENTE.md')
})
