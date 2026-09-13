# 07 — Cache local do catálogo

> Fecha o Bloco 1. Tira o catálogo do caminho crítico do primeiro paint.

## Objetivo

O scanner pintar a primeira tela a partir do catálogo em cache, sem esperar rede, e revalidar em
segundo plano.

## Por que — e o que o cache HTTP já resolve sozinho

Medido contra a API real:

| | |
|---|---|
| Corpo completo (`kind=crafting`) | 109 KB em **1,05 s** |
| Revalidação `304` com `If-None-Match` | **5,6 ms** |

Ou seja: o `ETag` + `Cache-Control` da task 02 **já** resolvem o grosso. Dentro dos 300 s de
`max-age` o navegador nem sai; depois disso paga uma condicional de 5,6 ms em localhost.

O que sobra para esta task é específico e menor do que parece:

1. **`must-revalidate` bloqueia.** Passado o `max-age`, o navegador *espera* a condicional
   antes de entregar o corpo. Em localhost são 5,6 ms; sobre internet real é um RTT
   (50–150 ms) **no caminho crítico**, porque o scanner não calcula nada sem o catálogo.
2. **O cache do TanStack Query é em memória** — morre a cada F5, e o scanner é uma tela que se
   recarrega muito.

A entrega é *stale-while-revalidate* de verdade: pinta do IndexedDB na hora, revalida atrás.
Não é uma reescrita do cache HTTP; é tirar um RTT da frente do usuário.

## O que implementar

1. **Dependência: `idb-keyval`** (6.3.0, Apache-2.0, 56 KB desempacotado, mantida — última
   publicação 2026-07). A API crua do IndexedDB é transação + `onsuccess`/`onerror`; envolver
   isso à mão seria reinventar exatamente a roda que a convenção do projeto manda não
   reinventar.

2. **`src/catalog/cache.ts`** — `readCachedCatalog(kind)` / `writeCachedCatalog(kind, version,
   payload)`. Guarda o payload **com a versão** que veio na resposta. Toda operação em
   `try/catch`: IndexedDB falha em janela privada, com armazenamento cheio ou bloqueado por
   política — e falhar o cache **nunca** pode falhar a tela.

3. **`src/catalog/service.ts`** — `fetchCatalog(kind)` sobre o cliente tipado.

4. **`src/catalog/hooks.ts`** — `useCatalog(kind)` em TanStack Query:
   - `initialData` vem do cache local, com `initialDataUpdatedAt` antigo para a query
     revalidar imediatamente em segundo plano;
   - política `catalog` (`staleTime` 5 min), que já existe em `src/api/query.ts:5-10`;
   - grava no cache local a cada resposta nova.

5. **Snapshot de preço fica só no TanStack Query**, política `market` (`staleTime` 30 s). Ele
   muda o tempo todo — cachear em IndexedDB serviria para mostrar preço velho mais rápido, que
   é o oposto do que este produto quer.

## Bibliotecas/dependências

`idb-keyval@6.3.0`. Nada mais.

## Depende de

Task **02**.

## Testes automatizados

- Cache vazio: o hook busca da rede e **grava** o resultado.
- Cache quente: o hook devolve o catálogo cacheado **sem esperar** a rede, e ainda assim dispara
  a revalidação.
- Versão diferente na resposta **substitui** o cache.
- `idb` indisponível (mock que lança em toda operação): a tela funciona, buscando da rede — o
  cache é otimização, nunca dependência.
- O snapshot de preço **não** é gravado em IndexedDB.

## Testes manuais

Abrir o scanner, recarregar com a aba de rede aberta: o catálogo não deve aparecer como
requisição bloqueante no primeiro paint; a revalidação aparece depois, como `304`.

## Estado da implementação

**Concluída.** `npm run lint` 0 erros (4 warnings pré-existentes) · `typecheck` limpo ·
`npm run test` **226/226** (+5).

- **`idb-keyval@6.3.0`** (Apache-2.0, publicada 2026-07) — dependência nova, fixada.
- **`src/catalog/cache.ts`** — `read`/`write`/`clear`, tudo em `try/catch`. Falha de cache
  nunca falha a tela.
- **`src/catalog/service.ts`** — `getRecipeCatalog(kind)` sobre o cliente tipado.
- **`src/catalog/hooks.ts`** — `useRecipeCatalog(kind)` com `initialData` vindo do disco.

### Duas coisas que o lint e o guard pegaram, e que valia consertar

**Dois mecanismos entregando o mesmo conteúdo.** A primeira versão tinha `initialData` **e** um
fallback `catalog: query.data ?? cached`. Removendo o `initialData`, o teste continuou passando
— o fallback sustentava sozinho. Ou seja: nenhum teste conseguia dizer qual dos dois era o
código de verdade. Ficou só o `initialData`, e aí o guard passou a nascer vermelho de fato
(`expected undefined to be 'v1'`).

**`setState` síncrono dentro do efeito.** O `setCacheReady(false)` no topo do efeito dispara
render em cascata (`react-hooks` acusou). O `kind` passou a viajar junto do payload no estado,
e "pronto" virou comparação derivada — um estado a menos e nenhum setState síncrono.

### Medição que dimensiona a task

| | |
|---|---|
| Corpo completo (`kind=crafting`) | 109 KB em **1,05 s** |
| Revalidação `304` | **5,6 ms** |

O `ETag` da task 02 já resolvia quase tudo. Esta task compra uma coisa só, e é honesto dizer
qual: **tirar o RTT de revalidação do caminho crítico do primeiro paint**, que em localhost são
5,6 ms e sobre internet real são 50–150 ms — com o scanner parado esperando, porque ele não
calcula nada sem o catálogo.

O snapshot de preço **não** foi para o IndexedDB, de propósito: ele muda o tempo todo, e
cachear em disco só serviria para mostrar preço velho mais rápido.

### Pendente pra você testar

Na task 11, quando houver tela: recarregar o scanner com a aba de rede aberta e confirmar que o
catálogo não bloqueia o primeiro paint — a revalidação aparece depois, como `304`.
