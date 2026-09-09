import uuid

from sqlalchemy import CheckConstraint, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class DestinyNode(Base):
    """Um nó do Painel do Destino do jogador (task 4/17).

    O painel decide o **custo de foco**: cada nível reduz o gasto, pouco no ramo inteiro e
    muito no item específico. Sem isso a coluna `Lucro/foco` usa o custo do dump, que é o de
    quem nunca especializou nada — erra por até 16x justamente para quem usa foco.

    Fica no servidor, e não no navegador: o painel é do jogador, não da máquina em que ele
    abriu a tela.

    `node_key` é **opaco para o banco** de propósito. O formato (`refine:fiber:4`,
    `base:cursestaff`, `spec:MAIN_CURSEDSTAFF`) é conhecido pelo cliente, que é quem sabe a
    forma da árvore — e ela não é uniforme: refino tem um nó por tier, craft tem um por linha.
    Modelar isso em colunas obrigaria a migrar o banco a cada formato novo.
    """

    __tablename__ = "destiny_node"
    __table_args__ = (CheckConstraint("level >= 0 AND level <= 100", name="ck_destiny_node_level"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id", ondelete="CASCADE"), primary_key=True
    )
    node_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    level: Mapped[int]
