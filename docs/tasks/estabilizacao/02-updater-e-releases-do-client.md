# 02 — Updater e releases próprias do client

> Corrige `R01` de [../../05-revisao-fases-0-a-2.md](../../05-revisao-fases-0-a-2.md).

## Objetivo

Garantir que nenhum binário do Albion Profit Pro consulte ou instale automaticamente releases do
repositório oficial `ao-data/albiondata-client`.

## Por que

`startUpdater()` ativa em builds versionados e `ConfigGlobal` ainda aponta para o upstream. Uma
release oficial mais nova pode substituir o executável pelo client vanilla, removendo token,
destino e patches locais. O teste ponta a ponta usou build local sem versão e não exercitou isso.

## O que implementar

1. Remover os defaults upstream de `UpdateGithubOwner`/`UpdateGithubRepo` para builds Profit Pro.
2. Até existir repositório/canal próprio de releases, deixar auto-update **desabilitado por
   padrão**. Não tratar “versão vazia” como mecanismo de segurança de produção.
3. Quando houver canal próprio, habilitar updater apenas com owner/repo compilados ou configuração
   assinada/controlada pelo produto; falhar fechado se apontar para origem não permitida.
4. Exibir no log e systray versão, canal e estado do updater sem expor token.
5. Documentar como incorporar mudanças do upstream via Git/review, nunca via auto-update do
   binário distribuído.
6. Preparar o build para gerar artefatos com versão do Profit Pro e checksums. Assinatura de código
   pode ficar como passo manual enquanto não houver certificado, mas deve estar documentada.
7. Todo código local novo mantém CRLF e marcador `PATCH LOCAL`; não executar `gofmt -w`.

## Depende de

Task 01 (identidade do repositório/canal de release).

## Testes automatizados

- Build versionado do Profit Pro não cria updater apontando para `ao-data`.
- Configuração upstream é rejeitada ou permanece desabilitada.
- Canal próprio válido pode ser injetado sem afetar parsing das flags existentes.
- `go test ./...` e comparação de formatação ignorando EOL.

## Testes manuais

1. Gerar binário com uma versão sem `dev` e iniciá-lo conectado à internet.
2. Confirmar em log/systray que updater está desabilitado ou usa somente o canal Profit Pro.
3. Simular versão upstream maior e provar que o executável não muda.

## Só o humano pode validar

- Escolher repositório/canal oficial e, futuramente, certificado de assinatura.
- Autorizar publicação de release.

## Resultado da implementação (2026-08-23)

- Updater desabilitado explicitamente por padrão, inclusive em builds versionados.
- Origem upstream removida da configuração; o único canal habilitável é
  `noble-company/albion-profit-pro`, compilado no binário e validado com falha fechada.
- Versão, canal, origem e estado agora são registrados no log e apresentados no systray.
- Scripts e workflow raiz geram artefatos versionados e checksums SHA-256 para Windows, Linux e
  macOS. Assinatura de código continua como gate humano antes de habilitar auto-update.
- Workflows mortos dentro de `albiondata-client/.github/workflows/` foram substituídos por
  workflows válidos na raiz do monorepo.
- O glob legado `albiondata-client*` deixou de esconder o entrypoint Go, os ícones e a fonte NSIS;
  esses arquivos agora fazem parte do baseline reproduzível necessário ao build em clone limpo.
- Política de release, verificação e sincronização seletiva com upstream documentada em
  [../../07-releases-do-client.md](../../07-releases-do-client.md).

### Validação executada

- `go test ./...`: verde.
- `go vet . ./clientupdate ./systray`: verde. O vet global mantém somente o warning upstream de
  `unsafe.Pointer` já registrado na auditoria e reservado para a Task 14.
- Três builds `1.2.3` exercitados com `-version`: padrão explicitamente desabilitado; origem
  `ao-data/albiondata-client` rejeitada e reduzida a estado seguro; origem própria aceita.
- SHA-256 do build versionado conferido antes/depois da execução: executável inalterado.
- `scripts/validate-fmt.sh`: verde nos arquivos alterados, comparando conteúdo com EOL
  normalizado sem executar `gofmt -w`.
- Workflows raiz analisados como YAML e scripts de build validados com `bash -n`.

### Validações ainda humanas

- Abrir o build Windows e conferir visualmente a linha de versão/canal/estado no systray.
- Autorizar e acompanhar a primeira GitHub Release para validar os três runners e seus assets.
- Adquirir/selecionar o certificado e fechar assinatura e rollback antes de habilitar auto-update.
