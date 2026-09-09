"""Valor de item — a base da taxa da estação (task 4/18).

O jogo cobra a estação por **nutrição consumida**, e a nutrição sai do valor do item
(`nutrição = itemvalue × 0,1125`). O `ITEM DUMP.json` publica `@itemvalue` para recurso bruto e
refinado, mas **não** para arma nem equipamento — 771 e 1.126 entradas sem o campo, o que cobre
quase toda a tela de Craft.

A derivação usa a regra que o próprio dump obedece onde publica os dois lados:

    valor = Σ (valor do ingrediente × contagem)

Verificada em todo refino: `T8_LEATHER = T8_HIDE×5 (25,6) + T7_LEATHER×1 (128) = 256`, e o dump
diz 256. Para equipamento ela é **inferência**, não leitura.

O detalhe que decide a correção é o **encantamento**, porque os dois padrões de nome do dump se
comportam de formas opostas:

- `T4_LEATHER_LEVEL2@2` — a entrada `T4_LEATHER_LEVEL2` publica o valor **do nível** (64). Ler
  a entrada é o certo.
- `T4_ARMOR_LEATHER_SET1@2` — tirar o `@2` cai na entrada **sem encanto** (256). O valor do
  nível 2 é 1.024, e sai do bloco `enchantments.enchantment[]`, que tem `craftingrequirements`
  próprio com os ingredientes já encantados.

Nenhuma entrada do dump tem `@itemvalue` **e** blocos de encantamento ao mesmo tempo (verificado:
0 casos), então a regra não é ambígua: publicado ganha; na falta dele, deriva-se da receita
daquele nível.
"""

from decimal import Decimal, InvalidOperation

from scripts._dumps import as_list


def _decimal(raw: str | float | None) -> Decimal | None:
    """`Decimal(str(...))` preserva o valor escrito. `25.6` passando por float entraria numa
    soma cujo resultado o usuário lê como taxa cobrada."""
    if raw is None:
        return None
    try:
        return Decimal(str(raw))
    except InvalidOperation:
        return None


def _split(unique_name: str) -> tuple[str, int]:
    if "@" not in unique_name:
        return unique_name, 0
    base, level = unique_name.rsplit("@", 1)
    return (base, int(level)) if level.isdigit() else (unique_name, 0)


def _index(dump_items: dict) -> dict[str, dict]:
    """Índice de **todas** as seções, não só as quatro relevantes: um ingrediente pode morar em
    qualquer uma, e uma cadeia que quebra no meio devolve valor nulo para o item inteiro."""
    index: dict[str, dict] = {}
    for section in dump_items.values():
        for entry in as_list(section):
            if isinstance(entry, dict) and "@uniquename" in entry:
                index[entry["@uniquename"]] = entry
    return index


def _requirements(entry: dict, level: int) -> list[dict]:
    """As receitas que produzem o item **naquele nível de encantamento**."""
    if level == 0:
        return [r for r in as_list(entry.get("craftingrequirements")) if isinstance(r, dict)]

    enchantments = entry.get("enchantments") or {}
    for block in as_list(enchantments.get("enchantment")):
        if isinstance(block, dict) and str(block.get("@enchantmentlevel")) == str(level):
            return [r for r in as_list(block.get("craftingrequirements")) if isinstance(r, dict)]
    return []


def _resource_name(resource: dict) -> str:
    """No bloco de encantamento o recurso já vem nomeado com o nível (`T4_LEATHER_LEVEL2`); nas
    receitas base ele traz `@enchantmentlevel` separado. Os dois formatos existem no dump."""
    name = resource["@uniquename"]
    level = resource.get("@enchantmentlevel")
    if level is not None and str(level).isdigit() and int(level) > 0:
        return f"{name}@{int(level)}"
    return name


def resolve_item_values(dump_items: dict, names: set[str] | None = None) -> dict[str, Decimal]:
    """Valor de cada `unique_name`, incluindo as variantes `@N`.

    `names` é o conjunto a resolver — o import passa os nomes de `items.json`, que é a lista
    autoritativa. Sem ele, o conjunto sai do próprio dump, o que serve para inspeção mas depende
    de a entrada declarar `@enchantmentlevel` (três extratos de alquimia não declaram).

    Item cuja cadeia não resolve **fica de fora do dicionário** — ausente é ausente (`X02`).
    Somar ingrediente sem valor como se valesse zero produziria uma taxa de estação inventada.
    """
    index = _index(dump_items)
    resolved: dict[str, Decimal | None] = {}
    visiting: set[str] = set()

    def value_of(unique_name: str) -> Decimal | None:
        if unique_name in resolved:
            return resolved[unique_name]

        base, level = _split(unique_name)
        entry = index.get(base)
        if entry is None:
            return None

        published = _decimal(entry.get("@itemvalue"))
        if published is not None:
            resolved[unique_name] = published
            return published

        # Ciclo: uma receita que depende de si mesma não tem valor derivável. Sem esta guarda a
        # recursão não termina.
        if unique_name in visiting:
            return None
        visiting.add(unique_name)
        try:
            # Receitas alternativas: vale a **primeira que resolve inteira**. Somar a mais barata
            # faria o valor depender de uma rota, e valor de item não depende de rota.
            for requirement in _requirements(entry, level):
                resources = [
                    r for r in as_list(requirement.get("craftresource")) if isinstance(r, dict)
                ]
                if not resources:
                    continue
                total = Decimal("0")
                complete = True
                for resource in resources:
                    ingredient = value_of(_resource_name(resource))
                    if ingredient is None:
                        complete = False
                        break
                    total += ingredient * int(resource["@count"])
                if complete:
                    resolved[unique_name] = total
                    return total
        finally:
            visiting.discard(unique_name)

        resolved[unique_name] = None
        return None

    if names is None:
        names = set()
        for base, entry in index.items():
            names.add(base)
            own_level = entry.get("@enchantmentlevel")
            if own_level is not None and str(own_level).isdigit() and int(own_level) > 0:
                names.add(f"{base}@{int(own_level)}")
            for block in as_list((entry.get("enchantments") or {}).get("enchantment")):
                if isinstance(block, dict) and str(block.get("@enchantmentlevel", "")).isdigit():
                    names.add(f"{base}@{int(block['@enchantmentlevel'])}")

    return {name: value for name in names if (value := value_of(name)) is not None}
