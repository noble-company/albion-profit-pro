"""Gera os assets leves da marca a partir dos originais versionados.

Uso, na raiz do repositório:

    uv run --with pillow==12.3.0 python scripts/gerar_marca.py

As saídas são versionadas, mas nunca devem ser editadas à mão.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets" / "marca"
PUBLIC_DIR = ROOT / "frontend" / "public"
FRONTEND_BRAND_DIR = ROOT / "frontend" / "src" / "assets" / "marca"

# Mesmo sRGB do token `--background` escuro (stone-950) em frontend/src/index.css.
DARK_BACKGROUND = (12, 10, 9, 255)
RESAMPLING = Image.Resampling.LANCZOS


def load_transparent(path: Path) -> Image.Image:
    image = Image.open(path)
    image.load()
    if "A" not in image.getbands():
        raise ValueError(f"O original precisa ter canal alfa: {path}")
    return image.convert("RGBA")


def resized(image: Image.Image, size: int) -> Image.Image:
    return image.resize((size, size), RESAMPLING)


def main() -> None:
    shield = load_transparent(SOURCE_DIR / "escudo-ap.png")
    logo = load_transparent(SOURCE_DIR / "logo.png")

    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    FRONTEND_BRAND_DIR.mkdir(parents=True, exist_ok=True)

    shield.save(
        PUBLIC_DIR / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )

    apple_shield = resized(shield, 180)
    apple_icon = Image.new("RGBA", apple_shield.size, DARK_BACKGROUND)
    apple_icon.alpha_composite(apple_shield)
    apple_icon.convert("RGB").save(
        PUBLIC_DIR / "apple-touch-icon.png",
        format="PNG",
        optimize=True,
    )

    resized(shield, 64).save(
        FRONTEND_BRAND_DIR / "escudo-ap.webp",
        format="WEBP",
        quality=82,
        method=6,
        exact=True,
    )
    resized(logo, 352).save(
        FRONTEND_BRAND_DIR / "logo.webp",
        format="WEBP",
        quality=82,
        method=6,
        exact=True,
    )


if __name__ == "__main__":
    main()
