import uuid

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base


class Recipe(Base):
    """Uma receita = como craftar/refinar UM item (o output)."""

    __tablename__ = "recipe"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    # Chave de junção dupla — ver docs/02-dados-de-receita.md ("Chave de junção com items.json"):
    # pra receitas encantadas, output_item_unique_name segue a convenção do
    # próprio jogo/items.json: "{base}@{enchantment_level}" (ex: "T4_HEAD_CLOTH_SET1@1").
    output_item_unique_name: Mapped[str] = mapped_column(
        String(64), unique=True, index=True
    )  # @uniquename (ou "{base}@{nivel}")
    output_item_id: Mapped[int | None] = mapped_column(
        BigInteger, index=True, nullable=True
    )  # Index resolvido via items.json

    # 0 = receita base (sem encantamento). 1-4 = craftar o item já encantado
    # nesse nível direto (ingredientes vêm pré-encantados, ver docs/02) —
    # rota alternativa a craftar o item base e usar upgrade_resource_* pra
    # encantar depois.
    enchantment_level: Mapped[int] = mapped_column(
        default=0, index=True
    )  # @enchantmentlevel do bloco enchantments.enchantment[]

    silver_cost: Mapped[int] = mapped_column(default=0)  # @silver
    crafting_focus: Mapped[int] = mapped_column(default=0)  # @craftingfocus
    amount_crafted: Mapped[int] = mapped_column(default=1)  # @amountcrafted
    craft_time: Mapped[float] = mapped_column(
        Numeric(10, 5), default=0
    )  # @time (unidade não confirmada, ver docs/02)

    # Custo de UPGRADAR um item já craftado no nível anterior pra este nível
    # (upgraderequirements.upgraderesource — ex: runas/almas/relíquias) — rota
    # alternativa a craftar já encantado do zero (silver_cost + ingredients
    # acima). Sempre NULL quando enchantment_level=0 (nada a upgradar pro
    # nível 0) ou quando o item não tiver essa rota documentada no dump.
    upgrade_resource_unique_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    upgrade_resource_item_id: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True
    )  # Index resolvido via items.json
    upgrade_resource_count: Mapped[int | None] = mapped_column(nullable=True)

    ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        back_populates="recipe",
        cascade="all, delete-orphan",
        order_by="RecipeIngredient.position",
    )


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredient"
    __table_args__ = (
        CheckConstraint("position >= 0", name="ck_recipe_ingredient_position_nonnegative"),
        UniqueConstraint("recipe_id", "position", name="uq_recipe_ingredient_position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    recipe_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("recipe.id"), index=True)

    ingredient_unique_name: Mapped[str] = mapped_column(
        String(64), index=True
    )  # @uniquename do craftresource
    ingredient_item_id: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True
    )  # Index resolvido via items.json
    count: Mapped[int]  # @count
    enchantment_level: Mapped[int] = mapped_column(default=0)  # @enchantmentlevel
    position: Mapped[int]  # ordem original de craftresource no dump (base zero)

    recipe: Mapped["Recipe"] = relationship(back_populates="ingredients")
