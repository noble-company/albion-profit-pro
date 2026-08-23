# 15 — Schemas Pydantic de ingest

## Objetivo
Schemas Pydantic que espelham 1:1 os structs Go do client, pra validar (e documentar via OpenAPI/Swagger) exatamente o que o router de ingest (task 16) vai aceitar.

## Por que
O client não vai mudar (a não ser pelo header de auth, Fase 2 — fora deste plano) — então o backend precisa aceitar o payload **exatamente como ele é hoje**. Isso foi extraído verbatim do código Go (ver seção "Contrato de ingest" do plano macro desta fase), não é suposição.

## O que implementar
`src/ingest/schemas.py`:
```python
from pydantic import BaseModel, Field


class MarketOrderIn(BaseModel):
    id: int = Field(alias="Id")
    item_id: str = Field(alias="ItemTypeId")
    group_type_id: str = Field(alias="ItemGroupTypeId")
    location_id: str = Field(alias="LocationId")
    quality_level: int = Field(alias="QualityLevel")
    enchantment_level: int = Field(alias="EnchantmentLevel")
    unit_price_silver: int = Field(alias="UnitPriceSilver")
    amount: int = Field(alias="Amount")
    auction_type: str = Field(alias="AuctionType")
    expires: str = Field(alias="Expires")

    model_config = {"populate_by_name": True}


class MarketUploadIn(BaseModel):
    orders: list[MarketOrderIn] = Field(alias="Orders")

    model_config = {"populate_by_name": True}


class MarketHistoryEntryIn(BaseModel):
    item_amount: int = Field(alias="ItemAmount")
    silver_amount: int = Field(alias="SilverAmount")
    timestamp: int = Field(alias="Timestamp")

    model_config = {"populate_by_name": True}


class MarketHistoriesUploadIn(BaseModel):
    albion_id: int = Field(alias="AlbionId")
    location_id: str = Field(alias="LocationId")
    quality_level: int = Field(alias="QualityLevel")
    timescale: int = Field(alias="Timescale")  # 0=Hours, 1=Days, 2=Weeks — validar range 0-2
    histories: list[MarketHistoryEntryIn] = Field(alias="MarketHistories")

    model_config = {"populate_by_name": True}


class GoldPricesUploadIn(BaseModel):
    prices: list[int] = Field(alias="Prices")
    timestamps: list[int] = Field(alias="Timestamps")

    model_config = {"populate_by_name": True}
```

Notas críticas de implementação:
- **`Field(alias=...)`**: o JSON que chega usa `PascalCase` (convenção Go/C#), nosso código Python usa `snake_case` — o `alias` faz o Pydantic aceitar o JSON como está sem precisarmos renomear nada no client. `populate_by_name = True` permite também instanciar via `snake_case` nos testes, sem depender só do alias.
- **`Timescale` como `int` puro** (não Enum/string) — o Go manda um inteiro cru (`uint8`), não o texto "Hours"/"Days". Se modelarmos como Enum, o FastAPI/Pydantic v2 ainda aceita o inteiro puro contanto que o Enum seja `class Timescale(int, Enum)` — decisão de implementação: pode ficar como `int` simples validado com `Field(ge=0, le=2)` (mais simples) ou como Enum tipado (mais expressivo) — ambas funcionam, escolher na hora pela preferência de quem implementar.
- **Não adicionar campos extras que o Go não manda** (ex: não inventar um `character_id` obrigatório no payload) — a autenticação (quem mandou) vem do token (task 08/16), não do corpo do JSON.

## Bibliotecas/dependências
Nenhuma nova — usa Pydantic v2, já dependência do FastAPI.

## Depende de
Task 02 (estrutura de pastas). Pode ser feita em paralelo com as tasks de modelo (10-12), já que schemas de entrada e modelos de banco são conceitualmente separados (mapeamento entre um e outro acontece na task 17).

## Testes manuais
Nenhum isolado — schemas puros são validados via os testes automatizados e, na prática, pelo router de ingest (task 16) quando ele existir.

## Testes automatizados
- `tests/ingest/test_schemas.py`: cola o JSON real de exemplo (usar os exemplos verbatim do plano/contrato) e confirma que `MarketUploadIn.model_validate(payload)` funciona sem erro e que os campos batem; testa também que payload malformado (ex: `QualityLevel` como string) é rejeitado com `ValidationError` (o client nunca deveria mandar isso, mas o schema precisa ser estrito — falha visível é melhor que dado corrompido silencioso).
