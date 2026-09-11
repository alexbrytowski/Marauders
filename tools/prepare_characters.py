"""Create web-sized JPEG portraits from the owner's originals (requires Pillow)."""

from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
PORTRAITS = [
    ("Alex the Merciless.png", "alex-the-merciless"),
    ("Alyssa the Sea Witch.png", "alyssa-the-witch"),
    ("Dylan the Salty Dog.png", "dylan-the-salty-dog"),
    ("Hayven the Merchant.png", "hayven-the-merchant"),
    ("Jacob the Vengeful.png", "jacob-the-vengeful"),
    ("Jared the Oil Baron.jpeg", "jared-the-oil-baron"),
    ("Josh the Phantom.png", "josh-the-phantom"),
    ("Steven the Cruel.png", "steven-the-cruel"),
]


def main():
    missing = [name for name, _ in PORTRAITS if not (ROOT / "Characters" / name).is_file()]
    if missing:
        raise SystemExit(f"Missing original portraits: {', '.join(missing)}")
    destination = ROOT / "server" / "wwwroot" / "characters"
    destination.mkdir(parents=True, exist_ok=True)
    for name, slug in PORTRAITS:
        with Image.open(ROOT / "Characters" / name) as original:
            portrait = ImageOps.exif_transpose(original).convert("RGB")
            portrait.thumbnail((640, 800), Image.Resampling.LANCZOS)
            output = destination / f"{slug}.jpg"
            portrait.save(output, quality=88, optimize=True, progressive=True)
            print(f"{name}: {portrait.width} x {portrait.height}, {output.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
