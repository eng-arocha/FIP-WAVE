# Lançamento de NF pela contratada com aprovação do contratante

- **Data:** 2026-05-15
- **Status:** Design aprovado — aguardando plano de implementação
- **Abordagem:** A — workflow de status na própria tabela `notas_fiscais_fat_direto`

## Contexto e problema

No fluxo de faturamento direto, a contratada (ex.: FIP Engenharia) cria solicitações
("pedidos", tabela `solicitacoes_fat_direto`) que são aprovadas pelo contratante.
Hoje, **o próprio contratante (Alex) lança as notas fiscais** contra os pedidos
aprovados, via `POST /api/contratos/[id]/fat-direto/solicitacoes/[solId]/nfs`.
Isso consome tempo do contratante.

Já existe um motor de validação robusto — o *3-way match* (`validarNotaFiscal3Way`
em `lib/db/fat-direto.ts`) — que confere a NF contra o pedido aprovado: status
aprovado, CNPJ do emitente × fornecedor, data de emissão ≥ data de aprovação,
valor ≤ saldo do pedido (+ tolerância do contrato), e duplicata.

## Objetivo

Permitir que a **contratada lance a NF** (autoatendimento) e que o **contratante
apenas aprove o lançamento**. A contratada já tem acesso ao sistema (template de
permissões "Engenheiro FIP"); não é um fornecedor externo.

Critério de sucesso: o envolvimento do contratante cai para uma conferência rápida
de aprovar/rejeitar, sem digitar nem lançar a NF.

## Abordagem escolhida (A)

Estender o `status` da tabela `notas_fiscais_fat_direto` com estados de workflow,
em vez de criar uma entidade de "submissão" separada (Abordagem B) ou depender do
módulo genérico de aprovações (Abordagem C). A tabela já possui `status`,
`validado_por_id` e `validado_em` — praticamente desenhada para isso. Reaproveita
o 3-way match, o upload de arquivo (signed URL) e a lógica de saldo já existentes.

## Ciclo de vida da NF

```
aguardando_aprovacao  ──aprovar──▶  aprovada
        ▲                          
        │                          
        └──reenviar──  em_correcao  ◀──rejeitar (com motivo)──┐
                                                              │
                                            (a partir de aguardando_aprovacao)
```

Estados do `status`:

- **`aguardando_aprovacao`** — contratada lançou; aguardando o contratante.
- **`aprovada`** — contratante aprovou. Só neste estado a NF "vale": conta como
  pagável e entra em relatórios/dashboards.
- **`em_correcao`** — contratante rejeitou com motivo; volta para a contratada
  ajustar a mesma NF.
- **`cancelada`** — NF abandonada (opcional; não conta para saldo).

Regra de auto-aprovação: NF lançada por um usuário que tem permissão de **aprovar**
nasce direto em `aprovada` (não faz sentido aprovar a si mesmo). Preserva o fluxo
atual em que o contratante lança diretamente.

## Fluxos

### Fluxo 1 — Contratada lança a NF

1. A contratada abre um pedido aprovado e aciona "Lançar NF".
2. Preenche os campos da NF (número, valor, data de emissão, CNPJ do emitente,
   etc.) e anexa o arquivo (upload direto ao Supabase Storage via signed URL —
   mecanismo já existente).
3. No envio, roda o 3-way match. **Bloqueia o lançamento na hora** quando:
   pedido não aprovado, pedido sem saldo, valor > saldo (+ tolerância do contrato),
   NF duplicada, ou CNPJ do emitente divergente do fornecedor do pedido. A
   contratada só consegue enviar uma NF "limpa" que caiba no pedido.
4. NF criada com status `aguardando_aprovacao`. E-mail enviado aos aprovadores.

### Fluxo 2 — Contratante aprova

1. O contratante vê a fila de NFs em `aguardando_aprovacao`.
2. Cada NF exibe: pedido, valor, saldo antes/depois, resultado do 3-way match,
   link para o arquivo anexado, quem lançou e quando.
3. **Aprovar** → status `aprovada`; grava `validado_por_id`/`validado_em`;
   contratada notificada por e-mail.
4. **Rejeitar** → exige `motivo_rejeicao`; status `em_correcao`; contratada
   notificada por e-mail com o motivo.

### Fluxo 3 — Correção

1. NF em `em_correcao` exibe o motivo da rejeição para a contratada.
2. A contratada ajusta os dados e/ou substitui o arquivo na **mesma NF**.
3. O 3-way match roda novamente; ao reenviar, a NF volta para
   `aguardando_aprovacao` e os aprovadores são notificados.
4. Cada ciclo fica registrado no histórico de auditoria.

## Modelo de dados

Uma migration SQL idempotente (Regra 1 do projeto) sobre `notas_fiscais_fat_direto`,
nesta ordem:

1. **Novas colunas:**
   - `lancado_por_id UUID REFERENCES perfis(id)` — quem lançou.
   - `lancado_em TIMESTAMPTZ` — quando.
   - `motivo_rejeicao TEXT` — motivo da última rejeição (sobrescrito a cada ciclo;
     o histórico completo fica na auditoria).
   - Reaproveita `validado_por_id` / `validado_em` como aprovador / data de aprovação.
2. **Migração dos dados existentes** (antes de apertar o CHECK):
   - `pendente` e `validada` → `aprovada` (foram lançadas pelo contratante, são
     confiáveis).
   - `rejeitada` → `cancelada` (no novo modelo a rejeição é a volta `em_correcao`;
     uma NF legada `rejeitada` é uma NF morta = `cancelada`).
3. **Substitui o CHECK de `status`** para permitir exatamente os quatro estados
   novos: `aguardando_aprovacao`, `aprovada`, `em_correcao`, `cancelada`. Nenhum
   valor legado permanece após o passo 2, então o CHECK não precisa mantê-los.

Histórico dos ciclos: usar o helper `audit()` já existente, com eventos
`nf.lancada`, `nf.aprovada`, `nf.rejeitada`, `nf.reenviada`. Sem tabela nova.

## Permissões

Modelo `(modulo, acao)` já existente. Novo módulo `nf_fat_direto`:

- **`nf_fat_direto:lancar`** — concedido ao template "Engenheiro FIP" (contratada)
  e ao admin.
- **`nf_fat_direto:aprovar`** — concedido apenas ao admin e a representantes do
  contratante. NÃO concedido à contratada.

Usuário com `nf_fat_direto:aprovar` que lança uma NF aciona a auto-aprovação.

## Reserva de saldo e 3-way match

Duas noções de saldo, derivadas do `status`:

- **Para o 3-way match (posso lançar?):** contam como saldo consumido todas as NFs
  em `aguardando_aprovacao`, `em_correcao` e `aprovada`. Ou seja, **uma NF pendente
  reserva saldo** — a contratada não consegue lançar duas NFs que, somadas, estouram
  o mesmo pedido. Apenas `cancelada` e `rejeitada` não contam.
- **Para "pagável" / relatórios / dashboards:** conta apenas `aprovada`.

O 3-way match (`validarNotaFiscal3Way`) é reaproveitado; a única mudança é garantir
que o filtro de NFs ativas inclua os estados pendentes.

## Casos de borda

- **Saldo muda entre lançar e aprovar** (outra NF aprovada no intervalo): o 3-way
  match roda **novamente no momento da aprovação**; se a NF agora estoura o saldo,
  o sistema avisa o contratante antes de confirmar.
- **Pedido editado ou cancelado com NF pendente:** revalidação na aprovação.
- **Concorrência:** como a NF pendente já reserva saldo, um segundo lançamento que
  estoura o pedido é bloqueado na origem.
- **Falha no upload do arquivo:** a NF não é criada.

## Telas

### Contratada

- Botão "Lançar NF" no pedido aprovado.
- Lista das NFs lançadas por ela, com o status de cada uma.
- Tela de correção para NF em `em_correcao`, exibindo o motivo da rejeição.

### Contratante

- Fila de NFs em `aguardando_aprovacao` na página `/nf-fat-direto` (já existente),
  com filtro "Aguardando aprovação" e badge de contagem no menu.
- Ação de aprovar/rejeitar com o resumo do 3-way match e link para o arquivo.

## Notificações

Reutiliza Resend e o padrão de templates em `lib/email/`. Três templates novos:

- Contratada lança → e-mail aos aprovadores ("NF X aguardando aprovação no pedido
  FIP-NNNN").
- Contratante aprova → e-mail à contratada ("NF X aprovada").
- Contratante rejeita → e-mail à contratada com o motivo da correção.

## Testes

- Transições de status: lançar → `aguardando_aprovacao`; aprovar → `aprovada`;
  rejeitar → `em_correcao`; reenviar → `aguardando_aprovacao`.
- Reserva de saldo: NF pendente conta no 3-way match.
- Revalidação na aprovação quando o saldo mudou desde o lançamento.
- Auto-aprovação quando o lançador tem `nf_fat_direto:aprovar`.
- Bloqueios no lançamento: pedido não aprovado, sem saldo, valor excedente,
  duplicata, CNPJ divergente.

## Fora de escopo (YAGNI)

- Extração automática de dados a partir do XML da NF-e (a contratada digita os
  campos e anexa o arquivo, como hoje). Pode ser uma evolução futura.
- Portal/contas para fornecedores externos — a contratada já é usuária do sistema.
- Mudanças no fluxo de aprovação de medições de serviço ou de pedidos.
