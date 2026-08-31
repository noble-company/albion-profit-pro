# 07 — Idioma único da API

> Corrige `B09`.

## Objetivo

Fazer todo o contrato HTTP falar um idioma só — inglês — sem quebrar o frontend no meio do
caminho.

## Por que

`/items/{id}/prices` e `/items/{id}/demand` respondem em português: `venda`, `compra`,
`vendido_24h`, `cobertura`, `janela_frescor_segundos`, `idade_segundos`, `observado_em`,
`melhor_preco`, `unidades_observadas`, `serie_6h`. `/craft/*` e `/opportunities/*` respondem em
inglês: `profit`, `roi`, `total_cost`, `warnings`, `oldest_observed_at`, `age_seconds`.

O `CLAUDE.md` do projeto é explícito: código e identificadores seguem convenção inglesa; a
comunicação e a prosa dos docs é que são em português. O frontend paga a conta misturando os
dois no mesmo componente — `row.venda.melhor_preco` ao lado de `row.profit`.

Isto **não** vale para o contrato de ingest, que espelha o wire do client Go
(`Field(alias="ItemTypeId")` etc.) e é intocável por decisão registrada no `CLAUDE.md`.

## O que implementar

1. Renomear os campos de resposta de `prices/schemas.py` para inglês, mantendo os nomes de
   domínio corretos: `sell`/`ask` e `buy`/`bid` conforme o glossário que a task fixar,
   `best_price`, `observed_units`, `observed_orders`, `observed_at`, `age_seconds`,
   `sold_24h`, `coverage`, `freshness_window_seconds`, `series_6h`.
2. Renomear as classes correspondentes (`LadoDoLivro`, `VolumeVendido`, `PrecoPorLocal`,
   `LivroOut`, `VendidoOut`, `PontoSerie6h`, `ItemResumo`) e os campos internos que vazam para
   o schema (`tem_receita`, `tem_receita_propria`, `variantes_encantadas`, `fonte`).
3. Decidir e registrar o alcance: apenas o **contrato HTTP**, ou também as colunas do banco
   (`fonte`, `n_varreduras`, `primeira_em`, `ultima_em`, `preco_medio`, `dia`, `mes`). Renomear
   coluna exige migration; se ficar fora, dizer explicitamente que fica.
4. Ciclo de depreciação: publicar os dois nomes por uma versão, marcando os antigos como
   deprecated no OpenAPI, e só então remover. Como o único consumidor é o nosso frontend, o
   ciclo pode ser curto — mas precisa ser deliberado, não um big bang.
5. Regenerar `frontend/src/api/schema.d.ts` e atualizar os consumidores no mesmo commit.
6. Fixar a regra no `CLAUDE.md` e no README da fase, para não voltar a divergir.

## Depende de

Task 04 (o contrato de resultado precisa estar estabilizado antes de renomear em massa).

## Testes automatizados

- Nenhum campo do OpenAPI, fora das rotas de ingest, casa com o dicionário de termos em
  português definido na task (verificação automatizada sobre o schema gerado).
- Os testes existentes de `tests/prices/` continuam verdes com os nomes novos.
- `schema.d.ts` regenerado compila e o frontend passa em `typecheck`.

## Testes manuais

Abrir `/docs` e confirmar que um leitor externo consegue entender a API inteira sem saber
português.
