# A08 — Cenário individual por craft

> Ajuste depois do fechamento da Fase 4. Depende da [A07](A07-tela-meus-crafts.md).

## Objetivo

Cada entrada de Meus Crafts passa a ter quantidade, qualidade e estratégia próprias. O mesmo item
pode ser duplicado para comparar cenários independentes sem alterar a tabela do scanner nem os
outros crafts salvos.

## Experiência

Ao expandir uma linha, o jogador edita:

- nome opcional do cenário;
- receitas iniciais a fazer;
- qualidade da saída;
- Comprar em e Vender em;
- compra imediata, ordem de compra ou melhor cenário;
- venda imediata, ordem de venda ou melhor cenário;
- base do preço de ingredientes e da venda;
- retorno de recurso;
- taxa da estação por 100 de nutrição;
- Premium e uso de foco;
- origem ou preço manual por item, usando os controles que já existem em `RowDetails`.

Toda mudança recalcula **somente aquela entrada**. Quantidade e texto digitado mudam na hora; a
persistência ocorre no blur ou após 500 ms sem digitação. Falha de salvamento fica visível na
linha, preserva a edição para nova tentativa e nunca mostra `Salvo` antes da resposta do servidor.

## Persistência

Ampliar `saved_craft` com colunas escalares e JSONB somente onde o formato é variável:

| Campo | Regra |
|---|---|
| `name` | texto opcional, 1–80 depois de trim |
| `return_rate` | `NUMERIC`, `0 <= valor < 1` |
| `station_fee_per_100_nutrition` | `NUMERIC`, `>= 0` |
| `premium` / `use_focus` | booleanos |
| `acquisition_mode` | `best`, `immediate`, `buy_order` |
| `sale_mode` | `best`, `immediate`, `sell_order` |
| `ingredient_price_basis` | `average`, `cheapest`, `sale_city` |
| `sale_price_basis` | `best`, `average` |
| `buy_locations` / `sell_locations` | JSONB array de location IDs, sem repetição |
| `price_overrides` | JSONB validado pelo schema abaixo |

`quantity` e `output_quality` já existem desde a A06. Dinheiro e taxa decimal viajam no HTTP como
**strings decimais**, nunca `float`.

`price_overrides` usa um contrato discriminado, separado por lado e item:

```json
{
  "buy": {
    "T4_PLANKS": {"kind": "city", "location_id": "3005"},
    "T4_ARTEFACT_2H_MACE_MORGANA": {"kind": "manual", "price": "12000"}
  },
  "sell": {
    "T4_2H_MACE": {"kind": "average"}
  }
}
```

Kinds válidos: compra `default|average|cheapest|sale_city|city|manual`; venda
`default|best|average|city|manual`. Campos incompatíveis são recusados (`manual` exige `price`,
`city` exige `location_id`), itens devem pertencer à receita e preço não pode ser negativo.

## API

- `PATCH /me/saved-crafts/{id}` com atualização parcial e resposta normalizada;
- `POST /me/saved-crafts/{id}/duplicate` → `201`, cópia integral com novo UUID e nome sufixado
  `— cópia` quando houver nome;
- os endpoints da A06 passam a devolver o cenário completo.

O `PATCH` aceita `updated_at` da versão lida. Se outra aba já alterou o registro, responde 409 com
o estado atual em vez de sobrescrever silenciosamente. O frontend oferece `Usar versão do
servidor` ou `Salvar a minha novamente`.

Defaults na migration reproduzem o cenário atual do scanner: quantidade 100, qualidade 1,
retorno/taxa zero, Premium ligado, foco desligado, modos `best`, ingredientes por `average`, venda
por `best`, todas as cidades e nenhum override.

## Comportamento na tela

1. A linha fechada mostra nome do cenário quando houver; abaixo, o nome do item.
2. Badge `Personalizado` aparece quando qualquer campo difere dos defaults.
3. `Duplicar cenário` cria outra linha independente do mesmo item.
4. `Restaurar padrões` altera só aquela entrada e exige confirmação.
5. `Abrir na Calculadora` leva exatamente o cenário da entrada, inclusive quantidade, qualidade,
   cidades, modos e overrides que o contrato atual da Calculadora suportar. Campo ainda não
   representável na URL fica explicitamente listado na spec antes da implementação; não pode ser
   descartado em silêncio.
6. Fechar/reabrir, trocar de item, F5 ou outro navegador preservam as configurações.

## Cálculo e desempenho

- converter cada `SavedCraftOut` para `ScannerParams` e chamar o engine para uma receita;
- compartilhar catálogo, índice de preços, vendas e Painel do Destino entre todas as entradas;
- memoizar pelo conteúdo do cenário e pela versão dos dados: editar A não recalcula B;
- duplicatas podem escolher qualidades e quantidades diferentes;
- o volume consulta a qualidade daquela entrada;
- o limite de 200 continua valendo; não criar um Worker por linha. Se a medição com 200 cenários
  exceder 100 ms na thread principal, usar um único Worker com lote de entradas.

## Testes automatizados

Backend, PostgreSQL real:

- validação e round-trip de todos os campos;
- dinheiro/taxas saem como string decimal;
- override discriminado e pertencimento à receita;
- PATCH e duplicação isolados por usuário;
- conflito otimista entre duas versões;
- defaults da migration em registro criado pela A06;
- cascade, OpenAPI inglês, ruff e suíte completa.

Frontend:

- editar quantidade de A não muda B nem o cenário global;
- duas cópias do mesmo item calculam quantidades e qualidades diferentes;
- qualidade altera preço, volume e melhor cidade daquela entrada;
- debounce/blur salva uma vez e erro permite tentar novamente;
- atualização remota conflitante não sobrescreve silenciosamente;
- F5 restaura o cenário completo;
- link da Calculadora preserva tudo que ela suporta;
- teste de desempenho com 200 entradas;
- lint, typecheck, suíte completa, build e Playwright.

## Testes manuais

1. Salvar Maça Pesada, duplicar e configurar Normal ×100 e Excelente ×20.
2. Confirmar que lucro, investimento, volume e cidade podem divergir entre as duas linhas.
3. Editar outro item; os valores da Maça continuam intactos.
4. F5 e outro navegador: todos os cenários permanecem.
5. Abrir cada cópia na Calculadora e comparar o extrato.
6. Simular API offline durante uma edição; a linha acusa a falha e permite reenviar.

## Fora do escopo

- grupos, etiquetas, observações, metas de compra/venda e histórico de lucro;
- execução automática de compras ou qualquer integração que opere no jogo;
- notificações push.

## Estado da implementação

**Pendente.**
