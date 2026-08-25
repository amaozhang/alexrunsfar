#!/usr/bin/env python3
"""
Turn a raw Strava GPX export into something a public repo can carry.

Strava exports full sensor resolution — a 200-mile race runs to ~70MB of
trackpoints with heart rate, cadence and temperature. The site needs latitude,
longitude and elevation only, at a resolution the SVG can actually resolve.

Elevation gain is computed from the FULL-resolution series before simplifying,
because downsampling flattens climbs and would understate it.

  ./scripts/simplify-gpx.py <input.gpx> <output-slug> [max_points]
"""
import re, sys, math, pathlib

M_TO_FT = 3.280839895
NOISE_M = 3.0          # ignore sub-3m wobble when summing gain
DEFAULT_MAX = 2500

def parse(path):
    xml = pathlib.Path(path).read_text(errors='replace')
    pts = []
    for m in re.finditer(r'<trkpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"[^>]*?(?:/>|>(.*?)</trkpt>)', xml, re.S):
        body = m.group(3) or ''
        e = re.search(r'<ele>([-\d.]+)</ele>', body)
        pts.append((float(m.group(1)), float(m.group(2)), float(e.group(1)) if e else None))
    return pts

def haversine(a, b):
    R = 6371000.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp = p2 - p1
    dl = math.radians(b[1] - a[1])
    h = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R*math.asin(math.sqrt(h))

def total_gain_ft(pts):
    eles = [p[2] for p in pts if p[2] is not None]
    if len(eles) < 2:
        return None
    gain, ref = 0.0, eles[0]
    for e in eles:
        d = e - ref
        if d > NOISE_M:
            gain += d; ref = e
        elif d < -NOISE_M:
            ref = e
    return round(gain * M_TO_FT)

def rdp(pts, eps_m):
    """Ramer-Douglas-Peucker, iterative, on lat/lon. Keeps switchbacks that an
    even-stride downsample would cut the corners off."""
    keep = [False]*len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts)-1)]
    # Local metres-per-degree at this latitude.
    lat0 = pts[len(pts)//2][0]
    mlat = 111320.0
    mlon = 111320.0*math.cos(math.radians(lat0))
    while stack:
        i, j = stack.pop()
        if j <= i+1: continue
        ax, ay = pts[i][1]*mlon, pts[i][0]*mlat
        bx, by = pts[j][1]*mlon, pts[j][0]*mlat
        dx, dy = bx-ax, by-ay
        den = math.hypot(dx, dy) or 1e-9
        best, bi = -1.0, -1
        for k in range(i+1, j):
            px, py = pts[k][1]*mlon, pts[k][0]*mlat
            d = abs(dy*px - dx*py + bx*ay - by*ax)/den
            if d > best: best, bi = d, k
        if best > eps_m:
            keep[bi] = True
            stack.append((i, bi)); stack.append((bi, j))
    return [p for p, k in zip(pts, keep) if k]

def main():
    src, slug = sys.argv[1], sys.argv[2]
    cap = int(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_MAX
    pts = parse(src)
    if len(pts) < 2:
        print(f"  !! {slug}: no trackpoints"); return

    miles = sum(haversine(pts[i-1], pts[i]) for i in range(1, len(pts)))/1609.344
    gain = total_gain_ft(pts)

    # Pre-thin very long tracks so RDP stays fast, then simplify by shape.
    work = pts if len(pts) <= 40000 else pts[::max(1, len(pts)//40000)]
    eps = 8.0
    out = rdp(work, eps)
    while len(out) > cap and eps < 400:
        eps *= 1.6
        out = rdp(work, eps)

    body = ''.join(
        f'<trkpt lat="{p[0]:.5f}" lon="{p[1]:.5f}">'
        + (f'<ele>{p[2]:.1f}</ele>' if p[2] is not None else '')
        + '</trkpt>'
        for p in out)
    gpx = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<gpx version="1.1" creator="alexrunsfar simplify-gpx">'
           f'<metadata><name>{slug}</name>'
           f'<desc>simplified from Strava export; {miles:.2f} mi; '
           f'{gain if gain is not None else "n/a"} ft gain (computed at full resolution)</desc>'
           '</metadata>'
           f'<trk><name>{slug}</name><trkseg>{body}</trkseg></trk></gpx>')

    dest = pathlib.Path('src/data/tracks')/f'{slug}.gpx'
    dest.write_text(gpx)
    print(f"  {slug:26s} {len(pts):>7,} -> {len(out):>5,} pts  "
          f"{miles:6.1f} mi  gain {str(gain)+' ft' if gain else 'n/a':>10}  "
          f"{dest.stat().st_size/1024:6.0f} KB")

main()
