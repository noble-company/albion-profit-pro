# 14 — Calculadora

## Objetivo
Entregar o formulário e o breakdown dos quatro cenários calculados pelo backend como análise
detalhada de uma oportunidade encontrada pelos rankings Market Flip, Refino ou Craft. A calculadora
não é o fluxo inicial de descoberta.

## Por que
O frontend deve explicar a conta, não reimplementá-la. Avisos de slippage/cobertura são parte do
resultado econômico.

## O que implementar
- `CalculadoraPage`, `FormularioCraft`, `ResultadoSimulacao` e hook de mutation.
- `server` vem do estado global da task 09 e é enviado em todo `POST /craft/simulate`; o formulário
  não o redigita.
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

## Implementação concluída (2026-08-23)

- `CalculadoraPage` conectada a `POST /craft/simulate` com RHF.
- Servidor vem do estado global; cidade e parâmetros econômicos são inputs explícitos.
- Preferências não secretas são salvas com chave versionada.
- Resultado destaca o cenário pessimista e mantém os quatro cenários, breakdown de custo/receita,
  lucro, ROI, produção, ingredientes e avisos.
- Valores monetários `null` permanecem indisponíveis e não são recalculados no frontend.
