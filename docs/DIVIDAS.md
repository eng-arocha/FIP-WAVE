# Dívidas registradas

Decisões adiadas, com o motivo e o momento certo de aplicar — pra ninguém
reabrir a discussão do zero.

## 2026-10-28 — Tarefas duplicadas no orçamento (ex.: três "1.6" no grupo 1)

**O que é:** seeds antigos (migrations 005/011/015) gravaram a mesma tarefa
mais de uma vez. No contrato WAVE-2025-001 o grupo 1 tem a tarefa 1.6 real
(com detalhamentos) e duas cópias vazias ("Tranformadores", com erro de
digitação), cada uma com cabeçalho de R$ 159.374,24. Varredura das tarefas
dos 18 grupos: o 1.6 é o único código repetido.

**O que foi feito:** a Visão Geral (`lib/db/dashboard.ts`, `carregarModelo`)
ignora a tarefa sem detalhamentos cujo código coincide com o de uma irmã que
tem detalhamentos. Os dados no banco NÃO foram apagados.

**O que falta:** remover as cópias do banco. Adiado porque é irreversível e
precisa conferir antes se alguma tabela referencia esses `tarefas.id`
(cronograma, medições antigas, aditivos). A aba **Estrutura** lê o banco
direto e ainda pode mostrar as cópias.

**Quando aplicar:** na próxima vez que mexer na estrutura do orçamento ou
antes de qualquer reimportação. Conferir referências com:

```sql
select t.id, t.codigo, t.nome,
       (select count(*) from detalhamentos d where d.tarefa_id = t.id) as dets
from tarefas t
join grupos_macro g on g.id = t.grupo_macro_id
where g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  and trim(trailing '.' from t.codigo) in (
    select trim(trailing '.' from t2.codigo) from tarefas t2
    where t2.grupo_macro_id = t.grupo_macro_id
    group by 1 having count(*) > 1
  )
order by t.codigo;
```

## 2026-10-28 — "Saldo" da Visão Geral passou a ser Contratado − Realizado

**Decisão:** em Total, Material e Serviço a coluna **Saldo** é sempre
Contratado − Realizado (pedido do Alex: a linha tem que fechar na leitura).
A grandeza antiga virou coluna própria: **Med. s/ NF** (Serviço — medição
aprovada sem NF da Wave) e **Aprov. s/ NF** (Material — pedido aprovado sem
NF). O clique de origem "saldo" foi para essa coluna. Fonte única:
`valoresPorModo` em `lib/export/visao-geral.ts`.
