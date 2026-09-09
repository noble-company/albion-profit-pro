"""O `ETag` do catálogo tem que mudar quando o **formato** da resposta muda.

Incidente real (task 4/17): `crafting_category` entrou no `CatalogItemOut`, o servidor passou a
devolver o campo — e o cliente continuou sem ele. O `ETag` dependia só da versão do dataset
estático, que não mudou porque o dado do jogo não mudou; o navegador revalidava, recebia `304` e
servia o corpo antigo do próprio cache. Dois níveis de cache (HTTP e IndexedDB) concordando em
guardar um corpo sem o campo novo.

O sintoma foi silencioso do pior jeito: o custo de foco aparecia como se o jogador não tivesse
especialização nenhuma, sem erro em lugar nenhum.
"""

from src.catalog.service import etag_for, shape_digest


def test_formatos_diferentes_produzem_digests_diferentes():
    assert shape_digest([("Item", ["a", "b"])]) != shape_digest([("Item", ["a", "b", "c"])])


def test_a_ordem_dos_campos_nao_muda_o_digest():
    """Reordenar campo não muda o corpo de forma relevante — só o `json` que já é objeto. Fazer
    o digest depender disso invalidaria cache à toa a cada refactor cosmético."""
    assert shape_digest([("Item", ["b", "a"])]) == shape_digest([("Item", ["a", "b"])])


def test_o_etag_carrega_o_formato_alem_da_versao_do_dataset():
    """A garantia que faltava: mesmo dataset, formato novo, validador novo."""
    assert etag_for("mesma-versao", None, shape="formato-1") != etag_for(
        "mesma-versao", None, shape="formato-2"
    )


def test_kind_continua_separando_os_validadores():
    assert etag_for("v", "refining") != etag_for("v", "crafting")


def test_o_etag_real_usa_o_formato_atual_dos_schemas():
    """Sem argumento, o `ETag` reflete os schemas de verdade — é o caminho que a rota usa."""
    from src.catalog.schemas import CatalogItemOut

    atual = etag_for("v", None)

    campo_novo = [(CatalogItemOut.__name__, [*CatalogItemOut.model_fields, "campo_novo"])]
    assert etag_for("v", None, shape=shape_digest(campo_novo)) != atual
