# Modelo de Medição × Retenção × Faturamento Direto

**Data:** 2026-05-06
**Status:** Design aprovado — aguardando review pra writing-plans
**Contexto:** Refactor do modelo de cálculo de retenção contratual, valor da medição e tratamento do "Material Retido" / "Faturamento Direto em Aberto"

---

## 1. Problema

O sistema atualmente tem **três fórmulas concorrentes** de retenção e dois conceitos de "valor da medição" — cada lugar do código usa uma:

1. `informacon-data.ts` (boletim): `5% × (mat_medido + serv − mat_em_aberto)` = R$ 16.887,41 na MED-001
2. Boletim Informakon (UI): `5% × (wave + nf_terceiro)` = R$ 15.092,16 na MED-001
3. Email de aprovação: usa fórmula 1 mas chama de "base mat + serv"

E o "valor_total" da medição grava `262.922,07` (= soma `qtde × valor_unit_total`, excluindo item 19) — diverge tanto de R$ 338.922 quanto de R$ 301.843, gerando confusão no dashboard.

**Sintoma operacional:**
- Item 19 (Administração Obra) tem qtde=2 meses, valor R$ 76.000 só material. Quando medido, deveria contribuir R$ 3.800 de retenção, mas hoje cai numa zona cinzenta entre "fat-direto" e "medição"
- Retenção do dashboard mostra R$ 0,00 mesmo após MED-001 aprovada
- Pedido Wave #7 saiu pelo bruto (R$ 139.264,86) em vez do líquido — bug retroativo

## 2. Premissas de negócio (definidas pelo usuário neste brainstorm)

- **Retenção contratual = 5% sobre TUDO que é executado** (mat + serv) na obra. Previsto total: R$ 18M × 5% = **R$ 900.000**
- Retenção é **sempre** debitada da NF Wave Serviço — nunca de NF de material/fornecedor terceiro
  - Justificativa: fornecedores não topam reter; é gestão interna FIP/Wave SPE
- Material **não medido (em estoque na obra)** não conta pra retenção
  - Justificativa: já é garantia física; reter financeiramente seria a Wave devendo dinheiro
- Material **medido** entra na base, mesmo que sua NF venha por canal fat-direto (item 19, terceiros)
- Saldo retido acumula no livro-razão durante toda a obra; final do contrato emite **NF Wave SPE de retenção** equivalente ao saldo

## 3. Modelo definitivo

### 3.1 Fórmula única da retenção

```
base_retencao_medicao = Σ (qtde_medida_item × (valor_mat_unit + valor_servico_unit))
                      = mat_medido_total + serv_medido_total

retencao = 5% × base_retencao_medicao
```

Onde:
- `qtde_medida_item` é o que entrou na medição (DELTA, não acumulado)
- Inclui **todos os itens** medidos: serviço (Wave), material (FIP terceiro/fat-direto), admin (item 19)
- Soma o **componente material + componente MO** de cada item

Eliminadas as fórmulas concorrentes 2 e 3.

### 3.2 Valor canônico da medição

`medicoes.valor_total` passa a gravar o `base_retencao_medicao` acima (= mat_medido + serv_medido total).

Consequência: na MED-001, `valor_total` muda de R$ 262.922,07 → R$ 338.922,08.

### 3.3 NF Wave Serviço líquida

```
nf_wave_bruto = Σ (qtde_medida × valor_servico_unit)   [só componente MO]
debito_retencao_aplicado = min(saldo_atual + retencao_credito_desta_medicao, nf_wave_bruto)
nf_wave_liquido = nf_wave_bruto − debito_retencao_aplicado
```

Caso extremo: `retencao > nf_wave_bruto`. Tratamento via `aplicarMovimentoRetencao`:
- Crédito = `5% × base_retencao` (sempre vai ao livro-razão)
- Débito = `min(saldo_após_crédito, nf_wave_bruto)` (limitado ao Wave do mês)
- `nf_wave_liquido = nf_wave_bruto − débito_aplicado` (mín R$ 0)
- O excedente **fica como saldo positivo no livro-razão** — ou seja, a Wave SPE continua devendo retenção. A próxima medição com Wave bruto suficiente abate
- UI da aprovação mostra aviso: *"Wave NF deste mês reduzida a R$ 0; R$ X de retenção pendente abate da próxima medição"*

### 3.4 NFs de material e fat-direto: zero retenção

- NF FIP material (pedido fat-direto auto-criado pela medição) → emitida pelo **valor integral**
- NF fornecedor terceiro (CDP, CARMEHIL, etc.) → lançada pelo valor integral, **não dispara movimento de retenção**
- Movimento no livro-razão **só** acontece em aprovação de medição

### 3.5 "Faturamento Direto em Aberto" (renomeado)

`material_retido` → renomeado pra `faturamento_direto_em_aberto` em todas as superfícies (UI, payload de email, comentários no código).

**Nova semântica:** apenas indicador informativo. Não afeta base de retenção. Mostra "quanto material já foi medido mas a NF do fornecedor ainda não chegou no Informakon".

### 3.6 Item 19 (Administração Obra) e fat-direto comercial

Tratamento idêntico aos demais itens da estrutura — entra na medição **se foi executado**.

- UI da medição lista item 19 normalmente (qtde editável de 0 a 2)
- Quando medido (ex: qtde=1 mês), contribui na base de retenção (5% × R$ 76.000 = R$ 3.800)
- A NF do item 19 será **fat-direto FIP/terceiro** pelo valor integral (R$ 76.000)
- Os R$ 3.800 de retenção saem da NF Wave Serviço (a Wave SPE absorve, não o fornecedor de admin)

## 4. Mudanças de código

### 4.1 Arquivos afetados

| Arquivo | O que muda |
|---|---|
| `lib/db/informacon-data.ts` | `base_retencao` passa a usar fórmula única (mat + serv, sem subtrair em aberto). Renomear campo `material_retido` → `faturamento_direto_em_aberto` |
| `lib/db/retencao.ts` (`aplicarRetencaoDaAprovacao`) | Recebe `base_retencao = mat + serv` direto. Sem fallback de fórmula |
| `app/api/contratos/[id]/medicoes/[medicaoId]/aprovar/route.ts` | Passa `base_retencao` correta. Atualiza cálculo do líquido Wave com tratamento do extremo (Wave NF mín = 0) |
| `app/api/contratos/[id]/medicoes/route.ts` (POST) | Calcula e grava `medicoes.valor_total = mat_medido + serv_medido` (substituindo o cálculo atual) |
| `app/(app)/contratos/[id]/medicoes/[medicaoId]/informacon/page.tsx` | UI do boletim: rename "Material Retido" → "Faturamento Direto em Aberto", remove subtração da base de retenção |
| `lib/email/templates-medicoes.ts` | Email da aprovação alinhado com a nova fórmula. Mostrar wave_bruto, retencao, wave_liquido, e — se houver — excedente acumulado |
| `app/(app)/dashboard/page.tsx` | Card "Medição Física" → renomeado pra "Medição de Serviço". Card Retenção corrige leitura (consulta livro-razão atual). Curva S formata 2 casas decimais |
| `app/(app)/contratos/[id]/retencao/page.tsx` | View "Por Medição" continua, mas valor_medido agora reflete a nova fórmula |

### 4.2 Migrations

Nenhuma estrutural. As tabelas estão OK (`retencao_movimentos`, `medicao_itens`, etc.).

**Backfill (decisão do usuário no review):**

Opção 1 — **Recalcular MED-001 retroativamente**:
- Atualiza `medicoes.valor_total` da MED-001 pra R$ 338.922,08
- Reverte movimento de crédito atual no livro-razão (R$ 16.887,41) e cria novo crédito (R$ 16.946,10)
- Mesma coisa pro débito (R$ 16.887,41 → R$ 16.946,10)
- Atualiza `solicitacoes_fat_direto.valor_total` do pedido Wave #7 pra R$ 122.318,76 (= 139.264,86 − 16.946,10)

Opção 2 — **Manter MED-001 como está, aplicar fórmula nova só de MED-002 em diante**:
- Histórico fica com a fórmula antiga (R$ 16.887,41)
- Novas medições usam fórmula correta
- Diferença de centavos (R$ 58,69) é absorvida na conciliação final

**Recomendo Opção 2** — MED-001 já tem rascunhos #6 e #7 aprovados. Mexer retroativamente vai criar dissonância com a documentação interna que o admin já lançou. R$ 58,69 de diferença é imaterial. **Mas o usuário decide no review da spec.**

## 5. Casos de borda

### 5.1 Aprovação desfeita
- Reversão dos movimentos de retenção (já existe lógica em `retencao.ts` via `reversao_credito` / `reversao_debito`)
- Mantém histórico imutável

### 5.2 Ajuste do admin (medicao_item_ajustes)
- Quando admin altera qtde_medida via fluxo de "ajuste durante aprovação" (migration 061), recalcula a base_retencao com a nova qtde antes de aplicar movimento
- Já está implementado, só confirma alinhamento com fórmula nova

### 5.3 Item com qtde=0 medido (= não foi executado)
- Não entra na base de retenção
- Não aparece na NF Wave nem no fat-direto

### 5.4 Wave bruto = R$ 0 (medição só de material/admin)
- Retenção continua acumulando no livro-razão como saldo positivo
- Wave NF do mês: R$ 0 (não emite)
- Próxima medição com Wave > 0 abate

### 5.5 Item 19 medido sozinho (sem outros itens)
- base_retencao = R$ 76.000, retencao = R$ 3.800
- nf_wave_bruto = R$ 0, nf_wave_liquido = R$ 0
- Saldo de retenção sobe R$ 3.800 (acumula pra próxima)

## 6. Bugs simples (paralelos, fora do refactor de modelo)

Implementados antes ou depois, sem dependência:

1. Card Retenção do dashboard mostra R$ 0,00 → leitura incorreta da fonte (verificar de onde lê `total_retencao_acumulada`)
2. Curva S "Realizado: 1.4606781666666668%" → `.toFixed(2).replace('.', ',') + '%'`
3. Rename "Medição Física" → "Medição de Serviço" no dashboard
4. Rename "Material Retido" → "Faturamento Direto em Aberto" (já incluído no refactor §4.1)

## 7. Não-objetivos

Coisas explicitamente **fora do escopo** desta spec:

- Mudança no fluxo de aprovação de fat-direto (continua como está)
- Mudança na geração automática de pedidos FIP material/Wave após aprovação de medição
- Mudança no boletim Informakon nas colunas FIP FAT-DIR / WAVE SERV (continuam representando o componente bruto por linha)
- Validação de saldo na aprovação de medição (Gap 1 do brainstorm anterior — fica pra outra spec)

## 8. Critérios de aceite

- [ ] **MED-002 em diante** (novas medições) usa a fórmula única (mat + serv) → `medicoes.valor_total = base_retencao = mat_medido + serv_medido`
- [ ] MED-001 retroativo: depende da decisão do usuário (§4.2 Opção 1 vs Opção 2)
- [ ] Card Retenção no dashboard mostra valor correto da soma do livro-razão de todos os contratos
- [ ] Card "Medição Física" renomeado pra "Medição de Serviço"
- [ ] Curva S exibe percentuais com 2 casas decimais
- [ ] Boletim Informakon mostra "Faturamento Direto em Aberto" (não "Material Retido"), sem subtração na base de retenção
- [ ] Email de aprovação de uma nova medição usa a fórmula única e mostra excedente acumulado se houver
- [ ] Aprovação de medição com retenção > Wave bruto: Wave NF = R$ 0, livro-razão fica com saldo positivo, UI exibe aviso laranja
- [ ] Item 19 medido (qtde > 0) contribui na base de retenção; Wave NF do mês desconta esse valor

## 9. Riscos

- **Backfill da MED-001**: a NF Wave #7 já foi criada como rascunho com R$ 139.264 bruto. Se o usuário lançar a NF do fornecedor antes do backfill rodar, fica desalinhado. **Mitigação**: rodar backfill antes de qualquer NF Wave do mês ser lançada.
- **Quebra de relatórios existentes**: relatórios que somam `medicoes.valor_total` vão ver os números mudarem. **Mitigação**: avisar usuário; números ficam mais corretos (= valor real executado, não "valor de serviço")
- **Performance**: o cálculo de base_retencao já existe; não há mudança de complexidade

## 10. Aprovações

- [x] Modelo de negócio confirmado pelo usuário no brainstorm de 2026-05-06
- [ ] Spec revisada pelo usuário
- [ ] Plan de implementação escrito (próximo passo: writing-plans)
