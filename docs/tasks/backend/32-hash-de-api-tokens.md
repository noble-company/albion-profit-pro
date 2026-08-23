# 32 — Hash dos tokens de API

> Corrige **A1** de [../../04-revisao-fase-1.md](../../04-revisao-fase-1.md).

## Objetivo
Parar de guardar os tokens do client Go em texto plano no banco: armazenar só o `sha256` e
fazer o lookup pelo hash.

## Por que
`src/api_tokens/models.py:16` guarda o valor cru, e `get_valid_token`
(`src/api_tokens/service.py:23`) busca por ele. **Um dump do Postgres entrega todos os tokens
de client funcionando** — e esses tokens dão acesso de escrita ao ingest.

A ironia é que o schema já *documenta* a intenção certa: o docstring de `ApiTokenCreated` diz
que a criação é "a única vez que o token em texto plano é exposto". Só que ele fica exposto no
banco para sempre.

Token de API é credencial, e vale a mesma regra da senha: o servidor não precisa saber o valor,
só precisa reconhecer. Diferente de senha, aqui **`sha256` puro basta** (sem bcrypt/argon2): o
token tem 192 bits de entropia vindos de `secrets.token_hex(24)`, não é adivinhável por força
bruta, e o custo de KDF por request no caminho quente do ingest não se paga.

## O que implementar

### Modelo
```python
class ApiToken(Base):
    __tablename__ = "api_token"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), index=True)

    # sha256 hex do token cru -- o valor em texto so existe na resposta da criacao.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    # 4 ultimos caracteres do token, so pra UI ("apk_...a3f9") -- nao e segredo.
    token_sufixo: Mapped[str] = mapped_column(String(8))

    nome: Mapped[str | None] = mapped_column(String(64))   # "PC de casa", ajuda quem tem varios
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ultimo_uso_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
```

`ultimo_uso_em` é barato e resolve "esse token ainda é usado?" na hora de revogar. Atualizar de
forma assíncrona ou com granularidade grossa (só se passou mais de 1 h) pra não escrever no
banco a cada request de ingest.

### Serviço
```python
def hash_token(cru: str) -> str:
    return hashlib.sha256(cru.encode()).hexdigest()

async def get_valid_token(session, cru: str) -> ApiToken | None:
    ...where(ApiToken.token_hash == hash_token(cru), ApiToken.revoked_at.is_(None))
```

`create_token` devolve o valor cru **uma vez** (para a resposta) e persiste só o hash.
`ApiTokenPublic` passa a expor `token_sufixo` e `nome` em vez de nada.

### Migration
Não dá pra derivar o hash reverso — mas **dá pra derivar o hash dos tokens existentes**, porque
temos o valor cru no banco agora:
```sql
ALTER TABLE api_token ADD COLUMN token_hash varchar(64);
UPDATE api_token SET token_hash = encode(sha256(token::bytea), 'hex');
UPDATE api_token SET token_sufixo = right(token, 4);
ALTER TABLE api_token DROP COLUMN token;
```
Ou seja, **nenhum token em uso é invalidado** pela migração. (`sha256()` nativo exige Postgres
11+; temos 16.)

## Bibliotecas/dependências
Nenhuma nova (`hashlib` é stdlib).

> **Nota de implementação (2026-08-22):** `create_token` continua devolvendo uma instância
> `ApiToken` com `.token` acessível — mas agora é um atributo Python transiente (setado
> depois de persistir, nunca uma coluna mapeada), não a coluna `token` que existia antes.
> Isso manteve `router.py`/`dependencies.py`/`schemas.py` (`ApiTokenCreated`) e todos os
> testes existentes funcionando sem alteração — só `models.py`/`service.py` mudaram de
> verdade, mais os testes novos.

## Depende de
Task 25 (as colunas de tempo viram `TIMESTAMPTZ` na mesma leva).

## Testes manuais
1. Criar token pela API, guardar o valor.
2. `SELECT * FROM api_token` → **não existe** coluna com o valor legível; só hash e sufixo.
3. Usar o token no `POST /marketorders.ingest` → 200.
4. Revogar → mesmo token dá 401.

## Testes automatizados
- Token criado autentica; o valor cru **não** aparece em nenhuma coluna
  (`SELECT * FROM api_token` e afirmar que nenhum campo contém a string).
- `GET /auth/tokens` não reexpõe o token (teste que já existe, ajustar pro novo schema).
- Token revogado → 401.
- Token de outro usuário não pode ser revogado (teste que já existe, manter).
- Migration: gravar um token no formato antigo, rodar `upgrade`, afirmar que ele **continua
  autenticando** (prova que a migração não invalida ninguém).
