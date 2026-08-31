# 17 — Rankings Refino + Craft

## Objetivo
Entregar as duas abas de produção que mostram o que vale a pena refinar ou fabricar.

## O que implementar
- Aba Refino: fibra/tecido, couro, barras, tábuas e blocos, com entrada, saída, retorno,
  estação, custo, venda, lucro e ROI.
- Aba Craft: ranking de itens craftáveis por lucro/ROI, incluindo `.N` e cadeia de upgrades quando
  disponível.
- Filtros compartilhados de realm, cidade, tier, encantamento, qualidade, Premium, foco e frescor.
- Mesma tabela visual do Market Flip, com drawer de análise detalhada.
- Exibir avisos de receita indisponível, profundidade insuficiente, preço velho e ordem não garantida.

## Depende de
Task 15 e Task 16.

## Testes automatizados
Rankings, retorno, foco/Premium, receitas ausentes, filtros, null monetário e navegação para detalhe.

## Implementado em 2026-08-26

- `/refino` e `/craft` agora entregam rankings reais, atualizados a cada 30 segundos, com filtros
  compartilháveis por cidade, tier, encantamento, qualidade, frescor, lucro, ROI, Premium, foco,
  retorno, estação e cobertura.
- Os endpoints `GET /opportunities/refining` e `GET /opportunities/crafting` passaram a aceitar o
  mesmo cenário configurado na interface (`return_rate`, `station_cost_per_execution`,
  `use_focus` e `premium`) e continuam delegando os cálculos monetários ao motor de craft.
- Cada oportunidade publica o cenário vencedor, ingredientes, compra efetiva, retorno esperado,
  estação, foco e instante mais antigo usado. A tabela não recalcula dinheiro no navegador.
- Sem filtro de qualidade, o backend classifica todas as qualidades realmente observadas para a
  combinação item/cidade; com filtro, simula somente a qualidade escolhida.
- A tabela mostra entradas, saída, cidade, cenário, custo, venda bruta, retorno, estação, lucro,
  ROI e avisos. O drawer chama `POST /craft/simulate` e detalha os cenários calculados pelo backend,
  com acesso direto à calculadora.
- Ausência de receita/preço suficiente permanece distinta de lucro zero; avisos de preço velho,
  profundidade, cobertura, preço ausente e ordem não garantida usam identificadores estáveis.
- O OpenAPI tipado foi regenerado depois da ampliação do contrato.
- Correção pós-validação real: receitas de recursos refinados com rota normal + rota de facção não
  são mais descartadas integralmente. O importador usa a única rota sem token como cenário padrão
  e mantém a alternativa de facção fora do ranking. O catálogo passou de 5.553 para 5.633 receitas,
  incluindo tecido, couro, barras, tábuas e blocos encantados.
- Correção pós-validação real: o limite defensivo de 200 candidatos agora é aplicado **depois** de
  filtrar receitas de refino ou craft no SQL. Antes, as 200 primeiras receitas alfabéticas eram
  itens de missão/tokens e nenhuma receita de refino era sequer simulada; no catálogo real,
  `T6_CLOTH_LEVEL3@3` aparece por volta da posição 3.050.
- `max_age_hours` agora é propagado ao motor de cotação. Antes, o ranking aceitava outra janela na
  API, mas a simulação continuava descartando livros acima da política fixa de 6 horas. A chave do
  cache de oportunidades foi versionada para `v2`, invalidando respostas vazias produzidas pela
  implementação anterior.

## Evidências automatizadas

- Backend completo: `uv run pytest tests/ -v` — **290 testes passaram**.
- Backend estático: `ruff check` e `ruff format --check` passaram nos arquivos alterados. A
  verificação global encontrou somente dois imports preexistentes fora do escopo, nas migrations
  `b3e4f5a6c7d8` e `f2d7e8f9a0b1`.
- Frontend completo: `npm run test` — **24 testes passaram**.
- Frontend: `npm run typecheck`, `npm run lint` (sem erros; sete avisos preexistentes) e
  `npm run build` passaram.
- Regressão pós-validação: `uv run pytest tests/opportunities/test_flips.py
  tests/craft/test_simulate_router.py -v` — **23 testes passaram**, incluindo catálogo com mais de
  200 receitas irrelevantes e livros de 8 horas aceitos em 24h/rejeitados em 6h.
- Validação no banco local real: a consulta de controle com 24h retornou duas oportunidades para
  `T6_CLOTH_LEVEL3@3` (Thetford e Lymhurst); a mesma consulta com `min_profit=0` retornou zero porque
  ambas estavam negativas, não por ausência de receita ou preço.

## Validação humana pendente

- Conferir visualmente os rankings com dados coletados do jogo, inclusive overflow da tabela e
  drawer em desktop/mobile. Essa validação integrada permanece consolidada na Task 19.
