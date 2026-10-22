// =====================================================================
//  COPILOTO v0.2 — assistente do Claude Code
//
//  1. Painel discreto (linha de status): quem está usando, contexto,
//     modelo, uso do plano e tempo do último pedido.
//  2. Cronômetro e progresso ao lado do "Thinking…" enquanto trabalha.
//  3. Especialista: antes de enviar um pedido, sugere trocar de modelo,
//     compactar, abrir sessão nova com resumo ou pedir um plano primeiro.
//  4. Perguntas laterais enquanto o Claude trabalha: /p e /pg.
//  5. Detector de "andando em círculos".
//  6. Aviso quando uma tarefa longa termina.
//  7. Identificação de quem está usando: ALEX / CAROL / MATEUS / MARINA.
//  8. Faixa com botões acima da caixa de mensagem (clique ou tecla 1–7).
//  9. Ideias e melhorias do próprio Copiloto em paralelo (💡 e 🛠).
// =====================================================================

import type { EngineInterface, Register } from 'claude-code'

type API = EngineInterface

// ---------------------------------------------------------------------
//  CONFIGURAÇÃO — mude os valores aqui. Ao salvar, o mod recarrega.
// ---------------------------------------------------------------------
const CONFIG = {
  // Especialista (perguntas antes de enviar)
  especialistaLigado: true,
  contextoCompactar: 85, // % de contexto: pergunta se compacta ou abre sessão nova
  contextoChecarAssunto: 60, // % a partir do qual verifica se o assunto mudou
  limitePlanoAlerta: 85, // % do limite do plano: sugere modelo mais leve
  usarHaikuParaClassificar: true, // consulta rápida e barata ao Haiku nos casos duvidosos
  sugerirFable: true, // mude para false se o Fable não existir no seu plano
  vezesIgnorarParaSilenciar: 3, // ignorou a mesma sugestão N vezes → ela para de aparecer

  // Detector de círculos
  editarMesmoArquivoLimite: 5, // edições no mesmo arquivo dentro de um pedido
  mesmoErroLimite: 3, // mesmo comando falhando

  // Aviso de término
  avisarAoTerminarSeg: 60, // pedidos mais longos que isso geram aviso
  falarAoTerminar: true, // fala "Tarefa concluída" (se o computador tiver voz)
  linhaResumoAcimaDeSeg: 20, // mostra a linha "⏱ tempo · tokens" abaixo da resposta

  // Pastas
  pastaDevWindows: 'C:\\Dev', // sua regra: projetos ficam em C:\Dev, nunca no OneDrive
  arquivoPassagem: '.claude/RESUMO.md', // resumo para continuar numa sessão nova

  // Faixa de botões e melhorias do Copiloto
  mostrarFaixa: true, // false esconde a faixa (os comandos continuam funcionando)
  faixaLargaAPartirDe: 100, // colunas: abaixo disso os botões mostram só o ícone
  arquivoIdeias: 'IDEIAS.md', // lista de ideias, dentro da pasta do Copiloto
  arquivoMelhoria: 'MELHORIA-PENDENTE.md', // pedido que a janela paralela vai executar

  // Modelos (apelidos aceitos pelo Claude Code)
  modelos: { leve: 'haiku', medio: 'sonnet', forte: 'opus', maximo: 'fable' },
}

// ---------------------------------------------------------------------
//  QUEM ESTÁ USANDO — regras por assunto (edite as palavras à vontade)
// ---------------------------------------------------------------------
const USUARIOS = ['ALEX', 'CAROL', 'MATEUS', 'MARINA'] as const
type Usuario = (typeof USUARIOS)[number]

const SINAIS = {
  // Sempre da Carol, mesmo que fale em prova/simulado
  carolForte: /\b(pefoce|enade|ppc|ccs|toxicolog\w*|per[ií]cia\w*|perit[oa]s?|laudos?|alcoolemia|semiologia|docentes?|nde|consolidar_exames)\b/i,
  // Estudos → Mateus ou Marina
  estudo: /\b(vestibular\w*|enem|uece|ibmec|simulados?|memorex|reda[cç][aã]o|estudar|estudos?|li[cç][aã]o de casa|col[eé]gio|escola|mat[eé]ria da prova)\b/i,
  // Carol (quando não for assunto de estudo)
  carol: /\b(unifor|farm[aá]cia\w*|farmac[eê]utic\w*)\b/i,
  // Alex
  alex: /\b(obras?|engenharia|concreto|estrutur\w+|fachada|wave|cremalheira|suprimentos?|cronograma|canteiro|empreiteir\w*|dasart|alvenaria|funda[cç][aã]o|incorporadora)\b/i,
}

// ---------------------------------------------------------------------
//  ESTADO (zera quando o mod recarrega)
// ---------------------------------------------------------------------
type Uso = {
  context?: { tokens?: number; window: number; percent?: number }
  rateLimits?: { kind: string; percentUsed: number; resetsAt?: string }[]
  cost?: { usd: number }
}

let usuario: Usuario | null = null
let perfisEnviados: Record<string, boolean> = {}
let trabalhando = false
let turnoAtual = ''
let inicioTurno = 0
let ultimoTurnoMs = 0
let tarefas = { feitas: 0, total: 0 }
let modeloDaVez: string | null = null
let pularProximaRevisao = false
let silencioSessao = false
let avisouPasta = false
let edicoes: Record<string, number> = {}
let falhas: Record<string, number> = {}
let jaPerguntado: Record<string, boolean> = {}
let ultimoUso: Uso | null = null
let ultimoModelo = '?'
let pastaAtual = ''
let alertasSessao: string[] = []
let painelAberto = false
let painelCache: string[] = []
const PAINEL = 'copiloto-painel'

// ---------------------------------------------------------------------
//  FUNÇÕES AUXILIARES (sem acesso ao Claude Code)
// ---------------------------------------------------------------------
function familia(m: string): 'haiku' | 'sonnet' | 'opus' | 'fable' | '?' {
  if (/haiku/i.test(m)) return 'haiku'
  if (/sonnet/i.test(m)) return 'sonnet'
  if (/opus/i.test(m)) return 'opus'
  if (/fable|mythos/i.test(m)) return 'fable'
  return '?'
}

function pesado(m: string): boolean {
  const f = familia(m)
  return f === 'opus' || f === 'fable'
}

function fmtTempo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}:${ss}`
}

function fmtHora(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function nomeLimite(kind: string): string {
  if (/five|5h/i.test(kind)) return '5h'
  if (/seven|week|7d/i.test(kind)) return 'semana'
  return kind
}

function maiorLimite(u: Uso | null) {
  const lista = u?.rateLimits ?? []
  let maior: { kind: string; percentUsed: number; resetsAt?: string } | null = null
  for (const l of lista) if (!maior || l.percentUsed > maior.percentUsed) maior = l
  return maior
}

function semaforo(p: number): string {
  return p < 60 ? '🟢' : p < 80 ? '🟡' : '🔴'
}

function linhaStatus(): string {
  const partes: string[] = []
  const ctx = ultimoUso?.context?.percent
  if (typeof ctx === 'number') partes.push(`${semaforo(ctx)} ctx ${ctx}%`)
  partes.push(`⚙️ ${familia(ultimoModelo) === '?' ? ultimoModelo : familia(ultimoModelo)}`)
  const lim = maiorLimite(ultimoUso)
  if (lim) {
    const hora = fmtHora(lim.resetsAt)
    partes.push(`📈 plano ${lim.percentUsed}% (${nomeLimite(lim.kind)}${hora ? ', renova ' + hora : ''})`)
  }
  if (trabalhando) partes.push(`⏳ ${fmtTempo(Date.now() - inicioTurno)}`)
  else if (ultimoTurnoMs > 0) partes.push(`⏱ último ${fmtTempo(ultimoTurnoMs)}`)
  return partes.join(' · ')
}

function sufixoSpinner(): string {
  const partes: string[] = [` · ⏱ ${fmtTempo(Date.now() - inicioTurno)}`]
  if (tarefas.total > 0) {
    partes.push(`✅ ${tarefas.feitas}/${tarefas.total}`)
    if (tarefas.feitas >= 1 && tarefas.total > tarefas.feitas) {
      const porTarefa = (Date.now() - inicioTurno) / tarefas.feitas
      const restante = porTarefa * (tarefas.total - tarefas.feitas)
      partes.push(restante < 60000 ? '<1 min restante' : `~${Math.round(restante / 60000)} min restantes`)
    }
  }
  if (modeloDaVez) partes.push(`⚙️ ${modeloDaVez}`)
  return partes.join(' · ')
}

function ehContinuacao(t: string): boolean {
  return t.length < 15 || (t.length < 40 && /^(ok|sim|n[aã]o|segue|continua|pode|manda|vai|beleza|isso|perfeito|certo|blz|valeu)\b/i.test(t))
}

function nivelHeuristico(t: string): 'simples' | 'medio' | 'complexo' {
  if (t.length > 700) return 'complexo'
  if (/(arquitetur|migra[cç]|migrar|refator|seguran|\brls\b|polic(y|ies)|autentica|\bauth\b|login|performance|lentid|investig|integra[cç]|integrar|deploy|schema|banco de dados|race condition|vazamento|n[aã]o funciona|quebrou|erro estranho)/i.test(t))
    return 'complexo'
  if (t.length < 120 && /(renome|typo|erro de digita|troc(a|ar|ue)\s+(a |o )?(cor|texto|nome|[ií]cone|label|t[ií]tulo)|ajust(a|ar|e)\s+(o |a )?(texto|espa|margem|fonte|tamanho)|^(o que|qual|onde|como)\s|explica|\bl[eê]\s|leia|mostr(a|e)\s)/i.test(t))
    return 'simples'
  return 'medio'
}

function pareceVago(t: string): boolean {
  return t.length < 200 && /\b(refa(z|zer|ça)|reescrev\w*|do zero|inteir[oa]|tud[oa]|tod[oa]s?\s+(as|os)|todo o|complet[oa])\b/i.test(t)
}

function nomeNoTexto(t: string): Usuario | null {
  const m = t.match(/\b(?:sou|aqui [eé]|quem fala [eé]|usu[aá]rio:?)\s+(?:o |a )?(alex|carol|mateus|marina)\b/i)
  return m && m[1] ? (m[1].toUpperCase() as Usuario) : null
}

function nomeNaPasta(p: string): Usuario | null {
  for (const u of USUARIOS) if (new RegExp(`[\\\\/]${u}([\\\\/]|$)`, 'i').test(p)) return u
  if (/pefoce|unifor[^\\/]*ppc|farm[aá]cia/i.test(p) && !/vestibular|provas/i.test(p)) return 'CAROL'
  return null
}

// Palpite pelo assunto: um nome, 'FILHO' (Mateus ou Marina) ou null (sem pista)
function palpiteAssunto(t: string): Usuario | 'FILHO' | null {
  if (SINAIS.carolForte.test(t)) return 'CAROL'
  if (SINAIS.estudo.test(t)) return 'FILHO'
  if (SINAIS.carol.test(t)) return 'CAROL'
  if (SINAIS.alex.test(t)) return 'ALEX'
  return null
}

function lerNome(resposta: string): Usuario | null {
  const m = resposta.toUpperCase().match(/ALEX|CAROL|MATEUS|MARINA/)
  return m ? (m[0] as Usuario) : null
}

function textoDe(r: unknown): string | null {
  const x = r as { isAnswered?: boolean; text?: string } | null
  return x && x.isAnswered && typeof x.text === 'string' && x.text.trim() ? x.text.trim() : null
}

function resumoMensagens(msgs: readonly { role: string; text: string }[], n: number): string {
  return msgs
    .slice(-n)
    .map(m => `${m.role === 'user' ? 'Usuário' : 'Claude'}: ${(m.text || '').slice(0, 600)}`)
    .join('\n')
}

// ---------------------------------------------------------------------
//  FUNÇÕES QUE FALAM COM O CLAUDE CODE (recebem $)
// ---------------------------------------------------------------------
async function atualizarUso($: API) {
  try {
    ultimoUso = (await $.session.usage()) as Uso
  } catch {}
  try {
    ultimoModelo = String(await $.session.model())
  } catch {}
  if (painelAberto) painelCache = await linhasPainel($)
  redesenhar($)
}

async function perguntar($: API, pergunta: string, opcoes: string[]): Promise<string | null> {
  try {
    return await $.ui.ask(pergunta, opcoes.slice(0, 4))
  } catch {
    return null // dispensou a pergunta, ou não há ninguém para responder
  }
}

async function contagemIgnorados($: API): Promise<Record<string, number>> {
  try {
    const v = await $.store.get('ignorados')
    return v && typeof v === 'object' ? (v as Record<string, number>) : {}
  } catch {
    return {}
  }
}

async function registrarIgnorado($: API, regra: string) {
  const c = await contagemIgnorados($)
  c[regra] = (c[regra] ?? 0) + 1
  try {
    await $.store.set('ignorados', c)
  } catch {}
  if (c[regra] === CONFIG.vezesIgnorarParaSilenciar)
    $.ui.toast(`Copiloto: não vou mais sugerir "${regra}". Para voltar: /copiloto reset`, { timeoutMs: 8000 })
}

async function regraSilenciada($: API, regra: string): Promise<boolean> {
  const c = await contagemIgnorados($)
  return (c[regra] ?? 0) >= CONFIG.vezesIgnorarParaSilenciar
}

async function classificarComHaiku($: API, texto: string): Promise<'simples' | 'medio' | 'complexo' | null> {
  try {
    const r = await $.model.complete({
      model: CONFIG.modelos.leve,
      system:
        'Classifique a complexidade de um pedido feito a um agente de programação. Responda com UMA palavra: simples, medio ou complexo. simples = ajuste pontual, pergunta rápida, leitura. medio = funcionalidade ou correção comum. complexo = arquitetura, segurança, migração, bug difícil, várias partes do sistema.',
      prompt: texto.slice(0, 2000),
      maxTokens: 10,
      effort: 'low',
      timeoutMs: 8000,
    })
    const t = (textoDe(r) ?? '').toLowerCase()
    if (t.includes('simples')) return 'simples'
    if (t.includes('complexo')) return 'complexo'
    if (t.includes('medio') || t.includes('médio')) return 'medio'
  } catch {}
  return null
}

async function assuntoMudou($: API, texto: string): Promise<boolean> {
  try {
    const msgs = (await $.session.messages()) as { role: string; text: string }[]
    const anteriores = msgs.filter(m => m.role === 'user' && m.text).slice(-3)
    if (anteriores.length === 0) return false
    const r = await $.model.complete({
      model: CONFIG.modelos.leve,
      system: 'Responda apenas MESMO ou NOVO: o novo pedido continua o mesmo assunto/tarefa dos pedidos anteriores?',
      prompt: `Pedidos anteriores:\n${anteriores.map(m => '- ' + m.text.slice(0, 300)).join('\n')}\n\nNovo pedido:\n${texto.slice(0, 600)}`,
      maxTokens: 5,
      effort: 'low',
      timeoutMs: 8000,
    })
    return /NOVO/i.test(textoDe(r) ?? '')
  } catch {
    return false
  }
}

type Achado = { regra: string; pergunta: string; opcoes: { rotulo: string; acao: string }[] }

async function avaliar($: API, texto: string): Promise<Achado | null> {
  const ctx = ultimoUso?.context?.percent ?? 0
  const M = CONFIG.modelos
  const nova = { rotulo: 'Nova sessão com resumo', acao: 'novaSessao' }
  const compactar = { rotulo: 'Compactar e seguir', acao: 'compactar' }

  // 1. Contexto quase cheio
  if (ctx >= CONFIG.contextoCompactar) {
    const novo = CONFIG.usarHaikuParaClassificar ? await assuntoMudou($, texto) : false
    return {
      regra: 'contexto cheio',
      pergunta: novo
        ? `Contexto em ${ctx}% e o assunto parece novo. Começar do zero com um resumo é melhor que compactar. O que prefere?`
        : `Contexto em ${ctx}%. Compactar agora evita que o Claude perca o fio no meio da tarefa. O que prefere?`,
      opcoes: novo ? [nova, compactar] : [compactar, nova],
    }
  }

  // 2. Assunto novo numa conversa já grande
  if (ctx >= CONFIG.contextoChecarAssunto && CONFIG.usarHaikuParaClassificar && (await assuntoMudou($, texto))) {
    return {
      regra: 'assunto novo',
      pergunta: `O assunto parece novo e a conversa já está em ${ctx}%. Misturar assuntos deixa o Claude mais lento e confuso. Abrir sessão nova com resumo?`,
      opcoes: [nova],
    }
  }

  let nivel = nivelHeuristico(texto)
  if (nivel === 'medio' && CONFIG.usarHaikuParaClassificar && texto.length >= 60)
    nivel = (await classificarComHaiku($, texto)) ?? 'medio'

  // 3. Pedido grande e vago → plano primeiro
  if (nivel !== 'simples' && pareceVago(texto)) {
    return {
      regra: 'pedido vago',
      pergunta: 'O pedido é grande e pouco detalhado. Pedir um plano curto primeiro (você aprova antes de executar)?',
      opcoes: [{ rotulo: 'Plano primeiro', acao: 'plano' }],
    }
  }

  // 4. Limite do plano perto do fim
  const lim = maiorLimite(ultimoUso)
  if (lim && lim.percentUsed >= CONFIG.limitePlanoAlerta && pesado(ultimoModelo) && nivel !== 'complexo') {
    const hora = fmtHora(lim.resetsAt)
    return {
      regra: 'limite do plano',
      pergunta: `Você já usou ${lim.percentUsed}% do limite (${nomeLimite(lim.kind)}${hora ? ', renova às ' + hora : ''}). Rodar este pedido num modelo mais leve?`,
      opcoes: [
        { rotulo: `Usar ${M.medio} neste pedido`, acao: 'modelo:' + M.medio },
        { rotulo: `Usar ${M.leve} neste pedido`, acao: 'modelo:' + M.leve },
      ],
    }
  }

  // 5. Modelo inadequado para o tamanho do pedido
  if (nivel === 'simples' && pesado(ultimoModelo)) {
    return {
      regra: 'modelo pesado para pedido simples',
      pergunta: `Pedido simples rodando no ${familia(ultimoModelo)}. O ${M.leve} resolve mais rápido e gasta bem menos. Trocar só neste pedido?`,
      opcoes: [{ rotulo: `Usar ${M.leve} neste pedido`, acao: 'modelo:' + M.leve }],
    }
  }
  if (nivel === 'complexo' && familia(ultimoModelo) === 'haiku') {
    const forte = CONFIG.sugerirFable && texto.length > 600 ? M.maximo : M.forte
    return {
      regra: 'modelo leve para pedido complexo',
      pergunta: `Pedido complexo rodando no haiku, que tende a errar nesse tipo de tarefa. Trocar só neste pedido? (a primeira resposta sai um pouco mais cara por perder o cache)`,
      opcoes: [{ rotulo: `Usar ${forte} neste pedido`, acao: 'modelo:' + forte }],
    }
  }
  if (nivel === 'complexo' && familia(ultimoModelo) === 'sonnet' && /(seguran|\brls\b|polic(y|ies)|arquitetur|migra)/i.test(texto)) {
    return {
      regra: 'segurança no sonnet',
      pergunta: 'Pedido de segurança/arquitetura. O opus é mais confiável nisso. Trocar só neste pedido?',
      opcoes: [{ rotulo: `Usar ${M.forte} neste pedido`, acao: 'modelo:' + M.forte }],
    }
  }
  return null
}

async function gerarPassagem($: API, pendente: string | null): Promise<string | null> {
  const pedido =
    'Escreva uma PASSAGEM DE BASTÃO em markdown, em português do Brasil, para uma sessão nova continuar este trabalho sem perder nada. ' +
    'Seções: ## Objetivo; ## O que já foi feito (com os arquivos alterados); ## Decisões tomadas; ## O que falta (lista); ## Cuidados e armadilhas; ## Comandos úteis. Seja objetivo e concreto.' +
    (usuario ? `\nQuem está usando: ${usuario}.` : '') +
    (pendente ? `\nTermine com a seção "## Pedido pendente" contendo exatamente este texto:\n${pendente}` : '')
  let txt: string | null = null
  try {
    txt = textoDe(await $.model.fork({ prompt: pedido }))
  } catch {}
  if (!txt) {
    try {
      const msgs = (await $.session.messages()) as { role: string; text: string }[]
      txt = textoDe(
        await $.model.complete({ model: CONFIG.modelos.medio, prompt: resumoMensagens(msgs, 40) + '\n\n' + pedido, maxTokens: 4000, timeoutMs: 120000 }),
      )
    } catch {}
  }
  if (!txt) return null
  const conteudo = `# Resumo para continuar\n\n_Gerado pelo Copiloto em ${new Date().toLocaleString('pt-BR')}_\n\n${txt}\n`
  for (const caminho of [CONFIG.arquivoPassagem, 'RESUMO.md']) {
    try {
      await $.fs.write(caminho, conteudo)
      return caminho
    } catch {}
  }
  return null
}

async function compactarEReenviar($: API, texto: string) {
  try {
    await $.session.compact({})
  } catch {
    $.ui.toast('Copiloto: não consegui compactar sozinho. Digite /compact e envie seu pedido de novo (ele já está na caixa).', { timeoutMs: 10000 })
    try {
      await $.prompt.fill({ text: texto })
    } catch {}
    return
  }
  pularProximaRevisao = true
  await atualizarUso($)
  await $.prompt.submit({ text: texto, asUser: true })
}

async function novaSessaoComResumo($: API, texto: string | null) {
  $.ui.toast('Copiloto: gerando o resumo para a sessão nova…', { timeoutMs: 6000 })
  const caminho = await gerarPassagem($, texto)
  if (!caminho) {
    $.ui.toast('Copiloto: não consegui gerar o resumo. Seu pedido voltou para a caixa.', { timeoutMs: 8000 })
    if (texto)
      try {
        await $.prompt.fill({ text: texto })
      } catch {}
    return
  }
  $.ui.log(`📝 Copiloto: resumo salvo em ${caminho}`)
  const continuar = `Leia o arquivo ${caminho} e continue o trabalho a partir dele${texto ? ', começando pelo pedido pendente' : ''}.`
  try {
    await $.command.run({ command: 'clear' })
    pularProximaRevisao = true
    await $.prompt.submit({ text: continuar, asUser: true })
  } catch {
    $.ui.log(`Copiloto: para continuar, digite /clear e depois envie: ${continuar}`)
  }
}

async function responderLateral($: API, pergunta: string, comContexto: boolean): Promise<string> {
  const instr =
    'Responda em português do Brasil, curto e direto (até 12 linhas). Esta é uma PERGUNTA LATERAL feita enquanto a tarefa principal continua: ' +
    'não execute nada e não proponha alterar arquivos agora, apenas responda. Se a resposta depender do término da tarefa em andamento, diga isso e adiante o que já der.' +
    (usuario ? ` Quem pergunta: ${usuario}.` : '')
  let txt: string | null = null
  if (comContexto) {
    try {
      txt = textoDe(await $.model.fork({ prompt: instr + '\n\nPergunta: ' + pergunta }))
    } catch {}
    if (!txt) {
      try {
        const msgs = (await $.session.messages()) as { role: string; text: string }[]
        txt = textoDe(
          await $.model.complete({
            model: CONFIG.modelos.medio,
            system: instr,
            prompt: 'Conversa recente:\n' + resumoMensagens(msgs, 12) + '\n\nPergunta: ' + pergunta,
            maxTokens: 900,
            timeoutMs: 90000,
          }),
        )
      } catch {}
    }
  } else {
    try {
      txt = textoDe(await $.model.complete({ model: CONFIG.modelos.leve, system: instr, prompt: pergunta, maxTokens: 900, timeoutMs: 60000 }))
    } catch {}
  }
  return txt ?? 'Não consegui responder agora. Tente de novo em instantes.'
}

async function avisarFim($: API, ms: number) {
  const texto = `Tarefa concluída em ${fmtTempo(ms)}`
  let enviado = false
  try {
    const r = await $.ui.notify(texto, { title: 'Copiloto' })
    enviado = !!(r && r.isSent)
  } catch {}
  if (!enviado) $.ui.toast(`✅ ${texto}`, { timeoutMs: 8000 })
  if (CONFIG.falarAoTerminar)
    try {
      await $.audio.speak('Tarefa concluída')
    } catch {}
}

async function decidirCirculo($: API, descricao: string, chave: string): Promise<{ deny: string } | null> {
  if (jaPerguntado[chave]) return null
  jaPerguntado[chave] = true
  alertasSessao.push(descricao)
  const r = await perguntar($, `Copiloto: ${descricao} O Claude pode estar andando em círculos. O que fazer?`, [
    'Deixar continuar',
    'Pedir outra abordagem',
    'Parar a tarefa',
  ])
  if (r === 'Pedir outra abordagem')
    return {
      deny:
        'O usuário interrompeu esta ação: você está repetindo a mesma coisa sem resolver. Pare, explique em até 3 linhas o que tentou e por que não funcionou, e proponha uma abordagem diferente antes de continuar.',
    }
  if (r === 'Parar a tarefa') {
    try {
      await $.turn.abort({ turnId: turnoAtual })
    } catch {}
    return { deny: 'Tarefa interrompida pelo usuário.' }
  }
  return null
}

async function definirUsuario($: API, novo: Usuario) {
  usuario = novo
  try {
    const mapa = ((await $.store.get('usuarioPorPasta')) as Record<string, string> | undefined) ?? {}
    if (pastaAtual) {
      mapa[pastaAtual] = novo
      await $.store.set('usuarioPorPasta', mapa)
    }
  } catch {}
  redesenhar($)
}

async function perfilDe($: API, nome: Usuario): Promise<string> {
  try {
    const raiz = String($.plugin.root).replace(/[\\/]+$/, '')
    const txt = await $.fs.read(`${raiz}/perfis/${nome}.md`)
    return typeof txt === 'string' ? txt.trim() : ''
  } catch {
    return ''
  }
}

// Decide quem está usando antes de enviar; pergunta na dúvida
async function identificar($: API, texto: string) {
  const dito = nomeNoTexto(texto)
  if (dito) {
    if (dito !== usuario) await definirUsuario($, dito)
    return
  }
  const palpite = palpiteAssunto(texto)
  const confere =
    usuario !== null &&
    (palpite === null || palpite === usuario || (palpite === 'FILHO' && (usuario === 'MATEUS' || usuario === 'MARINA')))
  if (confere) return

  let pergunta: string
  let opcoes: string[]
  if (usuario === null) {
    pergunta =
      palpite === 'FILHO'
        ? 'Assunto de estudos. Quem está usando: MATEUS ou MARINA?'
        : palpite
          ? `Parece assunto de ${palpite}. Quem está usando?`
          : 'Quem está usando o Claude agora?'
  } else {
    pergunta = palpite === 'FILHO' ? `Assunto de estudos, mas está marcado ${usuario}. Quem está usando?` : `Parece assunto de ${palpite}, mas está marcado ${usuario}. Quem está usando?`
  }
  if (palpite === 'FILHO') opcoes = ['MATEUS', 'MARINA', 'ALEX', 'CAROL']
  else if (palpite) opcoes = [palpite, ...USUARIOS.filter(u => u !== palpite)]
  else opcoes = [...USUARIOS]

  const resposta = await perguntar($, pergunta, opcoes)
  const escolhido = resposta ? lerNome(resposta) : null
  if (escolhido) await definirUsuario($, escolhido)
}

function redesenhar($: API) {
  $.ui.invalidate('ui.render')
}

async function linhasPainel($: API): Promise<string[]> {
  const c = ultimoUso?.context
  const linhas = [`Quem está usando: ${usuario ?? 'não definido (botão 👤)'}`]
  if (c) linhas.push(`Contexto: ${(c.tokens ?? 0).toLocaleString('pt-BR')} de ${c.window.toLocaleString('pt-BR')} tokens (${c.percent ?? 0}%)`)
  linhas.push(`Modelo: ${ultimoModelo}`)
  for (const l of ultimoUso?.rateLimits ?? []) {
    const hora = fmtHora(l.resetsAt)
    linhas.push(`Limite ${nomeLimite(l.kind)}: ${l.percentUsed}%${hora ? ' (renova ' + hora + ')' : ''}`)
  }
  if (ultimoUso?.cost) linhas.push(`Custo equivalente em API nesta sessão: US$ ${ultimoUso.cost.usd.toFixed(2)}`)
  if (ultimoTurnoMs) linhas.push(`Último pedido: ${fmtTempo(ultimoTurnoMs)}`)
  linhas.push(`Alertas de círculo: ${alertasSessao.length ? alertasSessao.join(' | ') : 'nenhum'}`)
  const ign = await contagemIgnorados($)
  const silenciadas = Object.keys(ign).filter(k => (ign[k] ?? 0) >= CONFIG.vezesIgnorarParaSilenciar)
  linhas.push(`Especialista: ${CONFIG.especialistaLigado && !silencioSessao ? 'ligado' : 'desligado'}${silenciadas.length ? ' · silenciadas: ' + silenciadas.join(', ') : ''}`)
  return linhas
}

async function alternarPainel($: API) {
  if (painelAberto) {
    painelAberto = false
    try {
      await $.ui.close({ id: PAINEL })
    } catch {}
    return
  }
  painelAberto = true
  painelCache = await linhasPainel($)
  try {
    await $.ui.open({ id: PAINEL, title: 'Copiloto' })
  } catch {}
}

// Põe "/p ", "/ideia " etc. na caixa de mensagem, mantendo o que já estava escrito
async function preencher($: API, prefixo: string) {
  let rascunho = ''
  try {
    rascunho = (await $.prompt.read()).text
  } catch {}
  const limpo = rascunho.replace(/^\/(p|pg|ideia|melhorar)\s+/, '')
  let ok = false
  try {
    ok = (await $.prompt.fill({ text: prefixo + limpo, mode: 'replace' })).isFilled
  } catch {}
  if (!ok) $.ui.toast(`Copiloto: digite ${prefixo.trim()} e sua mensagem na caixa.`)
}

async function escolherUsuario($: API) {
  const r = await perguntar($, `Quem está usando o Claude agora? (marcado: ${usuario ?? 'ninguém'})`, [...USUARIOS])
  const escolhido = r ? lerNome(r) : null
  if (escolhido) {
    await definirUsuario($, escolhido)
    perfisEnviados = {}
    $.ui.toast(`Copiloto: agora é ${escolhido}`)
  }
}

function alternarEspecialista($: API) {
  silencioSessao = !silencioSessao
  $.ui.toast(silencioSessao ? 'Copiloto: especialista desligado nesta sessão' : 'Copiloto: especialista ligado')
  redesenhar($)
}

async function botaoResumo($: API) {
  $.ui.toast('Copiloto: gerando o resumo…', { timeoutMs: 6000 })
  const caminho = await gerarPassagem($, null)
  if (!caminho) {
    $.ui.toast('Copiloto: não consegui gerar o resumo agora.')
    return
  }
  $.ui.log(`📝 Resumo salvo em ${caminho}. Para continuar numa sessão nova: /clear e depois "Leia ${caminho} e continue o trabalho a partir dele."`)
}

function raizDoMod($: API): string {
  return String($.plugin.root).replace(/[\\/]+$/, '')
}

async function anotarIdeia($: API, texto: string): Promise<boolean> {
  const caminho = `${raizDoMod($)}/${CONFIG.arquivoIdeias}`
  let atual = ''
  try {
    const t = await $.fs.read(caminho)
    if (typeof t === 'string') atual = t
  } catch {}
  if (!atual.trim()) atual = '# Ideias para o Copiloto\n\n'
  if (!atual.endsWith('\n')) atual += '\n'
  const projeto = pastaAtual.split(/[\\/]/).pop() || '?'
  const linha = `- [ ] ${new Date().toLocaleString('pt-BR')} · ${usuario ?? '?'} · ${projeto}: ${texto}\n`
  try {
    await $.fs.write(caminho, atual + linha)
    return true
  } catch {
    return false
  }
}

async function abrirMelhoria($: API, texto: string): Promise<string> {
  const raiz = raizDoMod($)
  const ctx = ultimoUso?.context?.percent
  const conteudo = [
    '# Melhoria pendente do Copiloto',
    '',
    `_Pedido em ${new Date().toLocaleString('pt-BR')} por ${usuario ?? '?'}_`,
    '',
    '## O que mudar',
    texto,
    '',
    '## O que estava acontecendo na sessão de origem',
    `- Pasta: ${pastaAtual}`,
    `- Modelo: ${ultimoModelo}`,
    `- Contexto: ${typeof ctx === 'number' ? ctx + '%' : '?'}`,
    `- Alertas de círculo: ${alertasSessao.length ? alertasSessao.join(' | ') : 'nenhum'}`,
    '',
    '## Como trabalhar',
    `- Leia também ${CONFIG.arquivoIdeias} (ideias anotadas).`,
    '- Use a skill plugin-authoring.',
    '- Mostre o plano e peça aprovação antes de alterar.',
    '- Ao terminar, rode `claude plugin validate .` e `claude plugin test .` e só conclua com tudo passando.',
    `- Ao concluir, marque a ideia correspondente em ${CONFIG.arquivoIdeias} e apague este arquivo.`,
    '',
  ].join('\n')
  try {
    await $.fs.write(`${raiz}/${CONFIG.arquivoMelhoria}`, conteudo)
  } catch {
    return 'Não consegui salvar o pedido de melhoria.'
  }
  // Sem acentos nem aspas: a instrução passa pelo terminal
  const instrucao = `Leia ${CONFIG.arquivoMelhoria} nesta pasta e faca a melhoria pedida no mod Copiloto. Responda em portugues.`
  const windows = /^[a-z]:[\\/]/i.test(raiz)
  const argv = windows
    ? [
        'powershell',
        '-NoProfile',
        '-Command',
        `Start-Process -FilePath cmd.exe -WorkingDirectory '${raiz.replace(/'/g, "''")}' -ArgumentList '/k', 'claude "${instrucao}"'`,
      ]
    : ['osascript', '-e', `tell application "Terminal" to do script "cd '${raiz}' && claude '${instrucao}'"`, '-e', 'tell application "Terminal" to activate']
  try {
    const r = await $.process.run(argv)
    if (r.exitCode !== 0) throw new Error(r.stderr)
    return 'Abri uma janela nova para melhorar o Copiloto. Quando ela terminar, o mod recarrega aqui sozinho e sua conversa continua.'
  } catch {
    return `Pedido salvo em ${CONFIG.arquivoMelhoria}. Não consegui abrir a janela: abra um terminal em ${raiz} e rode: claude "${instrucao}"`
  }
}

// ---------------------------------------------------------------------
//  REGISTRO DOS GANCHOS
// ---------------------------------------------------------------------
export const register: Register = on => {
  // Início da sessão: comandos, relógios e checagem de pasta
  on('session.start', async ($, e, next) => {
    try {
      pastaAtual = await $.session.cwd()
    } catch {}
    // quem usou esta pasta da última vez, ou o nome na própria pasta
    try {
      const mapa = ((await $.store.get('usuarioPorPasta')) as Record<string, string> | undefined) ?? {}
      const salvo = mapa[pastaAtual]
      usuario = salvo && (USUARIOS as readonly string[]).includes(salvo) ? (salvo as Usuario) : nomeNaPasta(pastaAtual)
    } catch {
      usuario = nomeNaPasta(pastaAtual)
    }

    // Regra C:\Dev e OneDrive
    const naOneDrive = /onedrive/i.test(pastaAtual)
    const windowsForaDev = /^[a-z]:\\/i.test(pastaAtual) && !pastaAtual.toLowerCase().startsWith(CONFIG.pastaDevWindows.toLowerCase())
    if (!avisouPasta && (naOneDrive || windowsForaDev)) {
      avisouPasta = true
      $.ui.toast(
        naOneDrive
          ? 'Copiloto: esta pasta está no OneDrive. Projetos com código devem ficar em C:\\Dev (sua regra).'
          : 'Copiloto: esta pasta está fora de C:\\Dev. Se for projeto com código, mova para C:\\Dev.',
        { timeoutMs: 10000 },
      )
    }

    // Relógios: cronômetro do spinner (1 s) e linha de status (15 s)
    $.clock.every(1000, () => {
      if (trabalhando) $.ui.invalidate('ui.render')
    })
    $.clock.every(15000, async () => {
      await atualizarUso($)
    })
    await atualizarUso($)

    // Comandos (cada um protegido, para um nome recusado não derrubar os outros)
    try {
      await $.command.register({ name: 'p', description: 'Copiloto: pergunta lateral com o contexto da tarefa (não interrompe)', argumentHint: '<sua pergunta>', immediate: true })
    } catch {}
    try {
      await $.command.register({ name: 'pg', description: 'Copiloto: pergunta geral rápida no Haiku (sem contexto, barata)', argumentHint: '<sua pergunta>', immediate: true })
    } catch {}
    try {
      await $.command.register({ name: 'painel', description: 'Copiloto: abre ou fecha o painel detalhado', immediate: true })
    } catch {}
    try {
      await $.command.register({ name: 'resumo', description: 'Copiloto: salva um resumo para continuar numa sessão nova', immediate: true })
    } catch {}
    try {
      await $.command.register({ name: 'ideia', description: 'Copiloto: anota uma ideia de melhoria do Copiloto', argumentHint: '<ideia>', immediate: true })
    } catch {}
    try {
      await $.command.register({ name: 'melhorar', description: 'Copiloto: abre uma janela paralela para melhorar o Copiloto', argumentHint: '<o que mudar>', immediate: true })
    } catch {}
    try {
      await $.command.register({ name: 'quem', description: 'Copiloto: define quem está usando (ALEX, CAROL, MATEUS, MARINA)', argumentHint: '[nome]', immediate: true })
    } catch {}
    try {
      await $.command.register({ name: 'copiloto', description: 'Copiloto: ligar, desligar ou resetar as sugestões', argumentHint: 'on | off | reset', immediate: true })
    } catch {}
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    // /clear: começa uma conversa nova, mantém quem está usando
    edicoes = {}
    falhas = {}
    jaPerguntado = {}
    tarefas = { feitas: 0, total: 0 }
    perfisEnviados = {}
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const r = await next(e)
    await atualizarUso($)
    return r
  })

  // Antes de enviar: quem está usando + especialista
  on('prompt.submit', async ($, e, next) => {
    const texto = (e.text || '').trim()
    if (e.command || e.isMeta) return next(e) // comandos e mensagens internas passam direto
    if (pularProximaRevisao) {
      pularProximaRevisao = false
      return next(e)
    }
    if (trabalhando || e.turnId) return next(e) // complemento durante a tarefa: não atrapalha

    // 1. Quem está usando
    if (!ehContinuacao(texto)) await identificar($, texto)
    const contexto = [...(e.context ?? [])]
    if (usuario && !perfisEnviados[usuario]) {
      perfisEnviados[usuario] = true
      const perfil = await perfilDe($, usuario)
      contexto.push(
        `[Copiloto] Esta conta do Claude é compartilhada por ALEX, CAROL, MATEUS e MARINA. Quem está usando agora: ${usuario}. Trate o pedido como sendo dessa pessoa.` +
          (perfil ? `\nPerfil e preferências de ${usuario}:\n${perfil}` : ''),
      )
    }
    const seguir = () => next({ ...e, context: contexto })

    // 2. Especialista
    if (!CONFIG.especialistaLigado || silencioSessao || ehContinuacao(texto)) return seguir()
    await atualizarUso($)
    const achado = await avaliar($, texto)
    if (!achado || (await regraSilenciada($, achado.regra))) return seguir()

    const rotulos = [...achado.opcoes.map(o => o.rotulo), 'Seguir assim', 'Não perguntar mais nesta sessão'].slice(0, 4)
    const escolha = await perguntar($, `Copiloto: ${achado.pergunta}`, rotulos)
    const opcao = achado.opcoes.find(o => o.rotulo === escolha)

    if (!opcao) {
      if (escolha === 'Não perguntar mais nesta sessão') silencioSessao = true
      else if (escolha === 'Seguir assim') await registrarIgnorado($, achado.regra)
      return seguir()
    }
    if (opcao.acao === 'plano') {
      contexto.push('[Copiloto] Antes de executar, apresente um plano curto (etapas, arquivos afetados, riscos) e aguarde a aprovação do usuário.')
      return seguir()
    }
    if (opcao.acao.startsWith('modelo:')) {
      modeloDaVez = opcao.acao.slice('modelo:'.length)
      $.ui.toast(`Copiloto: este pedido vai rodar no ${modeloDaVez}`)
      return seguir()
    }
    if (opcao.acao === 'compactar') {
      const original = e.text
      $.clock.after(300, async () => {
        await compactarEReenviar($, original)
      })
      return { drop: 'Copiloto: compactando a conversa; seu pedido será reenviado em seguida.' }
    }
    if (opcao.acao === 'novaSessao') {
      const original = e.text
      $.clock.after(300, async () => {
        await novaSessaoComResumo($, original)
      })
      return { drop: 'Copiloto: gerando resumo e abrindo sessão nova; seu pedido segue junto.' }
    }
    return seguir()
  })

  // Acompanhamento do pedido
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      trabalhando = true
      turnoAtual = e.turnId
      inicioTurno = Date.now()
      tarefas = { feitas: 0, total: 0 }
      edicoes = {}
      falhas = {}
      jaPerguntado = {}
      redesenhar($)
    }
    return next(e)
  })

  // Troca de modelo só para este pedido
  on('turn.step', async function* ($, e, next) {
    if (modeloDaVez && e.agentId === undefined) {
      const escolhido = modeloDaVez
      try {
        return yield* next({ ...e, model: escolhido })
      } catch {
        modeloDaVez = null
        $.ui.toast(`Copiloto: não consegui usar o ${escolhido}. Segui com o modelo da sessão.`, { timeoutMs: 8000 })
        return yield* next(e)
      }
    }
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined) return r
    trabalhando = false
    modeloDaVez = null
    ultimoTurnoMs = e.durationMs || Date.now() - inicioTurno
    await atualizarUso($)
    if (!e.isAborted && ultimoTurnoMs >= CONFIG.avisarAoTerminarSeg * 1000) await avisarFim($, ultimoTurnoMs)
    if (ultimoTurnoMs < CONFIG.linhaResumoAcimaDeSeg * 1000) return r
    const u = e.usage as Record<string, unknown> | undefined
    let tokens = 0
    if (u)
      for (const k of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) {
        const v = u[k]
        if (typeof v === 'number') tokens += v
      }
    const partes = [`⏱ ${fmtTempo(ultimoTurnoMs)}`]
    if (tokens > 0) partes.push(`${Math.round(tokens / 1000)}k tokens`)
    if (tarefas.total > 0) partes.push(`${tarefas.feitas}/${tarefas.total} tarefas`)
    const ctx = ultimoUso?.context?.percent
    if (typeof ctx === 'number') partes.push(`contexto ${ctx}%`)
    return { ...r, text: `Copiloto: ${partes.join(' · ')}` }
  })

  // Progresso pela lista de tarefas do Claude
  on('tool.call', { tool: ['TodoWrite', 'TaskCreate', 'TaskUpdate'] }, async ($, e, next) => {
    const r = await next(e)
    const x = e as unknown as { tool: string; todos?: { status?: string }[]; status?: string }
    if (x.tool === 'TodoWrite' && Array.isArray(x.todos)) {
      tarefas = { total: x.todos.length, feitas: x.todos.filter(t => t.status === 'completed').length }
    } else if (x.tool === 'TaskCreate') {
      tarefas = { ...tarefas, total: tarefas.total + 1 }
    } else if (x.tool === 'TaskUpdate' && x.status === 'completed') {
      tarefas = { ...tarefas, feitas: Math.min(tarefas.total, tarefas.feitas + 1) }
    }
    $.ui.invalidate('ui.render')
    return r
  })

  // Detector de círculos: o mesmo arquivo editado muitas vezes
  on('tool.call', { tool: /^(Edit|Write|MultiEdit|NotebookEdit)$/ }, async ($, e, next) => {
    const x = e as unknown as { file_path?: string; notebook_path?: string }
    const arquivo = x.file_path ?? x.notebook_path ?? '?'
    edicoes[arquivo] = (edicoes[arquivo] ?? 0) + 1
    if (edicoes[arquivo] === CONFIG.editarMesmoArquivoLimite) {
      const nome = arquivo.split(/[\\/]/).pop()
      const decisao = await decidirCirculo($, `o Claude já editou ${nome} ${edicoes[arquivo]} vezes neste pedido.`, 'ed:' + arquivo)
      if (decisao) return decisao
    }
    return next(e)
  })

  // Detector de círculos: o mesmo comando falhando várias vezes
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const chave = String(e.command ?? '').trim().slice(0, 120)
    if ((falhas[chave] ?? 0) >= CONFIG.mesmoErroLimite) {
      const decisao = await decidirCirculo($, `este comando já falhou ${falhas[chave]} vezes: ${chave.slice(0, 60)}`, 'cmd:' + chave)
      if (decisao) return decisao
    }
    const r = await next(e)
    if (r && r.deny === undefined && r.isError === true) falhas[chave] = (falhas[chave] ?? 0) + 1
    return r
  })

  // Cronômetro e progresso ao lado do "Thinking…"
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (!trabalhando) return next(e)
    const original = typeof e.props.suffix === 'string' ? e.props.suffix : ''
    return next({ ...e, props: { ...e.props, suffix: original + sufixoSpinner() } })
  })

  // ---------------- COMANDOS ----------------
  on('command.run', { command: 'p' }, async ($, e) => {
    const pergunta = e.args.trim()
    if (!pergunta) return { text: 'Uso: /p <sua pergunta>. Responde sem interromper a tarefa em andamento.' }
    $.ui.toast('Copiloto: pensando na sua pergunta…')
    const resposta = await responderLateral($, pergunta, true)
    $.ui.log(`💬 ${pergunta}\n${resposta}`)
    return {}
  })

  on('command.run', { command: 'pg' }, async ($, e) => {
    const pergunta = e.args.trim()
    if (!pergunta) return { text: 'Uso: /pg <sua pergunta>. Pergunta geral rápida, sem o contexto da tarefa.' }
    const resposta = await responderLateral($, pergunta, false)
    $.ui.log(`💬 ${pergunta}\n${resposta}`)
    return {}
  })

  on('command.run', { command: 'painel' }, async $ => {
    await atualizarUso($)
    await alternarPainel($)
    return {}
  })

  on('command.run', { command: 'resumo' }, async $ => {
    await botaoResumo($)
    return {}
  })

  on('command.run', { command: 'ideia' }, async ($, e) => {
    const texto = e.args.trim()
    if (!texto) return { text: 'Uso: /ideia <sua ideia para o Copiloto>' }
    const ok = await anotarIdeia($, texto)
    $.ui.toast(ok ? '💡 Ideia anotada' : 'Copiloto: não consegui anotar a ideia')
    return {}
  })

  on('command.run', { command: 'melhorar' }, async ($, e) => {
    const texto = e.args.trim()
    if (!texto) return { text: 'Uso: /melhorar <o que mudar no Copiloto>' }
    return { text: await abrirMelhoria($, texto) }
  })

  // ---------------- FAIXA DE BOTÕES ----------------
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !CONFIG.mostrarFaixa) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const largo = e.props.bodyColumns >= CONFIG.faixaLargaAPartirDe
    const rotulo = (icone: string, nome: string) => (largo ? `${icone} ${nome}` : icone)
    const especLigado = CONFIG.especialistaLigado && !silencioSessao
    return (
      <Box flexDirection="column">
        <Text dimColor>{linhaStatus()}</Text>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          <Button key="usuario" hotkey="1" label={`👤 ${usuario ?? '?'}`} onPress={() => void escolherUsuario($)} />
          <Button key="perguntar" hotkey="2" label={rotulo('❓', 'Perguntar')} onPress={() => void preencher($, '/p ')} />
          <Button key="painel" hotkey="3" label={rotulo('📊', 'Painel')} onPress={() => void alternarPainel($)} />
          <Button key="resumo" hotkey="4" label={rotulo('📝', 'Resumo')} onPress={() => void botaoResumo($)} />
          <Button key="especialista" hotkey="5" label={rotulo(especLigado ? '🔔' : '🔕', 'Especialista')} onPress={() => alternarEspecialista($)} />
          <Button key="ideia" hotkey="6" label={rotulo('💡', 'Ideia')} onPress={() => void preencher($, '/ideia ')} />
          <Button key="melhorar" hotkey="7" label={rotulo('🛠', 'Melhorar')} onPress={() => void preencher($, '/melhorar ')} />
        </Box>
      </Box>
    )
  })

  // Painel detalhado (botão 📊)
  on('ui.render', { component: 'Pane', requestId: PAINEL }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {painelCache.map(l => (
          <Text>{l}</Text>
        ))}
        <Button key="fechar" role="dismiss" label="Fechar" onPress={() => void alternarPainel($)} />
      </Box>
    )
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PAINEL) painelAberto = false
    return next(e)
  })

  on('command.run', { command: 'quem' }, async ($, e) => {
    const nome = lerNome(e.args)
    if (nome) {
      await definirUsuario($, nome)
      perfisEnviados = {}
      return { text: `Quem está usando agora: ${nome}.` }
    }
    const r = await perguntar($, `Quem está usando o Claude agora? (marcado: ${usuario ?? 'ninguém'})`, [...USUARIOS])
    const escolhido = r ? lerNome(r) : null
    if (escolhido) {
      await definirUsuario($, escolhido)
      perfisEnviados = {}
      return { text: `Quem está usando agora: ${escolhido}.` }
    }
    return {}
  })

  on('command.run', { command: 'copiloto' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off') {
      silencioSessao = true
      return { text: 'Especialista desligado nesta sessão. O painel continua. Para religar: /copiloto on' }
    }
    if (arg === 'on') {
      silencioSessao = false
      return { text: 'Especialista ligado.' }
    }
    if (arg === 'reset') {
      try {
        await $.store.set('ignorados', {})
      } catch {}
      silencioSessao = false
      return { text: 'Todas as sugestões voltaram a aparecer.' }
    }
    return { text: 'Uso: /copiloto on | off | reset' }
  })
}
