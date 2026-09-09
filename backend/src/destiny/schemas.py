from typing import Annotated

from pydantic import BaseModel, Field

# O painel do jogo vai de 0 a 100. Recusar fora disso **na borda** evita um custo de foco
# fantasia que o jogador não consegue reproduzir em lugar nenhum — e evita que o erro só
# apareça lá na frente, como um lucro por foco bom demais.
NodeLevel = Annotated[int, Field(ge=0, le=100)]

# Mesma folga da coluna. Chave longa demais é erro de quem chama, não dado.
NodeKey = Annotated[str, Field(min_length=1, max_length=64)]


class DestinyBoardOut(BaseModel):
    """O painel inteiro numa resposta: `node_key -> nível`. Nó ausente é nível zero."""

    nodes: dict[str, int] = Field(default_factory=dict)


class DestinyBoardIn(BaseModel):
    """A tela manda o painel **completo**, não um delta: quem zera um nó espera que ele suma."""

    model_config = {"extra": "forbid"}

    nodes: dict[NodeKey, NodeLevel] = Field(default_factory=dict)
