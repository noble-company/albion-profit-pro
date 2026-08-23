# Releases e atualizações do client

Política operacional do fork `albiondata-client/` distribuído pelo Albion Profit Pro.

## Limite de confiança

O executável do produto nunca pode consultar ou instalar releases de
`ao-data/albiondata-client`. O upstream é fonte de código para revisão, não um canal de binários.

O auto-updater possui dois estados compilados:

- `disabled`: padrão de todo build local e do workflow de release atual;
- `github`: opt-in que aceita exclusivamente `noble-company/albion-profit-pro`.

Owner e repositório não são flags nem opções do `config.yaml`. Uma origem desconhecida, metadados
incompletos ou versão inválida desabilitam o updater e geram erro no log. Versão, canal, origem e
estado aparecem no log e no systray; tokens nunca fazem parte desses dados.

## Gerar uma release

1. Revisar a árvore e executar `go test ./...` e `scripts/validate-fmt.sh` em
   `albiondata-client/`.
2. Criar uma tag `vMAJOR.MINOR.PATCH` somente a partir de um commit aprovado.
3. Publicar uma GitHub Release no repositório do produto. O workflow
   `.github/workflows/client-release.yml` remove o prefixo `v`, injeta a versão no binário e gera
   os artefatos para Windows, Linux e macOS. A variável de repositório
   `PROFITPRO_INGEST_URL` pode injetar o destino oficial `https+token://...`.
4. Conferir os arquivos `.sha256` publicados contra os respectivos artefatos.
5. Assinar os executáveis/instaladores e registrar o certificado quando ele existir. Enquanto
   esse gate for manual, não habilitar atualização automática no workflow.
6. Executar o binário com `-version` e confirmar no log/systray: versão esperada, canal
   `disabled`, updater desabilitado e origem `none`. Sem `PROFITPRO_INGEST_URL`, confirmar também
   “release sem destino” e upload desabilitado — nunca `localhost`.

Os scripts aceitam `VERSION`, `UPDATE_CHANNEL`, `UPDATE_GITHUB_OWNER`, `UPDATE_GITHUB_REPO`,
`BUILD_PROFILE` e `PUBLIC_INGEST_BASE_URL` como entradas de build. Empacotamentos usam
`BUILD_PROFILE=release`; URL vazia é deliberadamente fail-closed. A única combinação de updater
habilitada é:

```text
UPDATE_CHANNEL=github
UPDATE_GITHUB_OWNER=noble-company
UPDATE_GITHUB_REPO=albion-profit-pro
```

Essa combinação existe para o canal futuro; não deve ser usada em publicação antes de fechar a
assinatura de código e validar o fluxo de rollback.

## Incorporar mudanças do upstream

1. Obter a revisão desejada de `https://github.com/ao-data/albiondata-client` em clone separado.
2. Comparar a revisão conhecida e selecionar apenas mudanças necessárias.
3. Portar mudanças em commits pequenos e revisáveis, preservando CRLF.
4. Revalidar cada trecho marcado `PATCH LOCAL (Albion Profit Pro)`.
5. Executar a suíte Go completa e os testes reais proporcionais à mudança.

Não adicionar o upstream como origem de atualização, não copiar seus artefatos de release e não
substituir o executável do produto por um binário vanilla.

## Verificar checksums

Linux/macOS:

```bash
sha256sum -c update-linux-amd64.gz.sha256
```

Windows PowerShell:

```powershell
Get-FileHash -Algorithm SHA256 .\albiondata-client-amd64-installer.exe
Get-Content .\albiondata-client-amd64-installer.exe.sha256
```

O checksum detecta corrupção ou substituição do arquivo depois do build; ele não substitui
assinatura de código nem autentica sozinho quem publicou a release.
