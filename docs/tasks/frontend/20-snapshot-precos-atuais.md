# Extensão da Fase 3 — snapshots e preços atuais

> Plano aprovado em 2026-08-24 e revisado em 2026-08-24. Esta extensão é transversal às 19 tasks originais da Fase 3.
> Ela garante que nenhuma funcionalidade use silenciosamente uma cotação antiga quando já
> existe uma coleta mais recente.

## Objetivo

Market Flip, Refino, Craft, Calculadora, preços por cidade e comparações devem consumir somente
o snapshot mais recente por `realm + mercado + item + qualidade + encantamento + lado do livro`.
Dados antigos continuam preservados para histórico, mas não participam de cálculos atuais.

## Por que é necessário

O ingest atual faz upsert por ordem e preserva ordens ausentes de lotes posteriores. A solução
inicial previa snapshots persistidos, mas a decisão revisada prioriza uma projeção simples: as
leituras usam o `last_seen_at` mais recente de cada combinação e descartam ordens de observações
anteriores. Snapshots completos ficam adiados até serem necessários para detectar consultas vazias.

## Tasks da extensão

| # | Entrega | Dependências |
|---|---|---|
| [20.1](20.1-contrato-snapshot.md) | Contrato de snapshot: identificador, escopo, captura e conclusão | — |
| [20.2](20.2-client-envio-snapshots.md) | Client Go anexando snapshots às respostas de mercado | 20.1 |
| [20.3](20.3-projecao-ultima-observacao.md) | Projeção da última observação por combinação | 20.1, 20.2 |
| 20.4 | Reconciliação transacional: ativa presentes, inativa ausentes | 20.2, 20.3 |
| 20.5 | Serviço único de preço atual consumido por todas as APIs | 20.4 |
| 20.6 | Invalidação de Redis e publicação de atualização por snapshot | 20.4, 20.5 |
| 20.7 | Política de frescor e respostas explícitas de dado antigo/ausente | 20.5 |
| 20.8 | Adequação do frontend para idade e estado do snapshot | 20.7 |
| 20.9 | Migração dos motores de Flip, Refino, Craft e Calculadora | 20.5 |
| 20.10 | Testes automatizados de substituição, remoção, vazio e fora de ordem | 20.4–20.9 |
| 20.11 | Validação real com jogo, cidades e Black Market | 20.10 |

## Regras de implementação

- Snapshot mais novo vence; snapshot atrasado não sobrescreve estado atual.
- Ordem ausente só é inativada dentro do escopo de um snapshot concluído.
- Ordens antigas não são apagadas fisicamente; ficam fora das consultas atuais.
- Nenhuma API de cálculo pode consultar diretamente ordens históricas/inativas.
- Se não houver coleta atual, a resposta deve informar idade/desatualização, nunca usar o preço
  antigo silenciosamente.
- Histórico de preços permanece disponível apenas para gráficos e análise temporal.

## Critério de aceite ponta a ponta

Depois de mapear um mercado, comprar/vender uma ordem e mapear novamente, a ordem removida não
pode aparecer no Market Flip, Refino, Craft ou Calculadora. O preço novo deve aparecer em todas
essas telas, inclusive em cidades diferentes e no Black Market.
