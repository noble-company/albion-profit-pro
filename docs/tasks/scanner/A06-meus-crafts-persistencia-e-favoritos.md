# A06 — Meus Crafts: persistência e favoritos

> Ajuste depois do fechamento da Fase 4 ([README](README.md#ajustes-depois-do-fechamento)). Não
> reabre a contagem da fase. É a fundação das tasks [A07](A07-tela-meus-crafts.md) e
> [A08](A08-cenario-individual-por-craft.md).

## Objetivo

Permitir que o jogador salve uma receita encontrada em Refino, Craft ou Comida & Poções e recupere
essa seleção em qualquer navegador autenticado. A task entrega persistência por usuário, API e o
botão de salvar; a tela dedicada vem na A07.

## Estado real validado

- O catálogo expõe `output_item`, mas não o UUID interno de `recipe`
  (`backend/src/catalog/schemas.py`).
- `recipe.output_item_unique_name` é único. A task 27 decidiu uma rota padrão por saída; portanto
  o produto continua tendo uma receita selecionada por `output_item`.
- O UUID de `recipe` é surrogate e pode mudar quando o dataset estático é semeado novamente. Um
  favorito **não pode** depender dele.
- Configuração pessoal já segue o padrão `/me/*`, autenticação por `current_active_user` e
  PostgreSQL como fonte de verdade (`destiny-board`).

## Decisões

1. A entidade salva se chama `SavedCraft`; o nome da tela é **Meus Crafts**.
2. A chave persistida da receita é `output_item` (texto), sem FK para a tabela estática `recipe`.
   A API valida que a receita existe e tem `production_kind` `crafting` ou `refining` no momento
   da criação.
3. Cada registro pertence a um realm (`west`, `east` ou `europe`). A tela lista os registros do
   servidor atualmente selecionado.
4. Não há `UNIQUE(user_id, server, output_item)`: na A08 o mesmo item poderá existir mais de uma
   vez para comparar cenários. O botão do scanner cria no máximo um durante a mutação; duplicação
   intencional ficará na tela dedicada.
5. Quantidade e qualidade já nascem no registro para não exigir uma segunda migração para a
   necessidade central do usuário. Nesta task elas são copiadas do cenário do scanner; a edição
   individual entra na A08.

## Backend

### Modelo e migration

Criar o domínio `src/saved_crafts/` e a tabela `saved_craft`:

| Campo | Tipo/regra |
|---|---|
| `id` | UUID, PK |
| `user_id` | UUID, FK `user.id`, `ON DELETE CASCADE`, indexado |
| `server` | texto, `CHECK IN ('west','east','europe')` |
| `output_item` | texto de até 64 caracteres, sem FK para o catálogo estático |
| `quantity` | inteiro, `CHECK 1..1_000_000` |
| `output_quality` | inteiro, `CHECK 1..5` |
| `created_at` | `TIMESTAMPTZ`, definido pelo servidor |
| `updated_at` | `TIMESTAMPTZ`, atualizado pelo servidor |

Índice composto `(user_id, server, updated_at)`. A consulta percorre esse índice em ordem inversa
para entregar `updated_at DESC`. Não guardar nome nem imagem: são dados do
catálogo atual e não devem ficar desatualizados numa cópia pessoal.

### Contrato HTTP

Contrato inglês, autenticado:

- `GET /me/saved-crafts?server=west` → lista ordenada por `updated_at DESC`;
- `POST /me/saved-crafts` → `201`, cria um registro;
- `DELETE /me/saved-crafts/{id}` → `204`.

Entrada do `POST`:

```json
{
  "server": "west",
  "output_item": "T4_2H_MACE",
  "quantity": 100,
  "output_quality": 2
}
```

O `id` sempre é escopado pelo usuário autenticado; registro de outro usuário responde 404, sem
confirmar sua existência. Receita ausente ou de outro tipo responde 422 com erro de domínio.
Paginação não entra: o teto inicial é 200 registros por usuário e realm, validado antes
do insert; acima dele, 409 com mensagem explícita.

Registrar o router em `src/main.py`, incluir o modelo no metadata das migrations e regenerar
`frontend/src/api/schema.d.ts`.

## Frontend

1. `saved-crafts/service.ts` e `hooks.ts` com TanStack Query; chave inclui realm.
2. Refino, Craft e Comida & Poções exibem uma estrela acessível na célula do item e no painel expandido:
   - vazia: `Salvar em Meus Crafts`;
   - preenchida: `Salvo em Meus Crafts`;
   - durante o POST, fica desabilitada para impedir clique duplo;
   - clicar na estrela não abre/fecha a linha (`stopPropagation`).
3. A criação leva `scenario.quantity` e `scenario.outputQuality` atuais.
4. Se já existir ao menos um registro do mesmo `output_item` no realm, a estrela aparece
   preenchida e desabilitada como indicador `Receita salva em Meus Crafts`; remover ou duplicar
   não acontece silenciosamente nela. A navegação para `/meus-crafts` só passa a existir junto
   com a própria rota, na A07 — esta task não cria um link morto.
5. Falha da mutação produz mensagem visível e restaura o estado anterior; sucesso atualiza o
   cache sem refazer a lista inteira.

O Refino grava qualidade normal (`1`), pois recursos refinados não possuem qualidade variável.

## Testes automatizados

Backend, com PostgreSQL real:

- isolamento entre dois usuários nos três endpoints;
- cascade ao excluir usuário;
- realm, quantidade e qualidade fora da faixa são recusados;
- item inexistente é recusado e receitas de craft e refino são aceitas;
- dois registros do mesmo item podem existir, preparando a A08;
- teto de 200 por realm;
- OpenAPI em inglês e contagem de statements constante por operação;
- `uv run pytest tests/ -v && uv run ruff check .`.

Frontend:

- serviço envia e lê o contrato regenerado;
- estrela aparece em Refino, Craft e Comida & Poções;
- POST leva realm, item, quantidade e qualidade atuais;
- clique não expande a linha nem duplica durante a mutação;
- erro é visível e não deixa falso positivo de “salvo”;
- `npm run lint && npm run typecheck && npm run test && npm run build`.

## Testes manuais

1. Salvar uma receita em Refino e outra em Craft; F5 mantém as estrelas preenchidas.
2. Abrir outra sessão/navegador com o mesmo usuário; o estado continua salvo.
3. Trocar West por East; os favoritos são independentes.
4. Desligar a API e tentar salvar; a tela informa a falha e não marca como salvo.

## Fora do escopo

- tela `/meus-crafts` e remoção visual — A07;
- editar cenário, duplicar e comparar — A08;
- grupos, etiquetas, notas e histórico de lucro.

## Estado da implementação

**Concluída em 2026-09-14.**

### Entregue

- domínio `backend/src/saved_crafts/`, migration e endpoints autenticados de listar, criar e
  excluir, isolados por usuário e realm;
- validação contra o catálogo atual, limite de 200 registros por usuário/realm e chave estável
  por `output_item`, sem FK para o UUID volátil de `recipe`;
- contrato OpenAPI regenerado e cliente TanStack Query com cache separado por realm;
- estrela acessível na célula e no painel expandido de Refino, Craft e Comida & Poções;
- quantidade global e a qualidade efetivamente analisada no painel são copiadas para o registro;
- estado pendente impede duplicação, falha gera mensagem visível e sucesso atualiza o cache local;
- estrela já preenchida fica desabilitada como indicador, sem apontar para a rota da A07 antes de
  ela existir.

### Validação automatizada

- backend focado: `12 passed` em PostgreSQL real;
- backend completo: `478 passed, 1 skipped`;
- frontend focado: `33 passed`;
- frontend completo: `576 passed`;
- `uv run ruff check .`, `npm run lint`, `npm run typecheck` e `npm run build` concluídos sem erro;
- o lint manteve apenas os 7 warnings preexistentes de Fast Refresh/React Compiler.

### Validação ainda manual

Os quatro cenários da seção **Testes manuais** dependem da aplicação e API locais em execução e
continuam como conferência humana de UX. Eles não substituem nem bloqueiam os gates automatizados
acima.
