# 01 — Baseline Git e README raiz

> Corrige `R03` de [../../05-revisao-fases-0-a-2.md](../../05-revisao-fases-0-a-2.md).

## Objetivo

Transformar a pasta atual em um repositório rastreável e documentar o caminho canônico para uma
pessoa nova reproduzir o ambiente sem depender de conversa, `AGENTS.md` ou memória local.

## Por que

O Git raiz não tem commits nem remote e todo o projeto aparece como untracked. Assim não existe
baseline para distinguir upstream de patch local, revisar mudança, reverter release ou reproduzir
o estado validado. O `albiondata-client/README.md` ainda é o README upstream e não existe README
do produto na raiz.

## O que implementar

1. Auditar `.gitignore`: segredos, `.env`, `config.yaml`, logs, binários, caches, dumps temporários
   e artefatos de captura não intencionais não podem entrar no commit.
2. Confirmar licença/origem dos dois dumps grandes antes de versioná-los. Se não puderem entrar no
   Git, documentar fonte, versão, checksum e procedimento de obtenção; não usar Git LFS por
   impulso sem decidir onde o remote será hospedado.
3. Criar `README.md` raiz com arquitetura, requisitos, comandos de dev/teste, ordem de bootstrap,
   status das fases, limites conhecidos e links para `docs/README.md`.
4. Registrar o remote do produto quando o usuário fornecer a URL. Preservar no README do fork a
   URL upstream e a estratégia de sincronização (`upstream` separado de `origin`).
5. Criar o commit baseline somente depois de revisar `git diff --cached --stat` e procurar
   segredos. **Nunca fazer push sem autorização explícita do usuário.**
6. Adicionar política mínima de commits/releases e deixar claro que patches no fork continuam
   marcados `PATCH LOCAL (Albion Profit Pro)`.

## Depende de

Nada. É a primeira task para que as correções seguintes tenham histórico real.

## Testes automatizados

- Varredura por padrões de segredo/token em arquivos staged.
- `git status --short` não lista caches, `.env`, `config.yaml`, logs ou binários.
- Links Markdown do novo README resolvem para arquivos existentes.

## Testes manuais

1. Clonar o remote em uma pasta limpa.
2. Seguir somente o README até conseguir executar lint/testes.
3. Confirmar `git remote -v` com `origin` do Profit Pro e, se configurado, `upstream` do client.

## Só o humano pode validar

- Autorizar a URL/visibilidade do remote e o primeiro push.
- Confirmar a política de distribuição/licença dos dumps.

