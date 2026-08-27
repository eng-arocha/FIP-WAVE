# Desconto pendente de lastro

> Lacuna da regra de três camadas, levantada pelo usuário em 27/08/2026.
> **Implementada no mesmo dia**, com uma proteção a mais do que a proposta
> original previa — ver "Medição sem snapshot", no fim.

## A pergunta

> "Quando for o mês em que o lastro subir e não tiver medição naquele mês, o
> valor a deduzir daquele item deverá ser lançado para ser deduzido, certo?
> Irá aparecer na planilha? Se não, vai ficar faltando esta informação."
>
> "Ou seja: lancei a nota no Informakon, que tinha saldo de pedido ou estava
> lançada só no site — devo ter medição mesmo que não haja evolução."

Está certo. E hoje o boletim não faz isso.

## O que acontece hoje

A CAMADA ① calcula o desconto ideal de um item como o material **daquela**
medição:

```
nfDescontavel = quantidade_medida (do período) × valor_material_unit
```

Item sem quantidade medida no mês cai no ramo das linhas virtuais de
`informacon-data.ts` — `nf_descontavel: 0`, `informakon_a_lancar: 0` — e ainda
some da tabela, porque `linhasExibidas` filtra `quantidade_medida > 0`.

A CAMADA ② corta o desconto do macro grupo pelo `Vlr. a Desc` do ERP. Esse
corte **não volta**: o mês seguinte olha só o material do mês seguinte.

## O caso concreto — item 1.8.1, Medição 5

| | |
|---|---|
| Físico do item | 100% |
| Desconto que a medição pedia (grupo 1) | R$ 123.071,84 |
| Lastro no ERP | R$ 72.780,81 |
| Cortado pela camada ② | **R$ 50.291,03** |
| `% a lançar` do item | 59,7439% |

Na Medição 6, quando a FIP lançar essa nota no Informakon, o `Vlr. a Desc` do
grupo 1 sobe R$ 50.291,03. Mas o item 1.8.1 já está 100% executado — não vai
ter quantidade medida. Pelo código de hoje ele sai com desconto zero, e some da
tela.

Resultado: **o lastro fica parado no ERP e o item para em 59,7439% para
sempre.**

## Por que isso importa

Não é perda de caixa para a Wave: ela recebeu o serviço dela
(R$ 74.636,73 − R$ 69.686,33 = R$ 4.950,40). O material é passagem — entra como
liberação e sai como desconto, líquido zero.

O que se perde é outra coisa, e é grave de outro jeito:

1. **O contrato nunca fecha.** O item mede 100% no campo e 59,7439% no ERP. Ao
   final da obra o contrato mostra menos executado do que existe construído, e
   a diferença não tem onde ser lançada.
2. **Lastro morto polui as medições seguintes.** Os R$ 50.291,03 continuam como
   saldo disponível no `Vlr. a Desc` do grupo 1. A camada ② vai ler esse saldo
   e concluir que há lastro sobrando, deixando de cortar um mês em que
   deveria — o erro se inverte e passa a favorecer a Wave.
3. **A nota da FIP fica sem baixa.** A camada ③ manda emitir; a nota é emitida
   e lançada; e nada no boletim a consome.

## A regra proposta

Trocar a base da CAMADA ① de *material do período* para *material acumulado
ainda não lançado*:

```
descontoPendente = material acumulado do item
                 − Σ nf_descontavel já lançado em medições aprovadas

descontoIdeal    = descontoPendente          (CAMADA ①)
```

A CAMADA ② continua igual: corta pelo `Vlr. a Desc` do grupo, em cascata pelo
maior desconto, sem nunca comer a mão de obra. A CAMADA ③ continua igual.

O item passa a aparecer no boletim **mesmo com quantidade medida zero**, desde
que tenha desconto pendente com lastro. Uma linha assim é pura passagem:
serviço zero, desconto R$ 50.291,03, Wave recebe nada.

### Por que isto não é a volta da régua acumulada

A régua antiga foi removida porque empurrava o percentual acima do físico. A
diferença é que agora existe a camada ②: **nada é lançado sem lastro no ERP.**
O que a régua antiga fazia era liberar percentual contra material que ninguém
tinha comprovado. Aqui o gatilho é o oposto — só entra depois que a nota está
lançada no Informakon.

### O invariante muda de base, e é a base certa

Hoje o boletim compara `% a lançar` contra o `% Serv. Med.` **do período**.
Uma linha de recuperação tem físico do período igual a zero e disparia o
alarme `⚠ acima do físico` sempre.

O invariante correto — e o que o usuário sempre quis dizer com *"nunca o % do
Informakon pode ser maior que o % físico real"* — é acumulado:

```
Σ % lançado até hoje  ≤  % físico acumulado do item
```

Nessa base, a recuperação do 1.8.1 leva o acumulado lançado de 59,7439% a
100%, contra 100% de físico acumulado. Não há adiantamento: o percentual só
chega onde a obra já está.

## O que precisa mudar no código

| Onde | O quê |
|---|---|
| `lib/db/informacon-data.ts` · CAMADA ① | `descontoIdealDoItem(matAcumulado − jáLançado)` no lugar de `matMedido` |
| `lib/db/informacon-data.ts` · linhas virtuais | deixar de zerar `nf_descontavel` quando há pendente |
| `informacon/page.tsx` · `linhasExibidas` | mostrar item com `quantidade_medida = 0` que tenha desconto |
| `informacon/page.tsx` · `pctAcimaDoFisico` | comparar acumulado contra acumulado |
| Coluna nova | `Pendente de lastro` — quanto do item ainda não foi lançado |

O dado já existe: `material_acumulado` e `nf_ja_abatida` por detalhamento já
são calculados e carregados hoje.

## Riscos tratados na implementação

**Duas medições abertas.** O `Σ já lançado` sai só de medições **aprovadas**,
senão duas medições abertas ao mesmo tempo consomem o mesmo pendente. É o
mesmo cuidado do `snapshotAprovado`.

**Medição sem snapshot.** Medição aprovada antes da migration 074 tem
`nf_material_descontada` gravada como zero em todos os itens — não porque nada
foi descontado, mas porque a coluna não existia. Somado cru, isso faria o
material INTEIRO daquelas medições ressurgir como pendente, e o boletim
mandaria lançar de novo o que já foi lançado e pago. Quando uma medição inteira
não tem snapshot, ela passa a ser tratada como tendo lançado o próprio material
medido. A detecção é por medição, não por item: um item pode legitimamente ter
descontado zero num mês em que outros descontaram.

**A linha precisa existir no banco.** A aprovação cria row em `medicao_itens`
com quantidade zero para os itens que só carregam desconto. Sem isso
`nf_material_descontada` não seria gravada em lugar nenhum e o mesmo desconto
reapareceria no mês seguinte, já consumido no ERP.

## O que ainda depende de conferência do usuário

Se alguma medição aprovada COM snapshot lançou menos material do que mediu — o
estoque retido por "nota a caminho", por exemplo —, essa diferença passa a
aparecer como pendente na próxima medição, limitada ao lastro do ERP. É o
comportamento correto, mas muda números que já foram conferidos. Confira o
total do boletim antes de aprovar.
