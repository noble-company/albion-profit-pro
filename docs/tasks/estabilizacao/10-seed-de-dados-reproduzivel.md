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

