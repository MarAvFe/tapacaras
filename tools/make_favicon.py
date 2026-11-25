"""Build the pixelated-face favicon (SVG, 32 px PNG, 180 px apple-touch-icon) from one 8x8 grid.
Run: python3 tools/make_favicon.py  (pure standard library, no dependencies)."""
import struct, zlib, pathlib

GRID = [  # . = transparent; letters = colours below
    "..HHHH..",
    ".HHhHHH.",
    "HhSsSMhH",
    "HSDsMDsH",
    ".sSMSsM.",
    ".MsDDSs.",
    "..MsSM..",
    "...sM...",
]
COLOURS = {"H": "2a1a10", "h": "3b2416", "S": "b98262", "s": "a8714c", "M": "8d5a3b", "D": "4a2c1a"}
ROOT = pathlib.Path(__file__).resolve().parent.parent

def svg():
    rects = "".join(f'<rect x="{x}" y="{y}" width="1" height="1" fill="#{COLOURS[c]}"/>'
                    for y, row in enumerate(GRID) for x, c in enumerate(row) if c != ".")
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges">'
            f"{rects}</svg>\n")

def png(size, background=None):
    cell = size // 8; pad = (size - cell * 8) // 2
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            gx, gy = (px - pad) // cell, (py - pad) // cell
            c = GRID[gy][gx] if 0 <= gx < 8 and 0 <= gy < 8 and px >= pad and py >= pad else "."
            if c == ".":
                row += bytes.fromhex(background) + b"\xff" if background else b"\0\0\0\0"
            else:
                row += bytes.fromhex(COLOURS[c]) + b"\xff"
        rows.append(bytes(row))
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b""))

(ROOT / "favicon.svg").write_text(svg())
(ROOT / "favicon.png").write_bytes(png(32))
# iOS shows home-screen icons on black when transparent, so this one gets the page's paper colour.
(ROOT / "apple-touch-icon.png").write_bytes(png(180, background="fffdf5"))
print("wrote favicon.svg, favicon.png, apple-touch-icon.png")
