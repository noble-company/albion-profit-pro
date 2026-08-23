from enum import StrEnum


class AlbionServer(StrEnum):
    WEST = "west"
    EAST = "east"
    EUROPE = "europe"


class MarketScanSource(StrEnum):
    BOOK = "livro"
    HISTORY = "historico"
