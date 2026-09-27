#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Карта Москвы вокруг Омега-Плазы из OpenStreetMap -> moscow-city.js
для второй карты игры lab/delivery (?map=moscow).

Что делает:
  1) fetch — тянет из Overpass API выгрузки (дороги, дома, зелёнка, вода,
     парковки, точки: светофоры, переходы, подъезды, деревья, лавочки,
     остановки) и рельеф — тайлы высот Terrarium (AWS Open Data, SRTM).
     Всё кладётся в кеш scripts/.osm-cache/moscow/ (в гит не едет);
  2) build — режет кеш по игровой области, снимает высоты на сетку,
     проецирует в метры, упрощает геометрию и пишет
     docs/lab/delivery/moscow-city.js.

Запуск:
    python3 scripts/osm_moscow.py fetch
    python3 scripts/osm_moscow.py build

Нужны numpy и Pillow — тайлы высот это png.

Устроен как scripts/osm_tomsk.py, но город не сжат: район маленький, метры
настоящие. Координаты на выходе: локальная метрическая плоскость, начало —
Омега-Плаза (Ленинская Слобода, 19), x на восток, z на юг (оси three.js).
Высота — метры над урезом Москвы-реки. Данные OpenStreetMap, лицензия ODbL.
"""

import base64
import heapq
import json
import math
import pathlib
import subprocess
import sys
import time

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts" / ".osm-cache" / "moscow"
OUT = ROOT / "src" / "maps" / "moscow" / "city-data.js"

UA = "dodo-xxx-digest/1.0 (lab prototype, OSM data)"
ENDPOINT = "https://overpass-api.de/api/interpreter"
DEM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
DEM_Z = 14

# Начало проекции — Омега-Плаза, отсюда же принимают заказы
PROJ_CENTER = (55.708573, 37.652733)
MPD_LAT = 111320.0

# Игровая область в метрах от офиса: x0, z0, x1, z1. На западе — Москва-река
# с набережными и тот берег, на востоке — метро «Автозаводская», Кожуховские
# проезды и кварталы за ними, на юге — до ТТК, на севере — до Дербеневской.
CROP = (-820, -780, 860, 640)
PAD = 140                      # город рисуется и за рамкой, до горизонта
FETCH_PAD = 300                # выгрузка ещё шире: реке нужны берега

GRID = 12
GRID_PAD = 240
SMOOTH = 1.25
BED = 3.0

# building:colour бывает словом — переводим в пастель, близкую к игре
COLOURS = {
    "beige": "#e6d6b8", "brown": "#b88a6e", "yellow": "#f0dca0", "white": "#eeebe4", "grey": "#bdbcc0",
    "gray": "#bdbcc0", "lightgrey": "#d6d4d6", "lightgray": "#d6d4d6", "red": "#d98c7a", "orange": "#eeb78a",
    "lightyellow": "#f3e8bf", "blue": "#a9c2dc", "lightblue": "#c3d8ea", "green": "#b7d1a8", "pink": "#ecc3c8",
    "lightgreen": "#c9e0bd", "darkgrey": "#98979d", "cream": "#f1e6cc", "silver": "#cfd3d8", "maroon": "#a7736b",
}

ROAD_CLASS = {
    "motorway": 0, "trunk": 0, "motorway_link": 1, "trunk_link": 1,
    "primary": 1, "primary_link": 2, "secondary": 2, "secondary_link": 3,
    "tertiary": 3, "tertiary_link": 4, "unclassified": 4, "residential": 4,
    "living_street": 5, "pedestrian": 6, "service": 7,
}
# ширина полотна по классу, если полос в карте нет
ROAD_W = [20, 16, 13.5, 11, 9, 7, 5, 5.5]

QUERIES = {
    "roads": 'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|unclassified|residential|living_street|pedestrian|service)$"]({bbox});',
    "paths": 'way["highway"~"^(footway|path|cycleway)$"]["footway"!~"^(sidewalk|crossing)$"]({bbox});',
    "buildings": 'way["building"]({bbox});',
    "green": ('(way["leisure"~"^(park|garden|pitch|playground|stadium)$"]({bbox});'
              'way["landuse"~"^(grass|forest|meadow|cemetery|recreation_ground|village_green|flowerbed)$"]({bbox});'
              'way["natural"~"^(wood|scrub|grassland)$"]({bbox});'
              'way["natural"="tree_row"]({bbox}););'),
    "lots": ('(way["amenity"="parking"]({bbox});'
             'way["landuse"~"^(industrial|commercial|retail|railway|construction)$"]({bbox}););'),
    "points": ('(node["highway"~"^(bus_stop|traffic_signals|crossing)$"]({bbox});'
               'node["public_transport"="platform"]({bbox});'
               'node["entrance"]({bbox});'
               'node["natural"="tree"]({bbox});'
               'node["amenity"~"^(bench|waste_basket|fast_food|cafe|restaurant|pharmacy|bank|fuel)$"]({bbox});'
               'node["shop"]({bbox});'
               'node["railway"~"^(station|subway_entrance)$"]({bbox}););'),
}
RIVER_Q = ('[out:json][timeout:200];rel["natural"="water"]["water"="river"]({bbox})->.r;'
           '.r out body;way(r.r)({bbox});out geom;')


def fetch_box():
    clat, clon = PROJ_CENTER
    mpd_lon = MPD_LAT * math.cos(math.radians(clat))
    x0, z0, x1, z1 = CROP
    p = FETCH_PAD
    s = clat - (z1 + p) / MPD_LAT
    n = clat - (z0 - p) / MPD_LAT
    w = clon + (x0 - p) / mpd_lon
    e = clon + (x1 + p) / mpd_lon
    return (round(s, 5), round(w, 5), round(n, 5), round(e, 5))


# ─────────────── выгрузка ───────────────

def overpass(query, tries=10):
    """Overpass отвечает html-ошибкой, когда занят, — просто пробуем ещё раз."""
    for i in range(tries):
        r = subprocess.run(["curl", "-s", "-m", "300", "-A", UA, ENDPOINT,
                            "--data-urlencode", "data=" + query],
                           capture_output=True, timeout=320)
        if r.stdout[:1] == b"{":
            return r.stdout
        print(f"  сервер занят, попытка {i + 1}", flush=True)
        time.sleep(20)
    raise SystemExit("Overpass не ответил — повтори позже")


def dem_tiles():
    n = 2 ** DEM_Z
    s, w, nth, e = fetch_box()

    def tile(lat, lon):
        return (int((lon + 180) / 360 * n),
                int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n))
    x0, y0 = tile(nth, w)
    x1, y1 = tile(s, e)
    return x0, x1, y0, y1


def fetch():
    CACHE.mkdir(parents=True, exist_ok=True)
    bbox = ",".join(str(v) for v in fetch_box())
    for name, q in QUERIES.items():
        dst = CACHE / f"{name}.json"
        if dst.exists() and dst.stat().st_size > 500:
            print("есть", name)
            continue
        print("тянем", name, flush=True)
        dst.write_bytes(overpass(f"[out:json][timeout:200];{q.format(bbox=bbox)}out geom;"))
        print("  ok", dst.stat().st_size // 1024, "КБ", flush=True)
    dst = CACHE / "river.json"
    if not (dst.exists() and dst.stat().st_size > 500):
        print("тянем контур реки", flush=True)
        dst.write_bytes(overpass(RIVER_Q.format(bbox=bbox)))
    else:
        print("есть контур реки")
    (CACHE / "dem").mkdir(exist_ok=True)
    x0, x1, y0, y1 = dem_tiles()
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            dst = CACHE / "dem" / f"{DEM_Z}_{x}_{y}.png"
            if dst.exists() and dst.stat().st_size > 1000:
                continue
            print("тянем высоты", x, y, flush=True)
            subprocess.run(["curl", "-s", "-m", "60", "-A", UA, "-o", str(dst),
                            DEM_URL.format(z=DEM_Z, x=x, y=y)], check=True)


# ─────────────── геометрия ───────────────

def load(name):
    p = CACHE / f"{name}.json"
    if not p.exists():
        raise SystemExit(f"нет выгрузки {name} — сначала запусти fetch")
    return json.loads(p.read_text())["elements"]


def simplify(pts, eps):
    """Дуглас–Пекер без рекурсии."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        nrm = math.hypot(dx, dy) or 1e-9
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / nrm
            if d > best:
                best, bi = d, i
        if best > eps:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]


def ring_area(pts):
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def in_poly(x, z, p):
    inside = False
    j = len(p) - 1
    for i in range(len(p)):
        xi, zi, xj, zj = p[i][0], p[i][1], p[j][0], p[j][1]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            inside = not inside
        j = i
    return inside


def seg_dist(x, z, ax, az, bx, bz):
    dx, dz = bx - ax, bz - az
    l2 = dx * dx + dz * dz or 1e-9
    t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / l2))
    return math.hypot(x - ax - dx * t, z - az - dz * t), t


def river_mask(river, proj, gx0, gz0, nx, nz):
    """Маска реки по узлам сетки. Мультиполигон реки на сотни километров,
       в выгрузку попадают только берега у города, и цепочки обрываются
       на её краю. Поэтому чётность пересечений считаем лучами в четыре
       стороны и берём большинство: луч, ушедший в разрыв берега, врёт
       один, остальные три его перебивают. (В Томске река текла поперёк
       рамки и хватало одного луча; Москва-река здесь поворачивает и
       уходит за край вбок — там одинокий луч красил полосу через весь
       город.)"""
    ways = {e["id"]: e for e in river if e["type"] == "way"}
    segs = []
    for rel in river:
        if rel["type"] != "relation":
            continue
        for m in rel["members"]:
            w = ways.get(m["ref"]) if m["type"] == "way" else None
            if w:
                g = [proj(p["lat"], p["lon"]) for p in w["geometry"]]
                segs.extend(zip(g, g[1:]))
    XS = gx0 + np.arange(nx) * GRID
    ZS = gz0 + np.arange(nz) * GRID
    rows = [[] for _ in range(nz)]      # где берег пересекает строку сетки
    cols = [[] for _ in range(nx)]      # и столбец
    for (ax, az), (bx, bz) in segs:
        if az != bz:
            lo, hi = min(az, bz), max(az, bz)
            for j in range(max(0, int(math.ceil((lo - gz0) / GRID))), min(nz - 1, int(math.floor((hi - gz0) / GRID))) + 1):
                z = ZS[j]
                if z != hi:
                    rows[j].append(ax + (bx - ax) * (z - az) / (bz - az))
        if ax != bx:
            lo, hi = min(ax, bx), max(ax, bx)
            for i in range(max(0, int(math.ceil((lo - gx0) / GRID))), min(nx - 1, int(math.floor((hi - gx0) / GRID))) + 1):
                x = XS[i]
                if x != hi:
                    cols[i].append(az + (bz - az) * (x - ax) / (bx - ax))
    votes = np.zeros((nz, nx), dtype=np.int32)
    for j in range(nz):
        c = np.sort(np.array(rows[j]))
        left = np.searchsorted(c, XS)                 # пересечений левее узла
        votes[j] += (left % 2) + ((len(c) - left) % 2)
    for i in range(nx):
        c = np.sort(np.array(cols[i]))
        up = np.searchsorted(c, ZS)
        votes[:, i] += (up % 2) + ((len(c) - up) % 2)
    return votes >= 3


def load_dem():
    """мозаика тайлов Terrarium: высота = R*256 + G + B/256 - 32768"""
    x0, x1, y0, y1 = dem_tiles()
    rows = []
    for y in range(y0, y1 + 1):
        row = []
        for x in range(x0, x1 + 1):
            p = CACHE / "dem" / f"{DEM_Z}_{x}_{y}.png"
            if not p.exists():
                raise SystemExit("нет тайлов высот — сначала запусти fetch")
            row.append(np.asarray(Image.open(p).convert("RGB")).astype(np.float64))
        rows.append(np.hstack(row))
    a = np.vstack(rows)
    e = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    good = e > -100
    e[~good] = np.median(e[good])
    n = 2 ** DEM_Z

    def sample(lat, lon):
        X = ((lon + 180) / 360 * n - x0) * 256
        Y = ((1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n - y0) * 256
        j = np.clip(np.floor(X).astype(int), 0, e.shape[1] - 2)
        i = np.clip(np.floor(Y).astype(int), 0, e.shape[0] - 2)
        fx, fy = X - j, Y - i
        return (e[i, j] * (1 - fx) * (1 - fy) + e[i, j + 1] * fx * (1 - fy)
                + e[i + 1, j] * (1 - fx) * fy + e[i + 1, j + 1] * fx * fy)
    return sample


def blur(a, sigma):
    r = int(math.ceil(sigma * 3))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    p = np.pad(a, r, mode="edge")
    p = np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 0, p)
    p = np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 1, p)
    return p


def build():
    clat, clon = PROJ_CENTER
    mpd_lon = MPD_LAT * math.cos(math.radians(clat))
    cx0, cz0, cx1, cz1 = CROP
    ox, oz = (cx0 + cx1) / 2, (cz0 + cz1) / 2      # центр области: от него считает игра
    W, D = cx1 - cx0, cz1 - cz0

    def prj(lat, lon):
        """градусы -> метры игры (начало — центр области)"""
        return ((lon - clon) * mpd_lon - ox, (clat - lat) * MPD_LAT - oz)

    def in_area(x, z, pad=PAD):
        return -W / 2 - pad <= x <= W / 2 + pad and -D / 2 - pad <= z <= D / 2 + pad

    def inside(pts, pad=PAD):
        return any(in_area(x, z, pad) for x, z in pts)

    def ints(pts):
        return [[int(round(x)), int(round(z))] for x, z in pts]

    def geom(el):
        g = el.get("geometry")
        return [prj(p["lat"], p["lon"]) for p in g if p] if g else None

    # ── рельеф ──
    gx0, gz0 = -W / 2 - GRID_PAD, -D / 2 - GRID_PAD
    nx = int(math.ceil((W + 2 * GRID_PAD) / GRID)) + 1
    nz = int(math.ceil((D + 2 * GRID_PAD) / GRID)) + 1
    XS = gx0 + np.arange(nx) * GRID
    ZS = gz0 + np.arange(nz) * GRID
    gX, gZ = np.meshgrid(XS, ZS)
    lat = clat - (gZ + oz) / MPD_LAT
    lon = clon + (gX + ox) / mpd_lon
    raw = load_dem()(lat, lon)
    H = blur(raw, SMOOTH)

    river = load("river")
    wet = river_mask(river, prj, gx0, gz0, nx, nz)
    wl = float(np.percentile(raw[wet], 55)) + 0.5 if wet.any() else float(raw.min())
    H = np.maximum(H - wl, 0.7)
    shore = blur(np.where(wet, -1.0, 1.0), 0.9)
    t = np.clip((shore + 0.55) / 1.1, 0, 1)
    t = t * t * (3 - 2 * t)
    H = -BED + (H + BED) * t
    wet = H < 0

    def is_wet(x, z):
        i = int(round((x - gx0) / GRID))
        j = int(round((z - gz0) / GRID))
        return 0 <= i < nx and 0 <= j < nz and wet[j, i]

    # ── дома ── (раньше дорог: по ним проверяем ширину полотна и съезды)
    buildings = []
    for el in load("buildings"):
        tg = el.get("tags", {})
        g = geom(el)
        if not g or len(g) < 4:
            continue
        if g[0] == g[-1]:
            g = g[:-1]
        if len(g) < 3 or ring_area(g) < 25 or not inside(g):
            continue
        if tg.get("building") in ("roof", "carport", "construction"):
            continue                                   # навесы: сквозь них ездят
        if tg.get("layer", "0").startswith("-") or tg.get("location") == "underground":
            continue
        g = simplify(g, 0.8)
        if len(g) < 3 or any(is_wet(x, z) for x, z in g):
            continue
        try:
            lv = int(float(str(tg.get("building:levels", "")).replace(",", ".").split(";")[0]))
            lv = max(1, min(40, lv))
        except ValueError:
            lv = 0
        b = {"lv": lv, "p": ints(g)}
        if tg.get("name"):
            b["n"] = tg["name"]
        if tg.get("addr:street") and tg.get("addr:housenumber"):
            b["a"] = [tg["addr:street"], tg["addr:housenumber"]]
        # тип дома решает, как он выглядит: офис — в стекле, жилой — с
        # балконами, торговый — с витринами, промка — с лентой окон под крышей
        kind = tg.get("building", "yes")
        if kind in ("church", "chapel", "cathedral", "temple"):
            b["k"] = "church"
        elif kind in ("industrial", "warehouse", "garage", "garages", "shed", "service", "hangar", "guardhouse", "bunker"):
            b["k"] = "ind"
        elif kind in ("office", "commercial", "government") or (tg.get("office") and kind == "yes"):
            b["k"] = "off"
        elif kind in ("retail", "supermarket", "kiosk") or (tg.get("shop") and kind == "yes"):
            b["k"] = "shop"
        elif kind in ("public", "civic", "university", "college", "school", "kindergarten", "hospital",
                      "train_station", "sports_centre"):
            b["k"] = "pub"
        elif kind in ("apartments", "residential", "house", "dormitory"):
            b["k"] = "res"
        col = str(tg.get("building:colour", "")).split(";")[0].strip().lower()
        if col:
            b["col"] = COLOURS.get(col, col if col.startswith("#") and len(col) in (4, 7) else None)
            if not b["col"]:
                del b["col"]
        if tg.get("roof:shape") in ("gabled", "hipped", "pyramidal", "skillion"):
            b["roof"] = tg["roof:shape"][0]
        buildings.append(b)

    bcell = {}
    for bi, b in enumerate(buildings):
        xs = [q[0] for q in b["p"]]
        zs = [q[1] for q in b["p"]]
        b["_bb"] = (min(xs), min(zs), max(xs), max(zs))
        for i in range(int(min(xs) // 40), int(max(xs) // 40) + 1):
            for j in range(int(min(zs) // 40), int(max(zs) // 40) + 1):
                bcell.setdefault((i, j), []).append(bi)

    def house_at(x, z, m=0.0):
        """индекс дома, в контуре которого точка (или ближе m к стене)"""
        for bi in bcell.get((int(x // 40), int(z // 40)), ()):
            bb = buildings[bi]["_bb"]
            if not (bb[0] - m <= x <= bb[2] + m and bb[1] - m <= z <= bb[3] + m):
                continue
            p = buildings[bi]["p"]
            if in_poly(x, z, p):
                return bi
            if m > 0:
                for i in range(len(p)):
                    if seg_dist(x, z, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1])[0] < m:
                        return bi
        return -1

    # ── дороги ──
    raw_roads = []
    seen_nodes, junctions = set(), set()
    for el in load("roads"):
        tg = el.get("tags", {})
        if ROAD_CLASS.get(tg.get("highway")) is None:
            continue
        if tg.get("tunnel") not in (None, "no") or tg.get("covered") == "yes":
            continue                                   # тоннели и проезды под домами
        if tg.get("area") == "yes":
            continue                                   # площадь, а не улица
        raw_roads.append(el)
        for nid in el.get("nodes", []):
            if nid in seen_nodes:
                junctions.add(nid)
            else:
                seen_nodes.add(nid)

    def simplify_keeping_junctions(pts, nodes, eps):
        cuts = [0] + [i for i in range(1, len(pts) - 1)
                      if i < len(nodes) and nodes[i] in junctions] + [len(pts) - 1]
        out = []
        for a, b in zip(cuts, cuts[1:]):
            piece = simplify(pts[a:b + 1], eps)
            out.extend(piece if not out else piece[1:])
        return out

    roads = []
    for el in raw_roads:
        tg = el.get("tags", {})
        cls = ROAD_CLASS[tg["highway"]]
        g = geom(el)
        if not g or len(g) < 2 or not inside(g):
            continue
        g = simplify_keeping_junctions(g, el.get("nodes", []), 1.2)
        if len(g) < 2:
            continue
        try:
            lanes = int(str(tg.get("lanes", "")).split(";")[0])
        except ValueError:
            lanes = 0
        ow = tg.get("oneway")
        oneway = 1 if ow in ("yes", "true", "1") or tg.get("junction") in ("roundabout", "circular") \
            or (tg.get("highway") in ("motorway", "motorway_link") and ow != "no") else (-1 if ow == "-1" else 0)
        if oneway == -1:
            g = g[::-1]
            oneway = 1
        if lanes:
            w = lanes * 3.3 + (0.6 if oneway else 0.8)
        else:
            w = ROAD_W[cls] * (0.62 if oneway and cls <= 4 else 1)
        w = max(4.5 if cls >= 6 else 5.0, min(w, 26))
        road = {"c": cls, "n": tg.get("name", ""), "l": lanes, "o": oneway, "w": round(w, 1), "p": ints(g)}
        if tg.get("bridge") and tg.get("bridge") != "no":
            road["b"] = 1
        if tg.get("service"):
            road["s"] = tg["service"]
        roads.append(road)

    # Полотно не должно залезать в дом: ширину в карте ставим по классу
    # улицы, а в настоящем дворе проезд идёт вплотную к стене. Сужаем
    # полотно, пока края не выйдут из стен; дом, стоящий на самой осевой
    # (такое бывает с проездами под аркой), не трогаем — там проезд убран.
    narrowed = 0
    for r in roads:
        if r.get("b"):
            continue
        w = r["w"]
        while w > 3.4:
            hit = False
            for (x1, z1), (x2, z2) in zip(r["p"], r["p"][1:]):
                L = math.hypot(x2 - x1, z2 - z1)
                if L < 0.1:
                    continue
                sx, sz = -(z2 - z1) / L, (x2 - x1) / L
                for k in range(int(L // 2.5) + 1):
                    tt = min(1.0, k * 2.5 / L)
                    if tt < 0.08 or tt > 0.92:
                        continue                          # у перекрёстка угол дома — это норма
                    for o in (w / 2 - 0.3, -(w / 2 - 0.3)):
                        if house_at(x1 + (x2 - x1) * tt + sx * o, z1 + (z2 - z1) * tt + sz * o) >= 0:
                            hit = True
                            break
                    if hit:
                        break
                if hit:
                    break
            if not hit:
                break
            w -= 1.0
        if w < r["w"]:
            r["w"] = round(max(w, 3.4), 1)
            narrowed += 1

    # проезд, у которого сама осевая идёт сквозь дом, — ошибка выгрузки
    # (или арка): машину в стену не пускаем, выкидываем кусок
    def through_house(r):
        for (x1, z1), (x2, z2) in zip(r["p"], r["p"][1:]):
            L = math.hypot(x2 - x1, z2 - z1)
            for k in range(1, int(L // 2)):
                tt = k * 2 / L
                if house_at(x1 + (x2 - x1) * tt, z1 + (z2 - z1) * tt) >= 0:
                    return True
        return False
    before = len(roads)
    roads = [r for r in roads if r["c"] <= 3 or not through_house(r)]
    dropped = before - len(roads)

    # ── связность ── Всё, что не соединено с офисом, рисуем, но туда не
    # ездим: это тот берег реки и обрывки проездов за рамкой.
    def graph():
        idx, par = {}, []

        def nid(q):
            k = (q[0], q[1])
            if k not in idx:
                idx[k] = len(par)
                par.append(len(par))
            return idx[k]

        def root(a):
            while par[a] != a:
                par[a] = par[par[a]]
                a = par[a]
            return a
        for r in roads:
            if r["c"] == 6:
                continue
            a = nid(r["p"][0])
            for q in r["p"][1:]:
                b = nid(q)
                par[root(a)] = root(b)
                a = b
        comps = {}
        for k, i in idx.items():
            comps.setdefault(root(i), []).append(k)
        return sorted(comps.values(), key=len, reverse=True)

    def clear_path(q, m):
        for tt in (0.2, 0.4, 0.6, 0.8):
            x, z = q[0] + (m[0] - q[0]) * tt, q[1] + (m[1] - q[1]) * tt
            if is_wet(x, z) or house_at(x, z, 1.0) >= 0:
                return False
        return True

    stitched = 0
    for _ in range(6):
        comps = graph()
        main, cell = comps[0], {}
        for q in main:
            cell.setdefault((q[0] // 30, q[1] // 30), []).append(q)
        added = False
        for comp in comps[1:]:
            if len(comp) < 2:
                continue
            best = None
            for q in comp:
                if not in_area(q[0], q[1], 0):
                    continue
                ci, cj = q[0] // 30, q[1] // 30
                for i in (ci - 1, ci, ci + 1):
                    for j in (cj - 1, cj, cj + 1):
                        for m in cell.get((i, j), ()):
                            d = math.hypot(q[0] - m[0], q[1] - m[1])
                            if 1 < d <= 25 and (not best or d < best[0]) and clear_path(q, m):
                                best = (d, q, m)
            if not best:
                continue
            _, q, m = best
            roads.append({"c": 7, "n": "", "l": 0, "o": 0, "w": 5.0, "p": [list(q), list(m)]})
            stitched += 1
            added = True
        if not added:
            break

    # ── мост ── Настоящего моста через реку в рамке нет: до ближайшего,
    # Автозаводского, — за ТТК. Кладём выдуманный: самое короткое место
    # между набережными недалеко от офиса, от узла одной улицы до узла
    # другой. Без него тот берег был бы только декорацией.
    comps = graph()
    home_q = min((q for c in comps for q in c), key=lambda q: (q[0] + ox) ** 2 + (q[1] + oz) ** 2)
    here = next(set(c) for c in comps if home_q in c)
    road_of = {}
    for r in roads:
        if r["c"] <= 4 and not r.get("b"):
            for q in r["p"]:
                road_of[(q[0], q[1])] = r
    near_water = lambda q: any(is_wet(q[0] + dx, q[1] + dz) for dx in (-60, 0, 60) for dz in (-60, 0, 60))
    east = [q for q in road_of if q in here and in_area(q[0], q[1], 0) and near_water(q)]
    west = [q for q in road_of if q not in here and in_area(q[0], q[1], 40) and near_water(q)]
    bridge = None
    for a in east:
        for b in west:
            L = math.hypot(a[0] - b[0], a[1] - b[1])
            if L < 60 or L > 340:
                continue
            samples = [(a[0] + (b[0] - a[0]) * k / 20, a[1] + (b[1] - a[1]) * k / 20) for k in range(1, 20)]
            if sum(is_wet(x, z) for x, z in samples) < 8:
                continue                                  # не через реку
            if any(house_at(x, z, 2.0) >= 0 for x, z in samples):
                continue
            mx, mz = (a[0] + b[0]) / 2 + ox, (a[1] + b[1]) / 2 + oz
            score = L + 0.35 * math.hypot(mx, mz)          # покороче и поближе к офису
            if not bridge or score < bridge[0]:
                bridge = (score, a, b, L)
    if bridge:
        _, a, b, L = bridge
        roads.append({"c": 2, "n": "Омега-мост", "l": 4, "o": 0, "w": 14.0, "b": 1,
                      "p": [list(a), list(b)], "fake": 1})

    comps = graph()
    home = home_q                                    # узел у офиса: от него считаем связность
    main = next(set(c) for c in comps if home in c)
    for r in roads:
        if r["c"] != 6 and not any((q[0], q[1]) in main for q in r["p"]):
            r["x"] = 1                                   # только нарисовать
    linked = len(main) / sum(len(c) for c in comps)

    # ── зелёнка, парковки, промзоны ──
    def green_kind(tg):
        if tg.get("leisure") in ("park", "garden"):
            return "park"
        if tg.get("leisure") in ("pitch", "stadium"):
            return "pitch"
        if tg.get("leisure") == "playground":
            return "play"
        if tg.get("landuse") in ("forest", "meadow", "grass", "recreation_ground", "village_green", "flowerbed"):
            return "green"
        if tg.get("landuse") == "cemetery":
            return "cem"
        if tg.get("natural") in ("wood", "scrub", "grassland"):
            return "green"
        return None

    green, trees = [], []
    for el in load("green"):
        tg = el.get("tags", {})
        g = geom(el)
        if not g or not inside(g):
            continue
        if tg.get("natural") == "tree_row":
            # ряд деревьев — дерево каждые семь метров
            for (x1, z1), (x2, z2) in zip(g, g[1:]):
                L = math.hypot(x2 - x1, z2 - z1)
                for k in range(int(L // 7) + 1):
                    tt = min(1.0, (k * 7 + 3) / (L or 1))
                    trees.append((x1 + (x2 - x1) * tt, z1 + (z2 - z1) * tt))
            continue
        k = green_kind(tg)
        if not k or len(g) < 4:
            continue
        if g[0] == g[-1]:
            g = g[:-1]
        if ring_area(g) < 60:
            continue
        g = simplify(g, 1.5)
        if len(g) < 3:
            continue
        item = {"k": k, "p": ints(g)}
        if tg.get("name"):
            item["n"] = tg["name"]
        green.append(item)

    lots = []
    for el in load("lots"):
        tg = el.get("tags", {})
        g = geom(el)
        if not g or len(g) < 4 or not inside(g):
            continue
        if g[0] == g[-1]:
            g = g[:-1]
        if ring_area(g) < 80:
            continue
        g = simplify(g, 1.2)
        if len(g) < 3:
            continue
        if tg.get("amenity") == "parking":
            if tg.get("parking") in ("underground", "multi-storey", "rooftop"):
                continue
            k = "park"
        else:
            k = "ind" if tg.get("landuse") in ("industrial", "railway", "construction") else "com"
        lots.append({"k": k, "p": ints(g)})

    # ── дорожки в парках и дворах: только нарисовать ──
    paths = []
    for el in load("paths"):
        g = geom(el)
        if not g or len(g) < 2 or not inside(g, 20):
            continue
        g = simplify(g, 1.2)
        paths.append(ints(g))

    # ── точки ──
    stops, signals, crossings, entrances, benches, pois, metro = [], [], [], [], [], [], []
    POI_KIND = {"fast_food": "food", "cafe": "cafe", "restaurant": "food", "bar": "food", "pub": "food",
                "pharmacy": "pharm", "bank": "bank", "fuel": "fuel"}
    for el in load("points"):
        tg = el.get("tags", {})
        if el["type"] != "node":
            continue
        x, z = prj(el["lat"], el["lon"])
        if not in_area(x, z, 30):
            continue
        p = [round(x, 1), round(z, 1)]
        hw = tg.get("highway")
        if hw == "bus_stop" or tg.get("public_transport") == "platform":
            if tg.get("bus") == "yes" or tg.get("trolleybus") == "yes" or hw == "bus_stop" or tg.get("tram") == "yes":
                stops.append({"n": tg.get("name", ""), "p": p})
        elif hw == "traffic_signals":
            signals.append(p)
        elif hw == "crossing":
            crossings.append(p + [1 if tg.get("crossing") == "traffic_signals" else 0])
        elif tg.get("entrance"):
            # подъезд: куда смотрит — наружу из ближайшей стены
            best = None
            for bi in bcell.get((int(x // 40), int(z // 40)), ()):
                q = buildings[bi]["p"]
                for i in range(len(q)):
                    d, _ = seg_dist(x, z, q[i - 1][0], q[i - 1][1], q[i][0], q[i][1])
                    if d < 2.5 and (not best or d < best[0]):
                        best = (d, bi, i)
            if not best:
                continue
            _, bi, i = best
            q = buildings[bi]["p"]
            ax, az, bx, bz = q[i - 1][0], q[i - 1][1], q[i][0], q[i][1]
            L = math.hypot(bx - ax, bz - az) or 1
            nxv, nzv = -(bz - az) / L, (bx - ax) / L
            if in_poly(x + nxv * 1.5, z + nzv * 1.5, q):
                nxv, nzv = -nxv, -nzv
            _, tt = seg_dist(x, z, ax, az, bx, bz)
            ex, ez = ax + (bx - ax) * tt, az + (bz - az) * tt       # точно на стене
            entrances.append([round(ex, 1), round(ez, 1), round(nxv, 3), round(nzv, 3), bi])
        elif tg.get("natural") == "tree":
            trees.append((x, z))
        elif tg.get("amenity") == "bench":
            benches.append(p)
        elif tg.get("railway") == "subway_entrance" or tg.get("railway") == "station":
            metro.append({"n": tg.get("name", ""), "p": p, "k": "in" if tg.get("railway") == "subway_entrance" else "st"})
        else:
            am, sh = tg.get("amenity", ""), tg.get("shop", "")
            k = POI_KIND.get(am) or ("shop" if sh else None)
            if not k or not tg.get("name"):
                continue
            if am == "pharmacy":
                k = "pharm"
            elif am == "bank":
                k = "bank"
            elif am == "cafe" or sh in ("coffee",):
                k = "cafe"
            elif sh in ("supermarket", "convenience", "greengrocer", "bakery", "alcohol", "beverages", "seafood", "pastry", "confectionery"):
                k = "grocery"
            elif sh in ("outpost",):
                k = "pickup"
            poi = {"k": k, "n": tg["name"], "p": p}
            if tg.get("brand"):
                poi["b"] = tg["brand"]
            # вывеска — на стену ближайшего дома, ту, что смотрит на улицу
            best = None
            for i0 in (-1, 0, 1):
                for j0 in (-1, 0, 1):
                    for bi in bcell.get((int(x // 40) + i0, int(z // 40) + j0), ()):
                        q = buildings[bi]["p"]
                        inside_b = in_poly(x, z, q)
                        for i in range(len(q)):
                            ax, az, bx, bz = q[i - 1][0], q[i - 1][1], q[i][0], q[i][1]
                            L = math.hypot(bx - ax, bz - az)
                            if L < 4:
                                continue
                            d, tt = seg_dist(x, z, ax, az, bx, bz)
                            if d > (60 if inside_b else 12):
                                continue
                            nxv, nzv = -(bz - az) / L, (bx - ax) / L
                            mx, mz = ax + (bx - ax) * tt, az + (bz - az) * tt
                            if in_poly(mx + nxv * 1.2, mz + nzv * 1.2, q):
                                nxv, nzv = -nxv, -nzv
                            if house_at(mx + nxv * 2.5, mz + nzv * 2.5) >= 0:
                                continue                     # стена в соседний дом
                            # к улице ближе — лучше: вывеску видно с дороги
                            road_d = min((seg_dist(mx, mz, r["p"][k2 - 1][0], r["p"][k2 - 1][1], r["p"][k2][0], r["p"][k2][1])[0]
                                          for r in roads if r["c"] <= 5 and not r.get("x")
                                          for k2 in range(1, len(r["p"]))
                                          if abs(r["p"][k2][0] - mx) < 80 and abs(r["p"][k2][1] - mz) < 80), default=80)
                            score = d + road_d * 0.6
                            if not best or score < best[0]:
                                best = (score, mx, mz, nxv, nzv, L)
            if best:
                _, mx, mz, nxv, nzv, L = best
                poi["w"] = [round(mx, 1), round(mz, 1), round(nxv, 3), round(nzv, 3), round(L, 1)]
            pois.append(poi)

    # ── въезды ── Проезд, который кончается у стены, — это въезд в дом:
    # ворота, рампа, подземный паркинг. Ставим проём шириной с полотно.
    ends = {}
    for r in roads:
        for q in (r["p"][0], r["p"][-1]):
            ends[(q[0], q[1])] = ends.get((q[0], q[1]), 0) + 1
    shared = set()
    for r in roads:
        for q in r["p"][1:-1]:
            shared.add((q[0], q[1]))
    gates = []
    for r in roads:
        if r["c"] < 4 or r["c"] == 6 or r.get("b"):
            continue
        for end, prev in ((r["p"][0], r["p"][1]), (r["p"][-1], r["p"][-2])):
            key = (end[0], end[1])
            if ends.get(key, 0) > 1 or key in shared:
                continue                                  # не тупик
            ux, uz = end[0] - prev[0], end[1] - prev[1]
            L = math.hypot(ux, uz) or 1
            ux, uz = ux / L, uz / L
            best = None
            for i0 in (-1, 0, 1):
                for j0 in (-1, 0, 1):
                    for bi in bcell.get((int(end[0] // 40) + i0, int(end[1] // 40) + j0), ()):
                        q = buildings[bi]["p"]
                        for i in range(len(q)):
                            ax, az, bx, bz = q[i - 1][0], q[i - 1][1], q[i][0], q[i][1]
                            WL = math.hypot(bx - ax, bz - az)
                            if WL < r["w"] + 1:
                                continue
                            d, tt = seg_dist(end[0] + ux * 1.5, end[1] + uz * 1.5, ax, az, bx, bz)
                            if d > 4.5 or tt < 0.05 or tt > 0.95:
                                continue
                            nxv, nzv = -(bz - az) / WL, (bx - ax) / WL
                            if nxv * ux + nzv * uz > 0:
                                nxv, nzv = -nxv, -nzv       # наружу — навстречу проезду
                            if -(nxv * ux + nzv * uz) < 0.6:
                                continue                    # проезд идёт вдоль стены, а не в неё
                            if not best or d < best[0]:
                                best = (d, ax + (bx - ax) * tt, az + (bz - az) * tt, nxv, nzv)
            if best:
                _, gx, gz, nxv, nzv = best
                gates.append([round(gx, 1), round(gz, 1), round(nxv, 3), round(nzv, 3), r["w"]])

    # деревья: не в домах, не в реке, не гуще чем через два метра
    tcell, tree_out = {}, []
    for x, z in trees:
        if not in_area(x, z, 60) or is_wet(x, z) or house_at(x, z, 1.2) >= 0:
            continue
        key = (int(x // 4), int(z // 4))
        if any(math.hypot(x - a, z - b) < 2.2 for i in (-1, 0, 1) for j in (-1, 0, 1)
               for a, b in tcell.get((key[0] + i, key[1] + j), ())):
            continue
        tcell.setdefault(key, []).append((x, z))
        tree_out.append([round(x, 1), round(z, 1)])

    # индекс дома у подъезда больше не нужен как индекс — даём адрес
    ent_out = []
    for ex, ez, nxv, nzv, bi in entrances:
        ent_out.append([ex, ez, nxv, nzv])
    for b in buildings:
        del b["_bb"]

    hv = np.clip(np.round(H * 10) + 1000, 0, 65535).astype("<u2")
    city = {
        "meta": {
            "city": "Москва",
            "src": "OpenStreetMap, ODbL; рельеф — SRTM через Terrarium",
            "center": [clat, clon],
            "origin": [round(-ox, 1), round(-oz, 1)],   # где в координатах игры офис
            "size": [W, D],
        },
        "terrain": {
            "g": GRID, "nx": nx, "nz": nz, "x0": gx0, "z0": gz0,
            "wl": round(wl, 1),
            "h": base64.b64encode(hv.tobytes()).decode("ascii"),
        },
        "roads": roads, "buildings": buildings, "green": green, "lots": lots,
        "paths": paths, "stops": stops, "signals": signals, "crossings": crossings,
        "entrances": ent_out, "trees": tree_out, "benches": benches, "pois": pois,
        "metro": metro, "gates": gates,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(city, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text(
        "/* Москва вокруг Омега-Плазы из OpenStreetMap (ODbL) и рельеф SRTM.\n"
        "   Собран scripts/osm_moscow.py — руками не правим, перегенерируем.\n"
        "   Координаты в метрах: x на восток, z на юг, начало — центр области;\n"
        "   высота — над урезом Москвы-реки. */\n"
        "export default " + body + ";\n"
    )
    land = H[~wet]
    print(f"область      {W} × {D} м, офис в {city['meta']['origin']}")
    print(f"рельеф       {nx} × {nz} узлов по {GRID} м, урез {wl:.1f} м, "
          f"суша до {land.max():.0f} м над водой, вода {wet.mean():.0%} сетки")
    if bridge:
        print(f"мост         {bridge[1]} — {bridge[2]}, {bridge[3]:.0f} м")
    print(f"дороги       {len(roads)} (мостов {sum(1 for r in roads if r.get('b'))}, "
          f"односторонних {sum(1 for r in roads if r['o'])}, сужено {narrowed}, "
          f"сквозь дом убрано {dropped}, пришито {stitched}, "
          f"только нарисовать {sum(1 for r in roads if r.get('x'))}, в сети {linked:.0%} узлов)")
    print(f"дома         {len(buildings)} (с адресом {sum(1 for b in buildings if 'a' in b)})")
    print(f"зелёнка      {len(green)}, площадки {len(lots)}, дорожки {len(paths)}")
    print(f"светофоры    {len(signals)}, переходы {len(crossings)}, подъезды {len(ent_out)}")
    print(f"заведения    {len(pois)} (с вывеской на стене {sum(1 for q in pois if 'w' in q)}), въездов {len(gates)}")
    print(f"деревья      {len(tree_out)}, лавочки {len(benches)}, остановки {len(stops)}, метро {len(metro)}")
    print(f"файл         {OUT.stat().st_size // 1024} КБ")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    if cmd == "fetch":
        fetch()
    elif cmd == "build":
        build()
    else:
        raise SystemExit("команды: fetch | build")
