# 14 — Calculadora

## Objetivo
Entregar o formulário e o breakdown dos quatro cenários calculados pelo backend.

## Por que
O frontend deve explicar a conta, não reimplementá-la. Avisos de slippage/cobertura são parte do
resultado econômico.

## O que implementar
- `CalculadoraPage`, `FormularioCraft`, `ResultadoSimulacao` e hook de mutation.
- Inputs: item canônico, quantidade, cidade, qualidade do produto, scope, retorno, estação,
  foco/Premium, taxas editáveis, qualidades e preços manuais quando necessários.
- Defaults documentados; persistir apenas preferências não secretas em localStorage com schema e
  versão para migração.
- Resultado mostra execuções/produção/sobra, ingrediente bruto/efetivo, fill médio e níveis
  consumidos, idade/fonte, taxas, custo, receita, lucro e ROI para quatro cenários. Destaque inicial
  do cenário pessimista imediato, sem esconder os demais.
- Renderizar todos os avisos estáveis e deixar totais indisponíveis quando o backend retorna `null`.
- Nenhuma aritmética monetária no componente; no máximo seleção/ordenação de estruturas já prontas.

## Bibliotecas/dependências
RHF/Zod e TanStack Query.

## Depende de
Tasks 04, 09 e 11.

## Testes manuais
T2_CLOTH em lote pequeno e grande; comparar breakdown com JSON e conta à mão.

## Testes automatizados
Payload completo, validação, preferências versionadas, quatro cenários, slippage, cada aviso,
`null` monetário e receita indisponível.
