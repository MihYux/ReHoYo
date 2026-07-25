#!/usr/bin/env python3
"""Build desktop application icons from the same March 7th art used by the tray."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "assets" / "march7th-pet.png"
PNG_OUTPUT = ROOT / "electron" / "app-icon.png"
ICO_OUTPUT = ROOT / "electron" / "app-icon.ico"
CANVAS_SIZE = 1024
ART_HEIGHT = 960


def main() -> None:
    with Image.open(SOURCE) as source:
        art = source.convert("RGBA")

    bounds = art.getchannel("A").getbbox()
    if bounds is None:
        raise RuntimeError("The March 7th tray artwork is empty")
    art = art.crop(bounds)
    width = max(1, round(art.width * ART_HEIGHT / art.height))
    art = art.resize((width, ART_HEIGHT), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(
        art,
        ((CANVAS_SIZE - art.width) // 2, (CANVAS_SIZE - art.height) // 2),
    )

    PNG_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(PNG_OUTPUT, format="PNG", optimize=True)
    canvas.save(
        ICO_OUTPUT,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"Wrote {PNG_OUTPUT}")
    print(f"Wrote {ICO_OUTPUT}")


if __name__ == "__main__":
    main()
