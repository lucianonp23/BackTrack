"""Generate app icons (3x3 grid, one lit square) as PNGs with no dependencies."""
import struct, zlib, sys, os

BG = (47, 93, 80)       # deep green
CELL = (244, 241, 234)  # cream
LIT = (236, 148, 97)    # orange

def png(path, size, pad_frac, rounded):
    px = [[BG] * size for _ in range(size)]
    pad = size * pad_frac
    gap = size * 0.04
    cell = (size - 2 * pad - 2 * gap) / 3
    r = cell * 0.18
    for row in range(3):
        for col in range(3):
            x0 = pad + col * (cell + gap); y0 = pad + row * (cell + gap)
            color = LIT if (row, col) == (0, 2) else CELL
            if (row, col) == (1, 1):
                continue
            for y in range(int(y0), int(y0 + cell)):
                for x in range(int(x0), int(x0 + cell)):
                    dx = max(x0 + r - x, 0, x - (x0 + cell - r)); dy = max(y0 + r - y, 0, y - (y0 + cell - r))
                    if dx * dx + dy * dy <= r * r:
                        px[y][x] = color
    if rounded:  # transparent rounded corners for the plain icon
        R = size * 0.22
        rows = []
        for y in range(size):
            row = bytearray([0])
            for x in range(size):
                dx = max(R - x, 0, x - (size - 1 - R)); dy = max(R - y, 0, y - (size - 1 - R))
                a = 255 if dx * dx + dy * dy <= R * R else 0
                row += bytes(px[y][x]) + bytes([a])
            rows.append(bytes(row))
        ctype = 6
    else:
        rows = [b'\x00' + b''.join(bytes(p) for p in r_) for r_ in px]
        ctype = 2
    raw = zlib.compress(b''.join(rows), 9)
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, ctype, 0, 0, 0)) + chunk(b'IDAT', raw) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)

out = sys.argv[1]
png(os.path.join(out, 'icon-192.png'), 192, 0.16, True)
png(os.path.join(out, 'icon-512.png'), 512, 0.16, True)
png(os.path.join(out, 'icon-maskable-512.png'), 512, 0.24, False)  # safe zone padding
png(os.path.join(out, 'apple-touch-icon.png'), 180, 0.16, False)   # iOS rounds corners itself
