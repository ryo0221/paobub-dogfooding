"""心の声の吹き出し（雲形）の形。compose.py（ページの画像）と build-design.py（Design の path）で同じ形を使う。"""
import math


def cloud(x, y, w, h):
    """楕円 (x, y, w, h) のまわりに膨らみを並べた雲形。[(p0, c1, c2, p1), ...] の cubic の列（絶対座標）を返す。"""
    cx, cy, rx, ry = x + w / 2, y + h / 2, w / 2 - 6, h / 2 - 6
    per = math.pi * (3 * (rx + ry) - math.sqrt((3 * rx + ry) * (rx + 3 * ry)))
    n = max(10, round(per / 55))
    pts = [(cx + rx * math.cos(2 * math.pi * i / n), cy + ry * math.sin(2 * math.pi * i / n)) for i in range(n)]
    segs = []
    for i in range(n):
        p0, p1 = pts[i], pts[(i + 1) % n]
        mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
        nx, ny = mx - cx, my - cy; L = math.hypot(nx, ny) or 1; nx, ny = nx / L, ny / L
        b = math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * 0.55
        segs.append((p0, (p0[0] + nx * b, p0[1] + ny * b), (p1[0] + nx * b, p1[1] + ny * b), p1))
    return segs


def sample(segs, k=12):
    """cubic の列を折れ線に（ページの画像に描くため）。"""
    out = []
    for p0, c1, c2, p1 in segs:
        for j in range(k):
            t = j / k; u = 1 - t
            out.append((u ** 3 * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * p1[0],
                        u ** 3 * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * p1[1]))
    return out


def dots(x, y, w, h, tx, ty):
    """心の声のしっぽ：話す人物へ向けた小さな丸 2 つ [(cx, cy, r), ...]。"""
    cx, cy = x + w / 2, y + h / 2
    ang = math.atan2(ty - cy, tx - cx)
    edge = math.hypot(math.cos(ang) * w / 2, math.sin(ang) * h / 2) + 4
    return [(cx + math.cos(ang) * (edge + 16), cy + math.sin(ang) * (edge + 16), 12),
            (cx + math.cos(ang) * (edge + 42), cy + math.sin(ang) * (edge + 42), 7)]
