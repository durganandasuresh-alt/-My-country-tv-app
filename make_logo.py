"""Generates the My Country TV app logo (PNG sizes + Windows .ico).

Design matches the app UI: indigo-violet gradient rounded-square, glassy
play-button triangle with cyan accent, on transparent background.
"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "img")
os.makedirs(OUT_DIR, exist_ok=True)

# Gradient endpoints (Red -> Orange: #fa0e0e -> #f97316)
C1 = (250, 14, 14)
C2 = (249, 115, 22)
CYAN = (255, 255, 255)
WHITE = (255, 255, 255)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_logo(size: int) -> Image.Image:
    S = 4  # supersample for smooth edges
    n = size * S
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Rounded-square gradient background
    radius = int(n * 0.22)
    grad = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(n):
        gd.line([(0, y), (n, y)], fill=lerp(C1, C2, y / n))
    mask = Image.new("L", (n, n), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, n - 1, n - 1], radius=radius, fill=255)
    img.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(img)

    # Subtle glossy highlight (top half, low alpha white) composited in place
    hl = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hd.rounded_rectangle([0, 0, n - 1, n // 2], radius=radius, fill=(255, 255, 255, 38))
    img = Image.alpha_composite(img, hl)
    d = ImageDraw.Draw(img)

    # Play triangle (white, glassy) with slight drop shadow
    cx, cy = n * 0.52, n * 0.5
    tw = n * 0.30  # triangle width
    th = n * 0.36  # triangle height
    shadow = [(cx - tw / 2 + n * 0.015, cy - th / 2 + n * 0.02),
              (cx - tw / 2 + n * 0.015, cy + th / 2 + n * 0.02),
              (cx + tw / 2 + n * 0.015, cy + n * 0.02)]
    d.polygon(shadow, fill=(0, 0, 0, 70))
    tri = [(cx - tw / 2, cy - th / 2),
           (cx - tw / 2, cy + th / 2),
           (cx + tw / 2, cy)]
    # Rounded-ish triangle: draw slightly larger cyan accent behind, white on top
    accent = [(p[0] + (p[0] - cx) * 0.12, p[1] + (p[1] - cy) * 0.12) for p in tri]
    d.polygon(accent, fill=CYAN + (160,))
    d.polygon(tri, fill=WHITE + (255,))

    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    sizes = [16, 32, 48, 64, 128, 256, 512]
    logos = {}
    for s in sizes:
        im = make_logo(s)
        logos[s] = im
        im.save(os.path.join(OUT_DIR, f"logo-{s}.png"))
        print(f"[+] logo-{s}.png")

    # Multi-resolution Windows icon
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    logos[256].save(os.path.join(OUT_DIR, "app.ico"),
                    format="ICO",
                    sizes=[(s, s) for s in ico_sizes])
    print("[+] app.ico")

    # Large wordmark-friendly version for splash/login screens
    make_logo(1024).save(os.path.join(OUT_DIR, "logo.png"))
    print("[+] logo.png")
