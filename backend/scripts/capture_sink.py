"""Invocação canônica: `uv run python -m scripts.capture_sink` (de dentro de `backend/`),
mesmo motivo de scripts/import_recipes.py (ver docstring de lá).

Sink HTTP local que grava cada POST recebido em `tests/fixtures/wire/` — é a ferramenta que
permite repetir a captura do contrato real do jogo a cada patch (ver
docs/03-contrato-ingest-real.md secao 9). Uso:

    uv run python -m scripts.capture_sink

E, num terminal separado, aponta o client pro sink (NAO usar `-d`: com `-d` o client nem
serializa o payload, só loga "Upload is disabled" — client/dispatcher.go:113):

    cd albiondata-client
    ./albiondata-client.exe -i http://localhost:9099 -debug

O client só sobe qualquer coisa depois de ver uma transição de zona — é preciso atravessar
uma passagem com o client já rodando (ver docs/01-mapeamento-albiondata-client.md secao 9).
"""

import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import structlog

from src.logging_config import configure_logging

configure_logging()
log = structlog.get_logger()

PORT = 9099
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "wire"


class _SinkHandler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        # o client posta em "{base_url}/{topico}.ingest" (ex: /marketorders.ingest) — o
        # nome do arquivo vira o tópico, não o path inteiro.
        topico = self.path.strip("/").split(".")[0] or "desconhecido"
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        destino = OUTPUT_DIR / f"{topico}-captura-{time.time_ns()}.json"
        destino.write_bytes(body)

        # Só o sufixo do token: o sink loga em terminal e o valor é credencial de verdade.
        # Confirma que o header chegou e QUAL token é, sem escrever o segredo em lugar nenhum.
        auth = self.headers.get("Authorization")
        if auth is None:
            auth_info = "AUSENTE"
        elif auth.startswith("Bearer "):
            auth_info = f"Bearer ...{auth[-4:]}"
        else:
            auth_info = "presente, mas sem prefixo Bearer"

        log.info(
            "capture_sink.gravado",
            topico=topico,
            path=self.path,
            destino=str(destino),
            bytes=len(body),
            authorization=auth_info,
            user_agent=self.headers.get("User-Agent"),
        )

        self.send_response(200)
        self.end_headers()

    def log_message(self, format: str, *args) -> None:
        pass  # BaseHTTPRequestHandler loga cada request cru no stderr por padrão; log acima já cobre


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("0.0.0.0", PORT), _SinkHandler)
    log.info("capture_sink.ouvindo", porta=PORT, destino=str(OUTPUT_DIR))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
