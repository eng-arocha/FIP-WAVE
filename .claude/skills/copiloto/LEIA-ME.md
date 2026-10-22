# Copiloto v0.2 — mod do Claude Code

Assistente que acompanha o Claude Code enquanto você trabalha:

- **Faixa com botões** acima da caixa de mensagem, com o status junto:

  ```
  🟢 ctx 42% · ⚙️ opus · 📈 plano 31% (5h, renova 14:00) · ⏱ último 1:20
  [👤 ALEX] [❓ Perguntar] [📊 Painel] [📝 Resumo] [🔔 Especialista] [💡 Ideia] [🛠 Melhorar]
  ```
- **Cronômetro e progresso** ao lado do "Thinking…": `⏱ 2:15 · ✅ 3/7 · ~2 min restantes`
- **Especialista**: antes de enviar um pedido, sugere trocar de modelo, compactar, abrir sessão nova com resumo ou pedir um plano primeiro. No máximo uma pergunta por pedido.
- **Quem está usando**: identifica ALEX / CAROL / MATEUS / MARINA pelo assunto e pergunta na dúvida.
- **Perguntas laterais** enquanto o Claude trabalha (`/p` e `/pg`).
- **Detector de círculos**: avisa quando o Claude repete a mesma edição ou o mesmo erro.
- **Aviso de término** para tarefas longas (notificação e voz).

---

## Instalação (Windows), passo a passo

**1. Confira a versão do Claude Code.** No terminal (PowerShell):

```powershell
claude --version
```

Precisa ser **2.1.287 ou mais nova**. No app Desktop, digite `/status` na aba Code e veja a linha "Claude Code" (precisa ser 2.1.286 ou mais nova). Se for mais antiga, atualize antes de seguir.

**2. Extraia o arquivo** `copiloto.zip` em `C:\Dev\mods\`. Deve ficar assim:

```
C:\Dev\mods\copiloto\
├── .claude-plugin\plugin.json
├── hooks\hooks.json
├── hooks\register.tsx
├── perfis\ALEX.md, CAROL.md, MATEUS.md, MARINA.md
├── tests\copiloto.test.ts
└── LEIA-ME.md
```

**3. Teste uma vez.** Abra o PowerShell na pasta de um projeto seu (ex.: `C:\Dev\orc-pessoal`) e rode:

```powershell
claude --plugin-dir C:\Dev\mods\copiloto
```

Dentro do Claude Code, digite `/plugin`. Deve aparecer a linha `1 mod active · copiloto`.

**4. Deixe ligado sempre (terminal e app Desktop).** Abra o arquivo `%USERPROFILE%\.claude\settings.json` (crie se não existir) e inclua o bloco `env`:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "C:\\Dev\\mods\\copiloto"
  }
}
```

Se o arquivo já tiver outras configurações, adicione só a linha dentro de `"env"`. A partir daí, toda sessão nova carrega o Copiloto, sem precisar do `--plugin-dir`.

**No Mac:** use a pasta que preferir (ex.: `~/Dev/mods/copiloto`) e o mesmo bloco em `~/.claude/settings.json`, com o caminho do Mac.

---

## Botões e comandos

No app Desktop é só clicar. No terminal, com a caixa de mensagem vazia, digite o número do botão e espere um instante (ou clique, se o terminal estiver em tela cheia). A faixa pode ser recolhida no `[-]` à direita.

| Botão | Tecla | O que faz | Comando equivalente |
|---|---|---|---|
| 👤 NOME | 1 | Escolhe quem está usando (ALEX, CAROL, MATEUS, MARINA) | `/quem [nome]` |
| ❓ Perguntar | 2 | Coloca `/p ` na caixa: digite a pergunta e Enter. Responde com o contexto da tarefa, **sem interromper** o Claude | `/p <pergunta>` |
| 📊 Painel | 3 | Abre ou fecha o painel detalhado ao lado da conversa | `/painel` |
| 📝 Resumo | 4 | Salva um resumo em `.claude/RESUMO.md` para continuar numa sessão nova | `/resumo` |
| 🔔 / 🔕 Especialista | 5 | Liga ou desliga as sugestões nesta sessão | `/copiloto on` · `off` |
| 💡 Ideia | 6 | Coloca `/ideia ` na caixa: anota uma ideia de melhoria em `IDEIAS.md` | `/ideia <ideia>` |
| 🛠 Melhorar | 7 | Coloca `/melhorar ` na caixa: abre **outra janela** que melhora o Copiloto em paralelo | `/melhorar <o que mudar>` |

Outros: `/pg <pergunta>` (pergunta geral rápida no Haiku, sem contexto) e `/copiloto reset` (volta as sugestões silenciadas).

**Complementar a tarefa em andamento:** basta digitar normalmente enquanto o Claude trabalha. O Claude Code coloca a mensagem na fila e ela entra na tarefa atual. Use ❓ quando quiser só uma resposta, sem mexer na tarefa.

---

## Melhorar o Copiloto sem parar o que está fazendo

- **💡 Ideia:** anota em `C:\Dev\mods\copiloto\IDEIAS.md` com data, quem anotou e o projeto. Não abre nada e não gasta uso.
- **🛠 Melhorar:** salva o pedido em `MELHORIA-PENDENTE.md` (com o que estava acontecendo na sessão) e abre uma **janela nova do terminal** com outra sessão do Claude Code na pasta do Copiloto. Lá, o Claude mostra o plano, espera sua aprovação, faz a mudança e roda os testes.
- Quando a outra janela salva os arquivos, **a sessão em que você estava recarrega o Copiloto sozinha**. A conversa continua; só os contadores do Copiloto (cronômetro, alertas) zeram.
- Dica: junte várias ideias e mande um único 🛠 Melhorar ("faça as ideias pendentes de IDEIAS.md"). Gasta menos uso.

⚠️ Se uma melhoria quebrar o Copiloto, ele para de carregar até ser corrigido. Recomendo colocar a pasta `C:\Dev\mods\copiloto` num repositório do GitHub para poder desfazer qualquer mudança.

---

## Quem está usando

- UNIFOR, PEFOCE, farmácia → **CAROL**
- Estudos (vestibular, ENEM, simulados) → **MATEUS** ou **MARINA** (pergunta qual)
- Engenharia, obra → **ALEX**
- Sem pista → pergunta na primeira mensagem da sessão
- Lembra quem usou cada pasta da última vez

Também dá para dizer no texto: "aqui é a Carol, …".

Quando sabe quem é, o Copiloto avisa o Claude e envia o perfil da pessoa, que fica em `perfis\NOME.md`. **Edite esses arquivos** com as preferências de cada um (tom, formato, nível de detalhe).

---

## Ajustar as regras

No topo de `hooks\register.ts` há um bloco `CONFIG` comentado em português: limites de contexto, quantas vezes ignorar até silenciar, tempo para avisar término, voz, modelos etc. Logo abaixo, `SINAIS` tem as palavras que identificam cada pessoa. Salve o arquivo e o mod recarrega sozinho.

---

## O que ainda precisa ser confirmado no uso real

Os testes automáticos passaram (11 de 11), mas algumas coisas só se confirmam numa sessão de verdade. Me conte o que acontecer com:

1. A pergunta do especialista aparecendo **antes** de enviar o pedido.
2. **Compactar e seguir** compactando sozinho e reenviando o pedido.
3. **Nova sessão com resumo** limpando a conversa e continuando pelo resumo.
4. A troca de modelo **só para um pedido** (principalmente o Fable; se não existir no seu plano, mude `sugerirFable` para `false`).
5. A notificação e a voz ao terminar.
6. A faixa de botões: clique no Desktop e as teclas 1–7 no terminal.
7. O 🛠 Melhorar abrindo a janela nova e a sessão atual recarregando sozinha depois.

Se algo falhar, rode `claude --debug --plugin-dir C:\Dev\mods\copiloto` e me mande as linhas que começam com `copiloto:`.
