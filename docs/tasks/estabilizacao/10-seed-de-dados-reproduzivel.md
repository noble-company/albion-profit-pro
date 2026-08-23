# 10 — Seed de dados reproduzível

> Corrige `R10` de [../../05-revisao-fases-0-a-2.md](../../05-revisao-fases-0-a-2.md).

## Objetivo

Fazer um ambiente vazio receber itens e receitas de forma idempotente, versionada e verificável,
sem depender dos dumps existirem na máquina do operador em caminhos implícitos.

## Por que

A imagem do backend contém scripts, mas não `items.json` nem `ITEM DUMP.json`. Migration cria só o
schema. Sem `item`, histórico gravado não resolve `unique_name`/cobertura; sem receitas, não existe
base para a calculadora.

## O que implementar

1. Resolver na task 01 se os dumps podem ser redistribuídos. Escolher uma estratégia explícita:
   artefato versionado/armazenamento controlado, volume read-only ou imagem/job de seed construída
   com contexto apropriado. Não baixar “latest” sem checksum.
2. Criar manifesto de dataset com origem, data/versão, tamanho, SHA-256 e contagens esperadas.
3. Criar comando/job único de bootstrap que valida manifesto, importa `item` antes de `recipe`,
   roda em transação por etapa e falha claramente se fonte estiver ausente/corrompida.
4. Persistir versão/checksum aplicado no banco para auditoria e evitar reimport desnecessário.
5. Manter reimport idempotente e definir atomicidade: leitores nunca devem observar receitas
   apagadas no meio da troca.
6. Tratar histórico recebido antes do catálogo: backfill de `market_scan`/cache ou impedir ingest
   readiness até seed obrigatório terminar. A escolha deve ficar documentada.
7. Integrar o job à ordem de deploy: `migrate → seed → API/worker/beat` (ajustada na task 11).
8. As ~3200 receitas alternativas continuam fora do escopo, mas contagem pulada é verificada e
   registrada como métrica/resultado do seed.

## Depende de

Tasks 01 e 03 (licença/fonte dos dumps e schema definitivo com realm).

## Testes automatizados

- Dataset ausente, checksum errado e contagem inesperada falham antes de apagar dado válido.
- Banco vazio termina com contagens esperadas e versão persistida.
- Segunda execução não muda contagens/IDs observáveis indevidamente.
- Falha entre item/recipe não deixa estado parcialmente declarado como concluído.
- Histórico pré-catálogo recebe tratamento/backfill definido.

## Testes manuais

Construir imagem/job como produção, iniciar banco vazio e executar toda a ordem sem acessar arquivos
fora dos artefatos declarados.

## Só o humano pode validar

Licença/fonte de distribuição e armazenamento do dataset no ambiente real.

## Implementação — 2026-08-23

- Os dumps continuam fora do Git e da imagem. O bootstrap usa download direto de uma revisão
  imutável com checksum ou, alternativamente, um volume explícito somente leitura.
- O manifesto `backend/datasets/albion-static-2026-08-23.json` fixa a revisão
  `5cf2e8e9b7021f98683181fa5b0e3c64575978e4`, tamanhos, hashes e contagens esperadas.
- `python -m scripts.seed_static_data` valida todo o dataset antes da escrita, serializa execuções
  com advisory lock e troca itens, receitas e versão ativa em uma única transação.
- `static_dataset_version` mantém o histórico de auditoria. Reexecutar o mesmo manifesto retorna
  `unchanged`, sem alterar IDs observáveis.
- `/ready` exige uma versão ativa, impedindo API e ingest operacional antes do catálogo.
- A ordem documentada de produção é `migrate → seed → API/worker/beat`; a task 11 materializa os
  processos e filas.

### Validação executada

- Dumps reais: 12.071 entradas, 12.062 itens importáveis, 9 nomes longos, 5.553 receitas, 3.219
  alternativas puladas e 78 receitas sem item correspondente.
- `uv run pytest tests/ -q`: **213 passed**, 1 aviso preexistente do Testcontainers.
- Imagem `profitpro-backend:task10`: migration e seed executados contra PostgreSQL vazio, com
  12.062 itens, 5.553 receitas e uma versão ativa; segunda execução retornou `unchanged`.
- O download padrão da revisão fixada produziu exatamente 23.954.341 e 17.219.057 bytes.
- Os containers e a rede temporários usados na validação foram removidos ao final.

### Pendência operacional

No stack real, o operador ainda deve escolher entre download direto e volume privado somente
leitura. Essa escolha de infraestrutura não altera o contrato do seed e será materializada junto
à operação da task 11.
