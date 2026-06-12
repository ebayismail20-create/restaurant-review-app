"""
Generate the Bistro Nordic icon set from a single design pass.

Outputs into ../public/ and ../app/:
  public/icon-192.png             — Android home-screen, manifest "any"
  public/icon-512.png             — Android splash + install card, manifest "any"
  public/icon-maskable-512.png    — Adaptive icon, manifest "maskable"
  public/apple-icon.png           — iOS home-screen (180x180, full bleed)
  app/favicon.ico                 — Browser tab (multi-res 16/32/48)

Run from project root:
  python3 scripts/generate-icons.py

Re-run any time the brand palette or mark changes. PNGs are deterministic for a
given design so committing them is fine; running this in CI would also work.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# --- Brand palette (must match app/globals.css theme tokens) ---------------
BG = (107, 31, 42)         # #6B1F2A — burgundy
FG = (201, 169, 97)        # #C9A961 — gold accent
HAIRLINE = (245, 237, 224, 96)  # cream at 38% alpha for the inner ring

# Pick the most "Cormorant-like" serif we can rely on cross-distro. Liberation
# Serif Bold has the right contrast and weight to read at 16px favicons.
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/liberation2/LiberationSerif-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
]


def find_font() -> str:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return path
    raise SystemExit(f"No usable serif font found — tried: {FONT_CANDIDATES}")


def draw_master(canvas: int, safe_ratio: float) -> Image.Image:
    """
    Render a single master icon at the given pixel canvas size.

    `safe_ratio` controls how much of the canvas the visible mark occupies.
    - 0.78 leaves enough margin for "any" icons and looks balanced on a phone
      home screen.
    - 0.62 shrinks the mark for "maskable" icons so the content survives the
      most aggressive circular / squircle masks Android applies.
    """
    img = Image.new("RGB", (canvas, canvas), BG)
    draw = ImageDraw.Draw(img, "RGBA")

    # Hairline cream ring inside the safe area — adds editorial polish without
    # competing with the letter for visual weight.
    ring_pad = int(canvas * (1 - safe_ratio) / 2)
    ring_box = (ring_pad, ring_pad, canvas - ring_pad, canvas - ring_pad)
    ring_w = max(2, canvas // 256)
    draw.ellipse(ring_box, outline=HAIRLINE, width=ring_w)

    # Letterform — sized so the visual height of the cap fits ~62% of the safe
    # area (serif caps + descender slack means we can't just match canvas).
    font_path = find_font()
    target_cap_height = int(canvas * safe_ratio * 0.62)
    # Iteratively pick a font size that lands close to target_cap_height.
    size = target_cap_height
    while size > 8:
        font = ImageFont.truetype(font_path, size)
        bbox = draw.textbbox((0, 0), "B", font=font, anchor="lt")
        cap_h = bbox[3] - bbox[1]
        if cap_h <= target_cap_height:
            break
        size -= 2

    # Center using the textbox so the optical center matches the geometric one
    # (PIL's anchor="mm" centers on the em-square which can drift for serifs).
    bbox = draw.textbbox((0, 0), "B", font=font, anchor="lt")
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (canvas - text_w) / 2 - bbox[0]
    y = (canvas - text_h) / 2 - bbox[1]
    draw.text((x, y), "B", fill=FG, font=font)
    return img


def write_png(img: Image.Image, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, "PNG", optimize=True)
    print(f"  wrote {out_path}  ({img.size[0]}x{img.size[1]})")


def write_ico(img: Image.Image, out_path: Path) -> None:
    """
    Write a multi-resolution ICO. Browsers pick the closest size at render
    time, so we ship 16/32/48 — the classic favicon sizes — sourced from a
    256px master to keep edges crisp.
    """
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(
        out_path,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print(f"  wrote {out_path}  (multi-res 16/32/48)")


def main() -> None:
    public = Path(__file__).resolve().parent.parent / "public"
    app = Path(__file__).resolve().parent.parent / "app"

    # "Any" purpose master at 512 — browsers downsample to 192 cleanly.
    master_any = draw_master(canvas=512, safe_ratio=0.78)
    write_png(master_any, public / "icon-512.png")
    write_png(master_any.resize((192, 192), Image.LANCZOS), public / "icon-192.png")

    # Maskable master — smaller mark, full-bleed bg, survives circular crops.
    master_maskable = draw_master(canvas=512, safe_ratio=0.62)
    write_png(master_maskable, public / "icon-maskable-512.png")

    # Apple touch icon. iOS draws its own corner mask, so we want a full-bleed
    # square with no transparency. 180x180 is the canonical size.
    master_apple = draw_master(canvas=360, safe_ratio=0.78)
    write_png(master_apple.resize((180, 180), Image.LANCZOS), public / "apple-icon.png")

    # Favicon. Render at 256 (anti-aliased), then ICO compresses to 16/32/48.
    favicon_master = draw_master(canvas=256, safe_ratio=0.78)
    write_ico(favicon_master, app / "favicon.ico")

    print("\nIcon set generated.")


if __name__ == "__main__":
    main()
