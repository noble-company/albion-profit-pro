# 06 — Vetores dourados do scanner

> Trava `frontend/src/scanner/engine.ts` contra o motor Python. Encontrou **duas divergências
> reais** antes de o primeiro vetor existir.

## Objetivo

Impedir que o motor do cliente e o do servidor divirjam em silêncio.

## Por que

O scanner (task 05) recalcula no navegador o que `simulate_craft` calcula no servidor. Dois
motores para a mesma conta divergem — é uma questão de quando. A Fase 3.5 já resolveu isso uma
vez para a camada "e se" (`ranking-projection.golden.test.ts`); aqui o alvo é a composição
inteira: quantidade a comprar, taxa por ingrediente, imposto, escolha de cenário.

## A prova é transitiva

```text
computeScanner (TS)  ==  compose_scenarios (Python)  ==  simulate_craft (servidor)
└─ engine.golden.test.ts ─┘   └─ test_composicao_bate_com_simulate_craft ─┘
```

O elo do meio é o que importa: sem ele, os vetores só provariam que o cliente concorda com um
script — e o script poderia estar errado junto. `test_composicao_bate_com_simulate_craft`
semeia receita, catálogo e livro **com profundidade sobrando** e roda o `simulate_craft` de
verdade, cenário a cenário.

Profundidade sobrando é de propósito: aí o caminhamento de livro do servidor vira no-op e sobra
exatamente a aritmética que o scanner reproduz. Onde a profundidade **não** cobre, os dois
divergem por construção — o scanner é topo de livro, e essa diferença é o que o "Analisar"
existe para mostrar. Os vetores travam a aritmética, não a política de profundidade.

## Estado da implementação

**Concluída.** Backend **401 passed, 1 skipped** (+9) · frontend **221 passed** (+3) · lint e
typecheck limpos nos dois lados.

- `backend/scripts/generate_scanner_vectors.py` + `tests/fixtures/golden/scanner-vectors.json`
  (8 vetores: cenário único, quatro cenários, sem premium, retorno `0.367` com fração feia,
  `amount_crafted=5` com sobra, encantado em qualidade 3, prejuízo, e sem preço).
- `backend/tests/craft/test_scanner_vectors.py` — frescor, atualidade do arquivo e o elo com
  `simulate_craft` (parametrizado por vetor).
- `frontend/src/scanner/engine.golden.test.ts` — compara string a string.

### As duas divergências que a task encontrou

**1. A taxa de montagem é cobrada por ingrediente, não sobre o total somado.**
`craft/service.py::_build_scenario` faz `sum(part.setup_fee for part in acquisition_parts)`. O
motor do cliente cobrava `ceil(total_somado × 2,5%)` uma vez só. Como cada cobrança é um `ceil`
isolado, os números divergem: dois ingredientes de 100 dão `ceil(2,5)+ceil(2,5) = 6` no
servidor e `ceil(5) = 5` no cliente. Corrigido em `engine.ts`.

**2. O encantamento da saída vem da coluna da receita, não do sufixo do nome.**
`craft/service.py:180-184` monta o combo da saída com `recipe["enchantment_level"]`. O cliente
derivava de `@N` no `output_item`. Em dado real os dois coincidem, mas são **duas fontes de
verdade** livres para divergir num item mal formado — e o modo de falha seria silencioso
(cotação de um combo que não existe, virando "sem preço"). Corrigido em `engine.ts` e no
gerador; foi o que fez o vetor encantado falhar contra o `simulate_craft`.

### Guard em vermelho antes da correção

Revertendo a taxa para o total somado, `engine.golden.test.ts` falha com:

```
- "total_cost": "370"      + "369"
- "profit": "658"          + "659"
- "roi": "177.8378"        + "178.5908"
- "profit_per_weight": "1290.196..."  + "1292.156..."
```

### Pendente pra você testar

Nada. A paridade é verificável por máquina, e é isso que a torna útil.
