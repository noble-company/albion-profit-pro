# Níveis de qualidade de item no Albion Online: 1=Normal, 2=Boa, 3=Excepcional,
# 4=Excelente, 5=Obra-prima. Nome pra sair de dentro de src/prices/service.py (task 28,
# docs/04-revisao-fase-1.md achado M6).
QUALIDADES = range(1, 6)

# Níveis de encantamento: 0 = sem encantamento, 1-4 = ".1" a ".4". Dimensão própria da
# profundidade do livro (task 29) — MarketOrder guarda item_id (ItemTypeId) e
# enchantment_level como colunas separadas, então um mesmo item_id pode ter ordens em vários
# níveis de encantamento simultaneamente.
ENCHANTMENT_LEVELS = range(0, 5)
