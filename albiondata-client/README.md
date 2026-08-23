# Albion Profit Pro — Client

Cliente desktop que observa passivamente o tráfego local do Albion Online, extrai dados de mercado
e os envia de forma autenticada ao backend do Albion Profit Pro.

Esta pasta é um fork modificado do
[`ao-data/albiondata-client`](https://github.com/ao-data/albiondata-client), distribuído sob a
licença MIT. Ela faz parte do monorepo
[`noble-company/albion-profit-pro`](https://github.com/noble-company/albion-profit-pro), não tem
`.git` próprio e não é um submódulo.

## Segurança e escopo

O cliente somente lê pacotes recebidos pela máquina. Ele não injeta, altera ou responde ao tráfego
do jogo. Os patches do Profit Pro adicionam:

- destino e token próprios de ingest;
- isolamento dos realms West, East e Europe;
- fila limitada, transporte reutilizável e retry controlado;
- validação de configuração/token antes do primeiro upload;
- estados operacionais e recarga de configuração pelo systray;
- canal de releases próprio e updater fail-closed.

Dados de mercado usam exclusivamente o canal público `-i`. O canal privado `-p` permanece vazio;
configurá-lo com o mesmo destino duplicaria os payloads públicos.

## Requisitos

### Windows

- Go compatível com o `go.mod`, para compilar;
- Npcap instalado, para capturar pacotes;
- acesso às interfaces de rede usadas pelo jogo.

### Linux

- Go;
- `libpcap-dev`;
- capability de captura no binário, se não for executado como root:

```bash
sudo setcap cap_net_raw,cap_net_admin=eip ./albiondata-client
```

### macOS

O sistema solicita privilégio para captura. O pacote de release inclui `run.command` para iniciar o
binário com a permissão necessária.

## Build e testes

```powershell
go test ./...
go vet ./client/
go build -o albiondata-client.exe .
```

No Windows, `go vet ./client/` mantém um aviso conhecido do upstream em
`client/net_interface_filter_win.go` sobre `unsafe.Pointer`. O race detector roda no CI Linux, que
possui CGO e `libpcap`:

```bash
go test -race ./...
```

Não execute `gofmt -w` sobre o fork inteiro. O upstream usa CRLF e uma reescrita global destrói a
qualidade do diff. Use `scripts/validate-fmt.sh`, que valida apenas arquivos Go alterados sem
reescrevê-los.

## Configuração

Copie o exemplo e edite o arquivo local:

```powershell
Copy-Item 'config.yaml.example' 'config.yaml'
```

```yaml
PublicIngestBaseUrls: https+token://api.exemplo.com
ApiToken: apk_substitua_pelo_token_real
EnableWebsockets: true
AllowedWebsocketHosts:
  - localhost
```

Precedência de configuração:

1. flags `-i` e `-token`;
2. `config.yaml`;
3. URL injetada durante o build de release;
4. `http+token://localhost:8000`, somente em build de desenvolvimento.

Uma release sem destino explícito inicia com upload desabilitado. O token é enviado apenas para
destinos `http+token://` ou `https+token://`; URLs comuns nunca recebem `Authorization`.

## Execução

```powershell
.\albiondata-client.exe
```

Flags úteis:

| Flag | Uso |
|---|---|
| `-i <url>` | Sobrescreve o destino público de ingest |
| `-token <token>` | Sobrescreve o token de API |
| `-d` | Desabilita todos os uploads |
| `-debug` | Ativa diagnóstico detalhado |
| `-l <interfaces>` | Restringe interfaces de captura |
| `-o <arquivo>` | Reproduz captura `.pcap`/`.gob` offline |
| `-record <arquivo>` | Grava pacotes Photon para diagnóstico |
| `-version` | Mostra versão, origem e política do updater |

No boot, o cliente chama `GET /client/me` com timeout antes de liberar uploads autenticados.
Timeout e erros 5xx entram em recuperação com backoff; 401/403 pausam até o usuário corrigir a
configuração. Depois de editar `config.yaml`, selecione **Reload Configuration** no systray.

## Realm e localização

O realm é inferido do IP do servidor observado no tráfego do jogo e enviado como
`X-Albion-Server: west|east|europe`. Ele nunca é enviado a destinos não autenticados.

Localização e realm só ficam disponíveis depois que o cliente observa uma transição de zona. Ao
iniciar parado dentro de uma cidade, atravesse uma passagem antes de abrir o mercado. Até isso
acontecer, os dados autenticados permanecem bloqueados e o systray informa o estado.

## Estados e solução de problemas

| Estado | Ação recomendada |
|---|---|
| Upload disabled | Remova `-d` e configure um destino em builds de release |
| Missing token | Configure `ApiToken` ou use `-token` |
| Unauthorized/revoked | Gere um token novo e recarregue a configuração |
| Backend unavailable | Verifique rede/backend; o cliente tenta recuperar automaticamente |
| Unknown realm | Entre no jogo e atravesse uma zona |
| Invalid destination | Use uma URL `http(s)+token://` válida e sem credenciais/query |

Se nenhuma interface aparecer no Windows, confirme que o serviço do Npcap está ativo. Logs ficam em
`albiondata-client.log`; URL e token são sanitizados antes de qualquer diagnóstico.

## Releases e updater

Releases oficiais pertencem a
[`noble-company/albion-profit-pro`](https://github.com/noble-company/albion-profit-pro/releases).
Os workflows geram binários/instaladores e arquivos `.sha256`. O updater é desabilitado por padrão
e rejeita qualquer origem diferente do repositório do produto.

O destino oficial é injetado pela variável de repositório `PROFITPRO_INGEST_URL`. Publicação,
assinatura e push exigem autorização humana. Veja a
[política de releases](../docs/07-releases-do-client.md).

## Contribuição e atualização do upstream

Todo patch do produto deve continuar marcado com `PATCH LOCAL (Albion Profit Pro)`. Para incorporar
uma atualização upstream:

1. compare a revisão desejada num clone separado;
2. porte somente mudanças relevantes em commits pequenos;
3. preserve os finais de linha existentes;
4. recoloque os patches locais onde houver conflito;
5. rode testes, race detector no CI e builds de release.

Não conecte o `origin` do monorepo nem o updater do produto ao repositório upstream.

## Licença e créditos

O código original e as modificações permanecem sob a licença MIT em [LICENSE](LICENSE). Créditos
aos criadores e mantenedores do Albion Online Data Project, incluindo Regner, pcdummy,
Ultraporing, broderickhyman, Stanx e Walkynn.
