# 23 — Camada "e se" no cliente

> Materializa a decisão de arquitetura nº 1 da fase. É a task que responde diretamente à queixa
> de que "tudo depende do servidor".

## Objetivo

Fazer com que mexer em premium, taxa de retorno, custo de estação, impostos, lucro mínimo e
ordenação recalcule o resultado **na hora, no navegador**, sem nenhuma requisição.

## Por que

Hoje cada um desses controles dispara um round-trip completo. Marcar "Conta Premium" faz o
servidor refazer até 8.000 simulações (`B02`) para mudar uma alíquota de 8% para 4%. Digitar
"15" em taxa de retorno faz o mesmo, dígito a dígito. É a origem direta da sensação de lentidão.

E é desnecessário: esses parâmetros são transformações baratas sobre dados que o navegador
**já tem na mão**. O que o servidor precisa fazer é a varredura — avaliar milhares de receitas
contra o livro de ofertas inteiro. O que ele não precisa fazer é multiplicar por 0,96.

A divisão adotada é por **o que muda**, não por onde roda:

| Camada | Onde | Por quê |
|---|---|---|
| Varredura e ranking | Servidor, pré-calculado (task 03) | Precisa do universo de dados |
| Preço atual | Servidor, endpoint único | É o "backend só traz preço" |
| "E se…" | **Cliente, instantâneo** | Os dados já estão na página |
| Detalhe com slippage | Servidor, sob demanda | Precisa do livro completo daquele item |

## O que implementar

1. O ranking (task 03) chega ao cliente com os **componentes** do resultado em parâmetros
   neutros: custo de ingrediente por modo de aquisição, preço de saída por modo de venda, custo
   de prata da receita, foco por execução, quantidades e frescor por lado.
2. Aplicar no cliente, com o módulo decimal da task 18 e as fórmulas portadas em
   `src/lib/craft-formulas.ts`:
   - imposto de venda (premium 4% x não-premium 8%);
   - setup fee por modo de aquisição e de venda;
   - taxa de retorno de recurso sobre a quantidade a comprar;
   - custo de estação por execução;
   - foco;
   - lucro, lucro por unidade e ROI;
   - filtro de lucro/ROI mínimo e ordenação sobre o conjunto carregado.
3. Recalcular de forma derivada do estado (`useMemo`), sem `useEffect` nem refetch. A meta é
   resposta perceptualmente instantânea ao mover um controle.
4. **Deixar explícito na interface** o limite do que é local: os filtros que restringem o
   universo (cidade, tier, encantamento, frescor, cobertura) continuam sendo do servidor,
   porque mudam *quais* linhas existem. Os que mudam *o valor* das linhas carregadas são locais.
5. Botão/afordância para aprofundar: quando o usuário quiser o número exato com slippage, abre o
   detalhe, que chama `POST /craft/simulate` — inalterado.
6. Sinalizar honestamente a natureza do número local: é projeção sobre o ranking em parâmetros
   neutros, não a simulação com profundidade de livro. A diferença precisa estar visível, não
   escondida — é a mesma disciplina de `cobertura: parcial` que o backend já pratica.

## Depende de

Tasks 03, 04, 18, 20 e 22. **A task 18 é bloqueante**: sem o módulo decimal e os vetores
dourados, isto vira uma segunda implementação do dinheiro divergindo em silêncio.

## Testes automatizados

- Mudar premium, retorno, estação ou imposto **não** dispara nenhuma requisição (verificado por
  MSW: zero chamadas após a carga inicial).
- Para os mesmos parâmetros, o resultado local é idêntico ao de `POST /craft/simulate` nos casos
  em que a profundidade de livro não altera o preço unitário — teste cruzado com o backend real.
- Onde a profundidade **altera** o preço, a UI mostra a divergência esperada e sinaliza que o
  número local é projeção.
- Os vetores dourados da task 18 continuam verdes.
- Filtro de universo (cidade, tier) continua indo ao servidor.

## Testes manuais

Mover o controle de taxa de retorno de 0 a 50% e confirmar que a tabela responde sem
carregamento perceptível. Depois abrir o detalhe de uma linha e conferir que o número exato do
servidor é coerente com a projeção mostrada.
