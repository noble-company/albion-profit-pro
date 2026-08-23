# 03 — Realm ponta a ponta (West/East/Europe)

> Corrige `R02` de [../../05-revisao-fases-0-a-2.md](../../05-revisao-fases-0-a-2.md).

## Objetivo

Tornar realm parte obrigatória da identidade de toda coleta, persistência, cache e leitura, sem
misturar economias de West, East e Europe.

## Por que

O client já descobre `AODataServerID`, mas nosso destino estático não preserva a região. O backend
usa `source_id` como único global e agrega item/local sem realm. Dois servidores podem ter o mesmo
leilão e sempre têm economias diferentes.

## Contrato decidido

- Identificador canônico textual: `west`, `east`, `europe`.
- O uploader autenticado envia `X-Albion-Server: <realm>` usando o estado já descoberto pelo
  client. Destinos não autenticados não recebem metadado privado do Profit Pro.
- Realm desconhecido não pode virar default silencioso: o client segura o upload, loga e avisa de
  forma debounced até descobrir o servidor.
- A API de leitura exige `server` explicitamente nesta fase; não escolher um default escondido.

## O que implementar

1. Client: mapear `AODataServerID` para o enum canônico e anexar o header no uploader autenticado.
2. Backend: validar o header antes de publicar no RabbitMQ e incluir realm no envelope da task.
3. Adicionar `server_id` às tabelas `market_order`, `market_history_entry`, `market_scan`, rollups e
   quaisquer chaves derivadas. Atualizar unicidades, índices, upserts e FKs/enum conforme o padrão
   escolhido.
4. Incluir realm em todas as chaves Redis e canais pub/sub.
5. Tornar queries/endpoints de preço/demanda realm-aware; resposta também devolve o realm.
6. Migration: antes de backfill, obter do usuário qual realm gerou os dados legados. Não presumir
   West dentro da migration. Se a origem não puder ser provada, limpar apenas os fatos de mercado
   regeneráveis, preservando usuários/tokens/receitas, com autorização explícita.
7. Atualizar fixtures para pelo menos dois realms e provar ausência de colisão com mesmo
   `source_id`, item e localização.
8. Atualizar contrato e documentação operacional.

## Depende de

Task 01. A task 02 deve estar concluída antes de distribuir o client alterado.

## Testes automatizados

- Header ausente/desconhecido → 422/400 antes do broker.
- Mesmo `source_id` em West e Europe → duas linhas isoladas; reenvio no mesmo realm → upsert.
- Histórico, cobertura, rollup, cache e `scope=mine` não cruzam realms.
- Endpoints sem `server` ou com valor inválido falham claramente.
- Migration sobe do zero e a partir do schema atual conforme a estratégia de legado aprovada.
- Go testa mapeamento 1/2/3, realm desconhecido e header somente em `+token`.

## Testes manuais

1. Enviar payload sintético idêntico para dois realms e consultar ambos separadamente.
2. Rodar client no jogo e confirmar header/linha/cache do realm real.
3. Verificar que nenhum log contém token e que realm aparece nos campos diagnósticos esperados.

## Só o humano pode validar

- Informar o realm dos dados legados ou autorizar limpeza dos fatos regeneráveis.
- Testar contas/personagens em realms diferentes, se disponíveis.

