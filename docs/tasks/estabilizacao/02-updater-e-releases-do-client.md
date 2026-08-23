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

