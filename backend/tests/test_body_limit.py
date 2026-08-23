from src.main import MAX_CONTENT_LENGTH


async def test_malformed_content_length_returns_400_never_500(client):
    response = await client.post(
        "/marketorders.ingest",
        headers={"Content-Length": "not-a-number"},
        content=b"{}",
    )
    assert response.status_code == 400
    assert response.json() == {"detail": "Content-Length inválido"}


async def test_oversized_content_length_returns_413_before_parsing(client):
    response = await client.post(
        "/marketorders.ingest",
        headers={"Content-Length": str(MAX_CONTENT_LENGTH + 1)},
        content=b"{}",
    )
    assert response.status_code == 413


async def test_chunked_body_without_content_length_is_counted(client, token_api):
    async def oversized_body():
        yield b"{"
        yield b"x" * MAX_CONTENT_LENGTH

    response = await client.post(
        "/marketorders.ingest",
        headers={
            "Authorization": f"Bearer {token_api}",
            "X-Albion-Server": "west",
            "Content-Type": "application/json",
        },
        content=oversized_body(),
    )
    assert "content-length" not in response.request.headers
    assert response.status_code == 413
