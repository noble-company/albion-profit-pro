# 22 — Snapshot só da categoria na tela (opcional)

## Objetivo

O polling de 30 s do snapshot de preço traz **só os itens da categoria selecionada**, em vez do
realm inteiro.

## Por que

Com a task 21, a tela passa a olhar uma categoria por vez, mas o snapshot continua trazendo tudo:
~333 KB a cada 30 s com as 8 cidades (medido na task 03). É a alavanca de servidor que faz
sentido nesta arquitetura — no lugar da paginação descartada na 21.

**Opcional.** Só vale a pena se a medida mostrar ganho relevante. O cache HTTP e o `gzip` já
existem; o polling já pausa com a aba oculta.

## O que implementar

1. `GET /prices/snapshot` aceita a categoria (`kind` + `category`/`subcategory`), e o servidor
   resolve a lista de itens — saídas e ingredientes das receitas dela.
   **Não** por lista de itens na URL: uma categoria de ~100 receitas com ingredientes passa dos
   4.096 caracteres.
2. O `queryKey` do snapshot inclui a categoria. Aqui a mudança de chave é aceitável: trocar de
   categoria é uma ação explícita, não uma tecla.
3. Top 15, Todas e busca continuam pedindo o realm inteiro. Sem nada escolhido, nenhum pedido.

## Depende de

Task **21**.

## Testes automatizados

- O snapshot filtrado traz exatamente os itens das receitas da categoria (saídas e ingredientes).
- Sem categoria, o comportamento é o de hoje.
- Medir e registrar o payload antes e depois.

## Testes manuais

Na aba de rede, conferir o tamanho da resposta do snapshot com uma categoria selecionada.

## Estado da implementação

**Concluída.** Frontend `npm run test` **491/491** · `typecheck` limpo · `lint` 0 erros (7 avisos,
os mesmos). Backend `tests/prices`, `tests/catalog` e `test_api_language` **92/92** · `ruff` limpo.
Guards vermelhos primeiro: 5 no backend, 3 no frontend. Os dois que já passavam são as travas do
comportamento de hoje (sem categoria, o realm inteiro).

### A medida que decidiu fazer (2026-09-10, snapshot real do West)

| O que a tela pede | Linhas | JSON | gzip |
|---|---|---|---|
| Realm inteiro | 20.364 | 1.092 KB | **187 KB** |
| Refino › Tecido | 364 | 18 KB | **3,8 KB** |
| Craft › Armas › Espadas | 857 | 44 KB | **8,9 KB** |
| Craft › Consumíveis › Comida | 1.298 | 66 KB | **12,7 KB** |
| Craft › Artefatos › Armas (a maior) | 1.549 | 85 KB | **14,8 KB** |
| Craft › Armas (categoria inteira) | 6.376 | 337 KB | **58 KB** |

A spec partia de ~333 KB (task 03); o poller da API pública encheu o snapshot desde então. Uma
subcategoria é de 12 a 50 vezes menor. Medido de novo depois da implementação, pelo próprio
`read_snapshot` com o recorte: os mesmos tamanhos, e a leitura no servidor cai de **298 ms** (realm)
para **24 a 49 ms** (subcategoria).
Na máquina local o ganho quase não se sente; ele é de banda, de trabalho do servidor por usuário e
de reconstrução do índice na tela a cada 30 s.

### O que mudou em relação à spec

- **Todas e busca também pedem o realm**, não só o Top 15: nos três a tela pode precisar de qualquer
  item.
- **Sem nada escolhido, nenhum pedido.** A tela vazia da task 21 baixava os 187 KB para não usar.
- **O servidor espelha a regra da tela** (`itens_da_categoria` ↔ `lugarDaReceita`): família pelo
  `shop_subcategory2` no refino, item sem categoria em Outros. Um teste para cada caso. A regra que
  esconde pelo nome ficou só na tela — sem ela o servidor manda algumas linhas a mais, não a menos.
- **`category` sem `kind` é 422.** A mesma categoria significa coisas diferentes no refino e no
  craft; devolver o realm esconderia o erro atrás de uma resposta 50 vezes maior.
- **Nome de item confere dos dois lados.** O filtro é por nome exato; conferido no banco que o
  snapshot usa os mesmos nomes das receitas, inclusive encantados (`T4_CLOTH_LEVEL1@1`,
  `T5_MAIN_SWORD@1`). Dos 4.857 itens com preço, 9 não são de receita nenhuma.
- **Alias na subconsulta.** As três consultas da união também leem `recipe`; sem `aliased`, o
  `IN (subquery)` seria correlacionado sozinho pelo SQLAlchemy.
- Trocar de categoria mostra o carregando por um instante: os preços da anterior não têm os itens da
  nova, e reaproveitá-los faria a tabela piscar "sem preço". Voltar a uma categoria já vista é
  instantâneo (cache do TanStack Query).

### Pendente pra você testar

1. Abrir `/craft` com a aba de rede aberta: nenhum pedido de `/prices/snapshot` antes de escolher.
2. Escolher **Armas → Espadas**: o pedido leva `kind=crafting&category=weapons&subcategory=sword`
   e a resposta tem na casa de 9 KB transferidos.
3. Clicar em **Top 15** ou **Todas**: o pedido volta a ser do realm, ~187 KB.
4. Conferir que os preços da tabela aparecem normalmente nas duas situações.
