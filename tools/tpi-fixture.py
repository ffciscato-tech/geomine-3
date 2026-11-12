"""Generate a synthetic 15 cm DEM for local-relief.browser.test.cjs (not SATC data)."""
import array
import math
import struct
from pathlib import Path

w = h = 2048
rows = 64
n = (h + rows - 1) // rows
tags = [
    (256, 4, 1, w), (257, 4, 1, h), (258, 3, 1, 32), (259, 3, 1, 1),
    (262, 3, 1, 1), (273, 4, n, (0,) * n), (277, 3, 1, 1),
    (278, 4, 1, rows), (279, 4, n, (w * rows * 4,) * n),
    (284, 3, 1, 1), (339, 3, 1, 3), (33550, 12, 3, (.15, .15, 0.)),
    (33922, 12, 6, (0., 0., 0., 500000., 6900000., 0.)),
    (34735, 3, 20, (1, 1, 0, 4, 1024, 0, 1, 1, 1025, 0, 1, 1,
                    3072, 0, 1, 31982, 3076, 0, 1, 9001)),
    (42113, 2, 7, b'-99999\0'),
]
start = 8 + 2 + len(tags) * 12 + 4


def header(entries):
    extra = bytearray()
    records = []
    for tag, kind, count, value in entries:
        if isinstance(value, (tuple, bytes)):
            b = value if isinstance(value, bytes) else struct.pack(
                '<' + {3: 'H', 4: 'I', 12: 'd'}[kind] * len(value), *value)
            if len(b) <= 4:
                records.append(struct.pack('<HHI', tag, kind, count) + b.ljust(4, b'\0'))
            else:
                records.append(struct.pack('<HHII', tag, kind, count, start + len(extra)))
                extra.extend(b)
        else:
            records.append(struct.pack('<HHII', tag, kind, count, value))
    return b'II' + struct.pack('<HIH', 42, 8, len(entries)) + b''.join(records) + struct.pack('<I', 0) + extra


pixel = len(header(tags))
tags = [(a, b, c, tuple(pixel + i * rows * w * 4 for i in range(n)) if a == 273 else v)
        for a, b, c, v in tags]
output = Path('/tmp/geomine-tpi-native-15cm.tif')
with output.open('wb') as f:
    f.write(header(tags))
    for y in range(h):
        center = w * .5 + 180 * math.sin(y / 240)
        row = array.array('f', (
            100 + x * .0005 + y * .0003 - 1.4 * math.exp(-((x - center) / 13) ** 2)
            + .3 * math.sin(x / 100) * math.cos(y / 150) if x > 90 else -99999
            for x in range(w)))
        if __import__('sys').byteorder != 'little':
            row.byteswap()
        f.write(row.tobytes())
print(output)
