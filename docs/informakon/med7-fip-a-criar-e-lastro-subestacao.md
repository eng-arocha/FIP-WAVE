# MED-007 — "FIP a criar" R$ 35.268,99 e o corte de R$ 185.387,82 em SUBESTAÇÃO

Conferência de 26/10/2026, retrato `e7030db9` (grade de 22/10, 286 notas),
boletim lido da API `/informacon` da medição `2bbb4ccc`.

## 1. De onde sai o card FIP (Material) R$ 35.268,99

Um item só: **2.2.1 GRUPO GERADOR PMUC – PAINÉIS (QTA's + Quadro…)**.

- 10% medido em outubro × R$ 352.689,90 de material = R$ 35.268,99.
- Notas do site no item: R$ 178.618,63; já abatido no item: R$ 317.420,91
  (balde do grupo); disponível: R$ 0.
- ERP, GERAÇÃO: R$ 0 a descontar, R$ 306.550,12 já descontado.

Site e ERP concordam: não há nota sobrando em GERAÇÃO. Ou a FIP emite nota
de R$ 35.268,99 pelos painéis, ou o físico de 2.2.1 foi medido antes da
compra. Nenhuma das 6 notas "só no ERP" é de GERAÇÃO.

## 2. O "já abatido" do site NÃO está defasado em relação ao ERP

Hipótese anterior (26/10, no chat): o `nf_material_descontada` estaria atrasado
em relação ao `Vlr.Desc`. **Errada.** Por macro item:

| Macro item | Site já abatido | ERP Vlr.Desc | Dif. |
|---|---:|---:|---:|
| 1 SUBESTAÇÃO | 213.164,90 | 209.192,18 | +3.972,72 |
| 2 GERAÇÃO | 384.505,72 | 306.550,12 | +77.955,60 |
| 3 ALIMENTAÇÃO | 310.025,72 | 308.542,61 | +1.483,11 |
| 4 DISTRIBUIÇÃO | 83.714,85 | 94.437,35 | −10.722,50 |
| 6 QUADROS | 375.052,67 | 379.215,22 | −4.162,55 |
| 14 COMBATE | 208.708,11 | 234.202,11 | −25.494,00 |
| 16 SDAI | 30.056,92 | 10.433,35 | +19.623,57 |
| demais | ≈ iguais | | < 2.200 cada |
| **Total** | **2.771.247,71** | **2.703.943,05** | **+67.304,66** |

O site abateu R$ 67 mil A MAIS que o ERP, não a menos. SDAI × COMBATE é a NF
391610 (R$ 26.300,17) classificada em grupos diferentes. GERAÇÃO +78 mil é
classificação também (o ERP tem R$ 128 mil a mais de notas em GERAÇÃO do que o
site aloca ali). Não há manual-fix a fazer no saldo abatido.

## 3. Por que SUBESTAÇÃO corta R$ 185.387,82 e a FIP não é chamada

Grupo 1, acumulado: material medido ≈ R$ 750.156 (213.164,90 já abatido +
536.991,29 pedido agora). Notas de SUBESTAÇÃO no ERP, desde sempre:
R$ 560.795,65. Pedido aprovado sem nota: R$ 31.593,92.

    750.156 − 560.796 − 31.594 ≈ R$ 157.766 de material medido SEM NOTA NENHUMA
    + 31.594 nota a caminho = R$ 189.360 ≈ corte de 185.387,82 (dif. = item 2 acima)

Ou seja: o corte é real e não é atraso de lançamento. É material que o físico
diz instalado (1.3.1 100%, 1.6.1 90%, 1.11.1 90%) e para o qual não existe
nota de fornecedor, nem no site nem no ERP.

**E aqui o site erra ao dizer "FIP a criar = 0" no grupo 1.** A camada ③
(`classificarCoberturaDoSite`, `lib/db/desconto-material.ts`) é POR ITEM:
cobertura do item = notas do item − `jaConsumido` do item. Só que o abatimento
das medições anteriores foi feito por TRANSBORDO no grupo: itens sem nota
(1.8.1 R$ 119.977,36, 1.13.1 R$ 32.751,20, 1.14.1, 1.5.1, 1.9.1…) consumiram as
notas que estão alocadas em 1.3.1 (R$ 302.755,10) e 1.6.1 (R$ 120.265,55). O
`jaConsumido` ficou nos itens sem nota; os itens com nota continuam com
`jaConsumido = 0` e parecem cobertos. O grupo soma R$ 497.465 "disponível"
quando o líquido real é R$ 288.556.

Pelo dado do próprio site, a camada ③ deveria pedir à FIP ≈ R$ 216.841 no
grupo 1 (536.991,29 − 320.149,91); pelo ERP, R$ 185.387,82. Hoje pede zero.

## Decisão (26/10/2026): corrigido em `2d2897e`

`classificarCoberturaPorBalde` (lib/db/desconto-material.ts): cobertura e
FIP são calculadas no balde da camada ② (`chaveMacroItem`) e rateadas pelo
pendente de cada item. Muda só o card "FIP (Material)" e "Nota a caminho" das
medições abertas; não muda percentual nem aprovação.

Pedido aprovado sem nota continua contando como cobertura ("nota a
caminho"): no grupo 1 há ≈ R$ 160 mil disso (1.7.1, 1.12.1, 1.8.1, 1.13.1,
1.2.1, 1.3.1, 1.10.1), então a FIP a criar do grupo sobe para ≈ R$ 86 mil,
não para os R$ 185 mil do corte. A diferença é material comprado cuja nota
ainda não chegou — e enquanto não chega, o corte da camada ② segura.

## Conferido em produção depois do deploy (26/10/2026, `2d2897e`)

- "Nota a caminho" subiu de R$ 120.086,83 para R$ 214.466,24 — o balde
  passou a enxergar os pedidos aprovados sem nota dos itens vizinhos.
- "FIP (Material)" **continuou R$ 35.268,99** (só o 2.2.1). No grupo 1 a FIP
  do balde (≈ R$ 86 mil) é abatida em seguida pelo lastro do ERP
  (`fip_faturar − nf_descontavel`, aplicar-retrato.ts): o ERP tem
  R$ 351.603,47 de notas em SUBESTAÇÃO, e isso zera o pedido.

Leitura correta do grupo 1, juntando site e ERP: 536.991,29 de pendente −
351.603,47 lançado no ERP − ≈ 160 mil de pedido aprovado aguardando nota ≈
**R$ 24 mil** de material sem nota em lugar nenhum. A afirmação da seção 3
("a FIP deveria ser chamada para ≈ R$ 185–216 mil") estava errada: ela
ignorava os pedidos aprovados sem nota. O corte de R$ 185.387,82 é, na maior
parte, nota de fornecedor que ainda não chegou e, portanto, não foi lançada
no ERP — não é tarefa da FIP, é cobrança de nota dos fornecedores dos
pedidos 1.7.1, 1.12.1, 1.8.1, 1.13.1, 1.2.1, 1.3.1 e 1.10.1.

Não reconciliado: "Nota a caminho" do grupo 1 saiu R$ 43.044,44 na API,
abaixo dos ≈ R$ 160 mil de `saldo_aprovado` somado nas linhas. Provável
`confirmacao_sem_nf` em alguns itens (zera a espera) — a conferir.

## Correção da leitura (26/10/2026, depois do "não vem mais nota")

O usuário confirmou que não vem mais nota do grupo 1. As 15 notas do item 1.3.1
(Novemp 15400 + 14 MSF do pedido 1085) estão TODAS no retrato do ERP, com as
duas colunas lidas certo. O problema é o macro item em que o ERP as lançou:

| Nota | ERP: macro item | Vlr. a Desc | Vlr.Desc |
|---|---|---:|---:|
| 584, 579, 576, 572, 559 | QUADROS ELÉTRICOS | 105.953,20 | 0 |
| 550 | QUADROS + ÁGUA PLUVIAL | 51.700,57 | 0 |
| 570 | SUBESTAÇÃO 31.837,28 + QUADROS 5.608,22 | 37.445,50 | 0 |
| 541, 506 | QUADROS | 13.741,95 | 46.715,12 |
| 557, 556, 546, 539, 534 | GERAÇÃO / QUADROS / SUBESTAÇÃO | 0 | consumido |
| 15400 | SUBESTAÇÃO | 125.829,91 | 94.170,09 |

MSF ainda não consumida e fora de SUBESTAÇÃO: ≈ R$ 177 mil. O grupo 6
(QUADROS) pede só R$ 8.795 nesta medição e tem R$ 164 mil de saldo lá.

O reendereçamento (`rechavear.ts`) não move essas notas porque nós também
alocamos MSF no grupo 6 (o pedido 1085 tem 6.1), e a regra "já está num macro
item em que também alocamos → nada a mover" segura o valor inteiro onde o ERP
pôs. Mesmo movendo pela nossa alocação, só 9,14% da MSF é do 1.3.1 — não
resolveria.

Decisão pendente com o usuário: se o Informakon abate por macro item (premissa
da camada ②), a saída é no ERP — reapropriar para SUBESTAÇÃO/GERAÇÃO as
entradas MSF ainda não consumidas (Vlr.Desc = 0). Se o ERP abate de qualquer
nota do pedido 1139, a camada ② está estrita demais e o corte é falso.

## Regra decidida (usuário, 26/10/2026) e proposta: COMPENSAÇÃO DE LASTRO

Regra: o Informakon só abate nota lançada no MESMO macro item. Quando a nota
de material de um macro item (G) foi lançada em outro (D), a FIP fatura a
falta de G, e o saldo a gastar dos itens de D é reduzido no mesmo valor,
começando pelos primeiros itens de D.

Por quê: a nota parada em D vai abater material de D no futuro. Sem reduzir o
saldo de D, alguém compraria de novo esse material de D, e a obra pagaria duas
vezes (nota da FIP em G + nova compra em D).

Números da MED-007 (estimativa; saldo a gastar = material do item − pedidos aprovados):

- G1 SUBESTAÇÃO, falta 185.387,82. Notas MSF livres em D6 QUADROS: 164.443,94
  − 8.795,43 de demanda atual = **155.648,51 compensáveis**.
  Restam 29.739,31 de material sem nota em lugar nenhum (FIP pura).
- G2 GERAÇÃO, falta 35.268,99. Sem lastro livre de MSF depois do G1: FIP pura.
- Redução em QUADROS pelos primeiros itens: 6.1.1 13.276,31 · 6.1.2 6.692,05
  · 6.1.3 6.819,22 · 6.1.4 10.110,05 · 6.1.5 118.750,88.

Desenho (implementado em `4d73e16`, migration 085):
1. Tabela `compensacoes_lastro` (medição, macro com falta, macro onde a nota
   está, valor, notas de referência, quem/quando/motivo) + itens destino
   (detalhamento, valor), gravados pelo usuário a partir de sugestão.
2. Saldo por item e trava de novo pedido (`saldo-por-item`, `fat-direto.ts`)
   somam a compensação ao consumo do item destino.
3. Camada ③: FIP a criar de G += compensação; cobertura do balde D += compensação
   (senão, ao medir quadros, o site pediria FIP de novo).
4. Painel no boletim: sugestão calculada (falta × lastro livre de D), botão
   "registrar compensação", desfazer enquanto a medição está aberta.

Risco a validar fora do sistema: a NF da FIP em G cobre material que foi
faturado pela MSF e lançado em D. Isso só fecha porque D deixa de comprar o
mesmo valor; fiscalmente, quem confirma é a FIP.

## Implementado (26/10/2026, `4d73e16`)

- Lógica: `lib/informakon/compensacao-lastro.ts` (sugestão + distribuição, testes).
- Persistência: migration 085, `lib/db/compensacao-lastro.ts`.
- Efeitos: `informacon-data.ts` (FIP em G, cobertura em D, sugestões),
  `saldo-por-item` e `fat-direto.ts` (consumo de material do item destino).
- Tela: `components/medicoes/compensacao-lastro-painel.tsx` no boletim.

Limite conhecido: a sugestão desconta TODAS as compensações já registradas
dos dois lados, mesmo depois de a nota da FIP entrar no ERP. É conservador
(sugere de menos), de propósito. Revisitar quando houver a primeira
compensação "vencida" — o momento é quando a NF da FIP de uma compensação for
lançada no Informakon e o painel ainda sugerir menos do que a falta real.

