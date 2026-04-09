@AGENTS.md

# Regras Permanentes do Projeto FIP-WAVE

## REGRA 1 — Migrations SQL
Sempre que criar um arquivo `.sql` de migration:
1. Executar `git add → commit → push` imediatamente
2. Colar o conteúdo SQL completo no chat em bloco de código para o usuário copiar e colar no Supabase SQL Editor — SEMPRE, SEM EXCEÇÃO

Formato obrigatório ao entregar uma migration:

```
✅ Migration criada e enviada para o GitHub.
Cole no Supabase SQL Editor:

```sql
-- conteúdo completo aqui
```
```

## REGRA 2 — Qualquer arquivo novo
Sempre que criar qualquer arquivo novo (`.ts`, `.tsx`, `.sql`, `.json`, etc.):
- Executar `git add → commit → push` imediatamente após criar/editar
- Não esperar o usuário pedir

## REGRA 3 — Nunca misturar projetos
Este projeto é APP-GESTAO-CONTRATO (FIP-WAVE).
NUNCA misturar com APP-GESTAO-OBRAS ou qualquer outro projeto.

## REGRA 4 — Deploy automático (default)
**Por padrão**, sempre que completar um conjunto coeso de alterações em estado estável, executar automaticamente:
1. `git checkout main`
2. `git pull origin main`
3. `git merge <branch-dev> --no-ff -m "<mensagem descrevendo o escopo>"`
4. `git push -u origin main`
5. Voltar para a branch de desenvolvimento
6. Informar o usuário do que foi deployado e onde (commit hash + resumo)

**NÃO fazer deploy automático quando:**
- Há código incompleto (WIP) que ainda precisa ser validado pelo usuário
- O build está quebrado ou há erros conhecidos
- O usuário pediu explicitamente para esperar
- A alteração é puramente experimental / prova de conceito
- Há migration pendente que o usuário ainda não rodou no Supabase e o código dependente não é resiliente

**Considerar "estado estável" quando:**
- Todos os commits locais da dev branch foram pushados
- O build do Next.js passaria (sem erros TS óbvios, sem imports quebrados)
- A feature ou fix está completo e testável em isolamento
- Migration nova, se houver, é idempotente e o código é resiliente à sua ausência

Branch de desenvolvimento: `claude/improve-scrollbar-visibility-MI3PH`
Deploy vai para: `main` → Vercel `fip-wave.vercel.app`
