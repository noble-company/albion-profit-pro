"""Task 4/28 — a semeadura move o histórico da API pública quando o jogo renumera os itens.

O client manda o histórico com o `AlbionId` do jogo, e o banco guarda o número cru: atualizar o
dataset corrige a leitura dele sozinho. O histórico da API pública é outro caso. Ela fala o nome
do item, e a task 23 gravou o número que o dataset **daquela época** dava ao nome — quando o
dataset muda, esse número passa a apontar para outro item. Entre as revisões de 27/07 e 08/09,
12.049 dos 12.071 índices mudaram (achado `W9`).
"""

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select

from scripts.seed_static_data import seed_static_data
from src.items.models import Item
from src.prices.models import MarketHistoryEntry
from tests.static_data.test_seed import _write_dataset

BLOCO = datetime(2026, 9, 9, 6, tzinfo=UTC)

# O fixture `_write_dataset` dá ZZSEED_FIBER = 910001 e ZZSEED_CLOTH = 910002. O "dataset anterior"
# abaixo dava 900001 e 900002 aos mesmos nomes.


def _item(nome: str, albion_id: int) -> Item:
    return Item(unique_name=nome, albion_id=albion_id, busca_normalizada=nome.lower())


def _bloco(item_id: int, source: str, unidades: int, location: str = "1002") -> MarketHistoryEntry:
    return MarketHistoryEntry(
        server_id="west",
        item_id=item_id,
        location_id=location,
        quality_level=1,
        bucket_seconds=21600,
        bucket_start=BLOCO,
        item_amount=unidades,
        silver_amount=Decimal(unidades * 100),
        source=source,
    )


async def _blocos(db_session) -> set[tuple]:
    db_session.expire_all()
    return {
        (b.item_id, b.location_id, b.source, b.item_amount)
        for b in (await db_session.scalars(select(MarketHistoryEntry))).all()
    }


async def test_semeadura_move_o_historico_da_api_para_o_numero_novo(tmp_path, db_session):
    manifest_path, dataset_dir = _write_dataset(tmp_path)
    db_session.add_all(
        [
            _item("ZZSEED_FIBER", 900_001),
            _item("ZZSEED_CLOTH", 900_002),
            # Tecido, gravado pela API com o número que o dataset anterior dava a ele.
            _bloco(900_002, "aodp", 10),
            _bloco(900_002, "aodp", 7, location="3008"),
        ]
    )
    await db_session.commit()

    await seed_static_data(manifest_path, dataset_dir)

    assert await _blocos(db_session) == {
        (910_002, "1002", "aodp", 10),
        (910_002, "3008", "aodp", 7),
    }


async def test_no_bloco_que_o_client_ja_tem_o_client_continua_vencendo(tmp_path, db_session):
    """A precedência da task 23 vale também na mudança de número."""
    manifest_path, dataset_dir = _write_dataset(tmp_path)
    db_session.add_all(
        [
            _item("ZZSEED_FIBER", 900_001),
            _bloco(900_001, "aodp", 10),  # fibra pela API, número antigo
            _bloco(910_001, "client", 50),  # o client já tem o bloco, com o número do jogo
        ]
    )
    await db_session.commit()

    await seed_static_data(manifest_path, dataset_dir)

    assert await _blocos(db_session) == {(910_001, "1002", "client", 50)}


async def test_item_que_saiu_do_jogo_perde_o_historico_da_api(tmp_path, db_session):
    """O número de um nome que saiu do dataset pode ser de outro item agora: não fica atribuído."""
    manifest_path, dataset_dir = _write_dataset(tmp_path)
    db_session.add_all(
        [
            _item("ZZSEED_REMOVIDO", 910_002),  # hoje, 910002 é o tecido
            _bloco(910_002, "aodp", 4),
        ]
    )
    await db_session.commit()

    await seed_static_data(manifest_path, dataset_dir)

    assert await _blocos(db_session) == set()


async def test_historico_do_client_nao_e_tocado(tmp_path, db_session):
    """O client grava o número do jogo: ele já está certo, e é o dataset que se alinha a ele."""
    manifest_path, dataset_dir = _write_dataset(tmp_path)
    db_session.add_all([_item("ZZSEED_CLOTH", 900_002), _bloco(900_002, "client", 33)])
    await db_session.commit()

    await seed_static_data(manifest_path, dataset_dir)

    assert await _blocos(db_session) == {(900_002, "1002", "client", 33)}
