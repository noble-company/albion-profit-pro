# 16 — Estados de borda e resiliência

## Objetivo
Tratar situações frequentes como estados de produto, não falhas genéricas.

## Por que
Receitas ausentes, dados velhos, cobertura vazia e backend indisponível são normais neste modelo de
coleta comunitária.

## O que implementar
- Componentes para `receita_indisponivel`, item inexistente, dado velho/nulo, sem cobertura,
  profundidade insuficiente, preço ausente, ordem não garantida, 429 e backend offline/503.
- Revisar telas 10-15 para usar os componentes e manter contexto/ação de recuperação.
- Banner global de indisponibilidade com backoff; não transformar qualquer erro de uma query local
  em “backend inteiro fora”.
- CTAs corretos: executar client, atravessar zona, trocar scope/cidade, informar preço manual ou
  tentar novamente. Não sugerir “itens semelhantes” sem endpoint/heurística definida.
- Error boundary preserva navegação e não expõe stack/segredos.

## Bibliotecas/dependências
Nenhuma nova.

## Depende de
Tasks 10-15.

## Testes manuais
Derrubar API, envelhecer dados e simular ausência de receita/cobertura.

## Testes automatizados
Cada código/estado, backoff, erro local vs. global, recuperação e ausência de stack/token na UI.
