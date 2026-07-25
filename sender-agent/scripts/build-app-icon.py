#!/usr/bin/env python3
"""Build transparent PNG and multi-size ICO assets from the ReHoYo raster mark."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "app_logo_white_bg.png"
PNG_OUTPUT = ROOT / "electron" / "app-icon.png"
ICO_OUTPUT = ROOT / "electron" / "app-icon.ico"
WEB_OUTPUT = ROOT / "app" / "icon.png"
CANVAS_SIZE = 1024
MARK_WIDTH = 856


def smoothstep(values: np.ndarray) -> np.ndarray:
    values = np.clip(values, 0.0, 1.0)
    return values * values * (3.0 - 2.0 * values)


def extract_foreground(source: Image.Image) -> Image.Image:
    rgb = np.asarray(source.convert("RGB"), dtype=np.float32)
    corners = np.concatenate(
        (
            rgb[:8, :8].reshape(-1, 3),
            rgb[:8, -8:].reshape(-1, 3),
            rgb[-8:, :8].reshape(-1, 3),
            rgb[-8:, -8:].reshape(-1, 3),
        )
    )
    background = np.median(corners, axis=0)
    distance = np.max(np.abs(rgb - background), axis=2)

    # The original mark is a cyan raster composited over near-white. Its solid
    # pixels cluster tightly around this distance; normalizing against that
    # cluster recovers the original antialiasing without preserving the matte.
    solid_samples = distance[distance >= 96]
    if solid_samples.size == 0:
        raise RuntimeError("Could not isolate the cyan logo from its background")
    solid_distance = float(np.percentile(solid_samples, 65))
    alpha = smoothstep((distance - 1.25) / max(1.0, solid_distance - 1.25))
    alpha[distance < 4] = 0.0
    alpha[distance >= solid_distance * 0.965] = 1.0

    # Reverse the white composite on edge pixels. This prevents pale/white
    # fringes when Windows renders the icon over a dark title bar.
    safe_alpha = np.maximum(alpha[..., None], 1.0 / 255.0)
    foreground = (rgb - (1.0 - safe_alpha) * background) / safe_alpha
    foreground = np.clip(foreground, 0, 255)

    rgba = np.dstack((foreground, alpha[..., None] * 255.0)).astype(np.uint8)
    rgba[rgba[..., 3] == 0, :3] = 0
    return Image.fromarray(rgba)


def place_on_square(mark: Image.Image) -> Image.Image:
    alpha = mark.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value >= 2 else 0).getbbox()
    if bbox is None:
        raise RuntimeError("The extracted logo is empty")

    mark = mark.crop(bbox)
    scale = MARK_WIDTH / mark.width
    resized_height = max(1, round(mark.height * scale))

    rgb = mark.convert("RGB").resize(
        (MARK_WIDTH, resized_height), Image.Resampling.LANCZOS
    )
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=0.9, percent=90, threshold=2))
    resized_alpha = mark.getchannel("A").resize(
        (MARK_WIDTH, resized_height), Image.Resampling.LANCZOS
    )
    resized_alpha = resized_alpha.filter(
        ImageFilter.UnsharpMask(radius=0.65, percent=115, threshold=1)
    )

    resized = rgb.convert("RGBA")
    resized.putalpha(resized_alpha)
    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    offset = ((CANVAS_SIZE - MARK_WIDTH) // 2, (CANVAS_SIZE - resized_height) // 2)
    canvas.alpha_composite(resized, offset)

    pixels = np.asarray(canvas, dtype=np.uint8).copy()
    visible = pixels[..., 3] > 0
    near_white = (
        (pixels[..., :3].min(axis=2) >= 245)
        & ((pixels[..., :3].max(axis=2) - pixels[..., :3].min(axis=2)) <= 18)
        & visible
    )
    pixels[near_white] = 0
    pixels[~visible, :3] = 0
    return Image.fromarray(pixels)


def validate(icon: Image.Image) -> None:
    pixels = np.asarray(icon.convert("RGBA"), dtype=np.uint8)
    alpha = pixels[..., 3]
    visible = alpha > 0
    if not np.any(alpha == 0) or not np.any(alpha == 255):
        raise RuntimeError("Icon must contain both transparent and opaque pixels")
    if any(alpha[y, x] != 0 for x, y in ((0, 0), (1023, 0), (0, 1023), (1023, 1023))):
        raise RuntimeError("Icon corners must be fully transparent")
    white_pixels = (
        (pixels[..., :3].min(axis=2) >= 245)
        & ((pixels[..., :3].max(axis=2) - pixels[..., :3].min(axis=2)) <= 18)
        & visible
    )
    if np.any(white_pixels):
        raise RuntimeError("Visible white pixels remain in the icon")


def main() -> None:
    with Image.open(SOURCE) as source:
        mark = extract_foreground(source)
    icon = place_on_square(mark)
    validate(icon)

    PNG_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    icon.save(PNG_OUTPUT, format="PNG", optimize=True)
    icon.save(WEB_OUTPUT, format="PNG", optimize=True)
    icon.save(
        ICO_OUTPUT,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"Wrote {PNG_OUTPUT}")
    print(f"Wrote {ICO_OUTPUT}")
    print(f"Wrote {WEB_OUTPUT}")


if __name__ == "__main__":
    main()
