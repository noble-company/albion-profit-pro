# Revisão das Fases 0 a 2 — estabilização antes do frontend

> Auditoria feita em 2026-08-23 sobre documentação, backend, migrations, scripts, imagem
> Docker e fork Go. Esta revisão sucede a revisão específica da Fase 1
> ([04-revisao-fase-1.md](04-revisao-fase-1.md)) e origina a
> [Fase 2.5](tasks/estabilizacao/README.md).

## Verificações executadas

- `uv run ruff check .` — passou.
- `uv run pytest tests/ -v` — **131 testes passaram** com Postgres, Redis e RabbitMQ reais.
- `go test ./...` — passou.
- `go vet ./client/` — somente o `unsafe.Pointer` preexistente do upstream.
- `docker build` — passou; a imagem roda como usuário não-root.
- `go test -race ./client` — não executado: ambiente atual sem CGO/compilador C.
- O teste no jogo da task client 10 não foi repetido nesta auditoria.

Testes verdes confirmam o comportamento coberto, mas não cobrem os defeitos abaixo.

## Achados

| ID | Severidade | Achado | Consequência | Task |
|---|---|---|---|---|
| `R01` | Crítica | O auto-updater de release continua apontando para `ao-data/albiondata-client`. | Uma release oficial mais nova pode sobrescrever nosso binário e remover autenticação/destino próprios. | 02 |
| `R02` | Crítica | Não há `server_id` no contrato persistido; West/East/Europe chegam ao mesmo destino. | Economias se misturam e `source_id` pode colidir entre realms. | 03 |
| `R03` | Crítica operacional | O Git raiz não tem commit nem remote; todo o projeto está untracked. | Sem baseline, rollback, rastreabilidade ou rebase real do fork. | 01 |
| `R04` | Alta | O rollup diário usa `agora - 2 dias`, não começo de dia. | O primeiro dia é agregado parcialmente e sobrescrito com totais cada vez menores. | 04 |
| `R05` | Alta | Os `EXISTS` de `scope=mine` ignoram `MarketScan.fonte`. | Cobertura de histórico libera livro global e vice-versa. | 05 |
| `R06` | Alta | Wrappers Celery capturam `Exception`, logam e retornam. | Erro permanente recebe ACK de sucesso e o dado desaparece sem DLQ. | 06 |
| `R07` | Alta | Schemas aceitam valores fora do domínio e datas arbitrárias. | Lixo chega à fila; parte falha apenas no worker e pode ser descartada por `R06`. | 07 |
| `R08` | Alta de segurança | Token cru entra na chave Redis (`F7`) e o IP confia em qualquer `X-Forwarded-For`. | Segredo fica recuperável no Redis e brute force pode contornar limite por spoofing. | 08 |
| `R09` | Alta | O client não tem retry/spool e cria goroutines sem limite sobre estado compartilhado. | Falha transitória perde lote; backend lento acumula goroutines; há risco de data race. | 09 |
| `R10` | Alta operacional | A imagem não contém os dumps nem oferece job reproduzível de seed. | Deploy limpo fica sem itens/receitas; histórico não resolvido perde cobertura. | 10 |
| `R11` | Média/alta | Ingest, rollups e poda usam a mesma fila; resultados fire-and-forget ficam no Redis. | Manutenção pesada atrasa ingest e gera churn desnecessário. | 11 |
| `R12` | Média/alta | “Profundidade atual” soma ordens vistas em momentos diferentes e só expira por frescor. | Cancelamentos/vendas permanecem temporariamente e totais podem parecer mais completos do que são. | 12 |
| `R13` | Média | `/client/me` existe, mas o client não o chama; default continua `localhost`. | Token/configuração errados só aparecem depois de uma coleta e uma release pode sair apontando para dev. | 13 |
| `R14` | Média | Documentos divergem em status, testes, migrations/import e instruções de operação. | Próxima fase pode partir de premissas falsas; onboarding não é reproduzível. | 14 |

## Decisões de arquitetura da Fase 2.5

1. **Realm é parte obrigatória da identidade do dado.** A plataforma deve suportar West, East e
   Europe sem misturar mercados. A task 03 fecha o contrato ponta a ponta; a implementação não
   pode deixar um período onde dados sem realm continuem entrando silenciosamente.
2. **Erro permanente não é sucesso.** Payload rejeitado na borda recebe 4xx; falha inesperada no
   worker falha a task e fica observável/reprocessável.
3. **Postgres continua sendo fonte de verdade.** Retry/spool no client é transporte; Redis nunca
   vira armazenamento único.
4. **Seed é parte do deploy.** Migration cria schema; job idempotente de seed carrega dados
   estáticos e registra versão/checksum da fonte.
5. **A Fase 3 só começa depois do gate da task 14.** Não faz sentido construir a calculadora
   sobre preço misturado, rollup corruptível ou release que pode se auto-substituir.

## Fora do escopo desta fase

- Implementar o frontend/calculadora.
- Voltar a capturar craft/refino em tempo real.
- Modelar as ~3200 receitas alternativas hoje puladas; continua pendência explícita de
  [02-dados-de-receita.md](02-dados-de-receita.md).
- Corrigir todos os problemas históricos do upstream Go. A task 09 toca somente concorrência e
  transporte que afetam diretamente nossa coleta.

