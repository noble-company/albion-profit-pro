# 07 — Validação do contrato de ingest

> Corrige `R07` de [../../05-revisao-fases-0-a-2.md](../../05-revisao-fases-0-a-2.md).

## Objetivo

Rejeitar dados fora do contrato antes de publicar no broker e reforçar invariantes no Postgres.

## Por que

Hoje tipos básicos são validados, mas preço/quantidade negativos, qualidade/encantamento fora do
jogo, `AuctionType` arbitrário e datas inválidas podem atravessar a API. Parte vira dado sem
sentido; parte falha tarde no worker.

## O que implementar

1. Schemas Pydantic:
   - IDs positivos dentro do domínio medido;
   - `QualityLevel` 1..5 e `EnchantmentLevel` 0..4;
   - preço e quantidade não negativos/positivos conforme o contrato real;
   - `AuctionType` literal `offer|request`;
   - strings com limites e sem vazio onde obrigatório;
   - `Expires` parseado/normalizado na borda, com timezone/precisão explicitamente aceitos;
   - timestamps .NET em intervalo plausível;
   - listas gold de mesmo tamanho, mesmo continuando fora de escopo.
2. Preservar aliases/casing exatos do Go no wire; normalização continua interna.
3. Adicionar `CheckConstraint`/enum/limites essenciais no banco para proteger outros produtores e
   bugs do worker. Gerar migration e validar upgrade/downgrade possível.
4. Corrigir middleware de tamanho para `Content-Length` malformado e documentar comportamento sem
   header/chunked atrás do Traefik; limite do proxy e da aplicação devem concordar.
5. Resposta 422 registra campos necessários sem incluir corpo inteiro ou segredo.
6. Não endurecer com suposição não medida: qualquer limite novo precisa vir de structs Go,
   fixtures reais ou regra documentada do jogo.

## Depende de

Task 06 (falha tardia deixa de sumir). Integrar realm obrigatório da task 03 se já concluída.

## Testes automatizados

- Casos de fronteira válidos e inválidos de cada campo.
- Fixtures reais continuam aceitas sem mutação do wire.
- Payload inválido não chama `.delay()` nem cria mensagem RabbitMQ.
- Constraints recusam escrita inválida direta.
- `Content-Length` inválido/grande retorna 400/413, nunca 500.

## Testes manuais

Repetir captura real e conferir zero 422; enviar casos inválidos por `curl` e confirmar fila vazia.

