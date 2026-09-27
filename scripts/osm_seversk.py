#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Северск (ЗАТО, Томская область) целиком, по периметру забора, из
OpenStreetMap -> src/maps/seversk/city-data.js для карты игры ?map=seversk.

Что делает:
  1) fetch — тянет из Overpass API забор периметра, а по его рамке —
     дороги, дома, зелёнку, воду, железную дорогу, КПП, точки (светофоры,
     переходы, подъезды, деревья, лавочки, остановки, заведения, переезды)
     и рельеф — тайлы высот Terrarium (AWS Open Data, SRTM). Большие
     выгрузки режутся на куски, серверов три, на занятость — повтор.
     Всё кладётся в кеш scripts/.osm-cache/seversk/ (в гит не едет);
  2) build — собирает границу по забору, режет кеш по ней, снимает высоты
     на сетку, угадывает дома (этажность, стиль, цвет, крыша), пишет
     src/maps/seversk/city-data.js;
  3) png ПУТЬ — рисует готовую карту сверху для проверки глазами.

Запуск:
    python3 scripts/osm_seversk.py fetch
    python3 scripts/osm_seversk.py build
    python3 scripts/osm_seversk.py png /tmp/seversk.png

Нужны numpy и Pillow. Устроен как scripts/osm_moscow.py (его не трогаем),
отличия — граница многоугольником по забору, КПП и закрытые въезды,
железная дорога, угадайка домов по форме и соседям (тегов в Северске
почти нет: из трёх тысяч домов этажность у полутора сотен) и правки
руками в src/maps/seversk/overrides.json: { "<osm id>": {поля дома} }
поверх угаданного, ключи с «_» — комментарии. Подробно — docs/SEVERSK.md.

Координаты на выходе: метры, x на восток, z на юг (оси three.js), начало —
центр рамки границы; пиццерия — meta.home. Высота — метры над урезом Томи.
Данные OpenStreetMap, лицензия ODbL.
"""

import base64
import hashlib
import json
import math
import pathlib
import re
import subprocess
import sys
import time

import numpy as np
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts" / ".osm-cache" / "seversk"
OUT = ROOT / "src" / "maps" / "seversk" / "city-data.js"
OVR = ROOT / "src" / "maps" / "seversk" / "overrides.json"

UA = "dodo-delivery-game/1.0 (seversk map, OSM data)"
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
DEM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
DEM_Z = 14

# Начало проекции — «Додо Пицца» (node 11623536822), отсюда принимают заказы
PROJ_CENTER = (56.5812438, 84.9239941)
HOME_NODE = 11623536822
MPD_LAT = 111320.0

# Периметр — кольцо из четырёх заборов (в карте между ними разрывы — это КПП):
# северный «забор вокруг Северска» уходит на 15 км к СХК, его режем по CLIP_Z
FENCE = [231787793, 1182809499, 23752719, 1182809501]
# Север режем по прямой z = CLIP_Z (метры от пиццерии, z на юг). Жилой город
# кончается у −6200 (северные дачи и посёлок у Сосновки), дальше тайга, а с
# −6700 — промплощадки СХК. Отрезок по линии среза — тоже забор («внутренний»).
CLIP_Z = -6450
BORDER_EPS = 4.0               # упрощение границы, м
PAD = 150                      # за забором рисуем ещё полосу — до горизонта
FETCH_PAD = 450                # выгрузка шире: берега, дороги к КПП
MASK = 8                       # клетка растровой маски границы, м

GRID = 16                      # сетка рельефа: район большой, 12 м дороговато
GRID_PAD = 256
SMOOTH = 1.0
BED = 3.0

KPP_R = 60                     # КПП ближе — въезд открыт, дальше — «дорога закрыта»

COLOURS = {
    "beige": "#e6d6b8", "brown": "#b88a6e", "yellow": "#f0dca0", "white": "#eeebe4", "grey": "#bdbcc0",
    "gray": "#bdbcc0", "lightgrey": "#d6d4d6", "lightgray": "#d6d4d6", "red": "#d98c7a", "orange": "#eeb78a",
    "lightyellow": "#f3e8bf", "blue": "#a9c2dc", "lightblue": "#c3d8ea", "green": "#b7d1a8", "pink": "#ecc3c8",
    "lightgreen": "#c9e0bd", "darkgrey": "#98979d", "cream": "#f1e6cc", "silver": "#cfd3d8", "maroon": "#a7736b",
}
ROOF_COLOURS = {"green": "#6f8f6a", "red": "#9c5a45", "brown": "#7a5a48", "grey": "#8b8f94", "gray": "#8b8f94",
                "blue": "#5f7a8c", "black": "#55575a", "silver": "#b4b8bb", "darkgreen": "#556f52"}

ROAD_CLASS = {
    "motorway": 0, "trunk": 0, "motorway_link": 1, "trunk_link": 1,
    "primary": 1, "primary_link": 2, "secondary": 2, "secondary_link": 3,
    "tertiary": 3, "tertiary_link": 4, "unclassified": 4, "residential": 4,
    "living_street": 5, "pedestrian": 6, "service": 7,
}
ROAD_W = [20, 16, 13.5, 11, 9, 7, 5, 5.5]

# ── справочник по городу (docs/SEVERSK.md, откуда что) ──
# Старый центр — сталинская застройка 1949—1958: от Комсомольской на западе
# до пл. Ленина и Свердлова на востоке, от Ленина (у Томи) до Лесной и
# Пионерской на севере — Пушкина, Мира, Первомайская, Горького, Парковая,
# Маяковского, Леонтичука, западный конец пр. Коммунистического. Советская
# и Строителей восточнее площади — уже 60-е (хрущёвки). Контур — метры от
# пиццерии (x, z), снят по улицам из OSM.
OLD_CENTRE = [(-4580, -3130), (-3100, -3180), (-2480, -3140), (-2440, -2520),
              (-2560, -2180), (-3300, -2130), (-4300, -2050), (-4600, -2080)]
# Восточнее x = EAST_X (метры от пиццерии; это ул. Курчатова) — новый город
# 1970—90-х: Солнечная, Курчатова, Славского, Победы, Калинина за Курчатова —
# девятиэтажки и точки 9—17. Западнее, до пл. Ленина, — 60-е, пятиэтажки.
EAST_X = -1300
# Торговые центры: имя (подстрока, без регистра) -> вид. Как выглядят —
# догадка по фото и описаниям (в текстах цветов нет), см. docs/SEVERSK.md.
# facade — облицовка, glass — стеклянный вход/витражи, stripe — полоса-вывеска.
MALL_STYLE = [
    ("креатив", {"facade": "#d9dcdf", "glass": True, "stripe": "#e30613"}),     # Славского 12, 2023, Магнит/Чижик
    ("мармелайт", {"facade": "#ece6da", "glass": True, "stripe": "#d6246e"}),   # Курчатова 11а, 2012, 2 этажа
    ("олимп", {"facade": "#d8d2c4", "glass": True, "stripe": "#1d5fa8"}),       # Курчатова 36б
    ("витим", {"facade": "#e6dccb", "glass": False, "stripe": "#2a7d4f"}),      # Коммунистический 94, 4 этажа
    ("цум", {"facade": "#efe4c8", "glass": False, "stripe": "#b22222"}),        # Коммунистический 57, 3 этажа
    ("дружба", {"facade": "#e9e1cf", "glass": False, "stripe": "#c8423b"}),
    ("гранд", {"facade": "#dcd8d0", "glass": True, "stripe": "#7a3fa0"}),
    ("стройся", {"facade": "#e3e0d8", "glass": True, "stripe": "#f28c00"}),     # Коммунистический 46
    ("лето", {"facade": "#f3ead6", "glass": True, "stripe": "#f5a300"}),        # Солнечная 2 ст4, ТРК «Лето»
]

QUERIES = {
    "roads": 'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|unclassified|residential|living_street|pedestrian|service)$"]({bbox});',
    "paths": 'way["highway"~"^(footway|path|cycleway|steps)$"]["footway"!~"^(sidewalk|crossing)$"]({bbox});',
    "buildings": '(way["building"]({bbox});rel["building"]["type"="multipolygon"]({bbox}););',
    "green": ('(way["leisure"~"^(park|garden|pitch|playground|stadium)$"]({bbox});'
              'way["landuse"~"^(grass|forest|meadow|cemetery|recreation_ground|village_green|flowerbed)$"]({bbox});'
              'way["natural"~"^(wood|scrub|grassland)$"]({bbox});'
              'rel["landuse"~"^(forest|cemetery|meadow|grass)$"]["type"="multipolygon"]({bbox});'
              'rel["natural"~"^(wood|scrub)$"]["type"="multipolygon"]({bbox});'
              'rel["leisure"="park"]["type"="multipolygon"]({bbox});'
              'way["natural"="tree_row"]({bbox}););'),
    "lots": ('(way["amenity"="parking"]({bbox});'
             'way["landuse"~"^(industrial|commercial|retail|railway|construction|garages|residential|allotments|military)$"]({bbox});'
             'rel["landuse"~"^(industrial|garages|allotments|residential|military)$"]["type"="multipolygon"]({bbox}););'),
    "points": ('(node["highway"~"^(bus_stop|traffic_signals|crossing)$"]({bbox});'
               'node["public_transport"="platform"]({bbox});'
               'node["entrance"]({bbox});'
               'node["natural"="tree"]({bbox});'
               'node["amenity"~"^(bench|waste_basket|fast_food|cafe|restaurant|bar|pub|pharmacy|bank|fuel|place_of_worship)$"]({bbox});'
               'node["shop"]({bbox});'
               'node["railway"~"^(station|halt|level_crossing|crossing|tram_stop)$"]({bbox}););'),
}
# небольшие — одним куском
SMALL = {
    "amen": ('(way["amenity"~"^(school|kindergarten|hospital|clinic|college|university|place_of_worship|prison)$"]({bbox});'
             'way["shop"="mall"]({bbox});way["leisure"~"^(sports_centre|stadium)$"]({bbox});'
             'rel["amenity"~"^(school|kindergarten|hospital|clinic|college|university)$"]["type"="multipolygon"]({bbox}););'),
    "rails": ('(way["railway"~"^(rail|tram|narrow_gauge|light_rail|preserved)$"]({bbox});'
              'way["railway"="platform"]({bbox});way["public_transport"="platform"]["railway"]({bbox}););'),
    "water": ('(way["natural"="water"]({bbox});way["waterway"="riverbank"]({bbox});way["landuse"="reservoir"]({bbox});'
              'way["waterway"~"^(river|stream|canal)$"]({bbox}););'),
    # отдельные тротуары: где они отнесены от полотна — между ними газон с деревьями
    "sidewalks": 'way["highway"~"^(footway|path)$"]["footway"="sidewalk"]({bbox});',
    "kpp": None,               # свой вывод: out center
}
KPP_Q = ('[out:json][timeout:200];(node["barrier"="checkpoint"]({bbox});way["barrier"="checkpoint"]({bbox});'
         'node["military"="checkpoint"]({bbox});way["military"="checkpoint"]({bbox});'
         'nwr["name"~"КПП"]({bbox});way(938044450););out center tags;')
RIVER_Q = ('[out:json][timeout:250];(rel["natural"="water"]({bbox});rel["waterway"="riverbank"]({bbox});)'
           '->.r;.r out body;way(r.r)({bbox});out geom;')
TILES = 2                      # большие выгрузки — кусками TILES × TILES


# ─────────────── проекция и граница ───────────────

def mpd_lon():
    return MPD_LAT * math.cos(math.radians(PROJ_CENTER[0]))


def rel(lat, lon):
    """градусы -> метры от пиццерии (x на восток, z на юг)"""
    return ((lon - PROJ_CENTER[1]) * mpd_lon(), (PROJ_CENTER[0] - lat) * MPD_LAT)


def unrel(x, z):
    return (PROJ_CENTER[0] - z / MPD_LAT, PROJ_CENTER[1] + x / mpd_lon())


def fence_ring():
    """Четыре забора -> одно кольцо (метры от пиццерии). Концы соседних
       заборов не общие: между ними ворота КПП, метров 15—30, — стыкуем
       по ближайшему концу."""
    p = CACHE / "fence.json"
    if not p.exists():
        raise SystemExit("нет забора — сначала запусти fetch")
    ways = {e["id"]: [rel(q["lat"], q["lon"]) for q in e["geometry"]]
            for e in json.loads(p.read_text())["elements"] if e["type"] == "way"}
    left = [ways[i] for i in FENCE[1:]]
    ring = list(ways[FENCE[0]])
    while left:
        tx, tz = ring[-1]
        best = min([(math.hypot(w[0][0] - tx, w[0][1] - tz), k, False) for k, w in enumerate(left)] +
                   [(math.hypot(w[-1][0] - tx, w[-1][1] - tz), k, True) for k, w in enumerate(left)])
        if best[0] > 200:
            raise SystemExit(f"забор не сходится: разрыв {best[0]:.0f} м")
        w = left.pop(best[1])
        ring.extend(w[::-1] if best[2] else w)
    return ring


def clip_ring(ring, zc):
    """Кольцо ∩ полуплоскость z >= zc (Сазерленд — Ходжмен). Вторым
       возвращает флаги: точка лежит на линии среза."""
    out, on = [], []
    n = len(ring)
    for i in range(n):
        a, b = ring[i], ring[(i + 1) % n]
        ia, ib = a[1] >= zc, b[1] >= zc
        if ia:
            out.append(a)
            on.append(False)
        if ia != ib:
            t = (zc - a[1]) / (b[1] - a[1])
            out.append((a[0] + (b[0] - a[0]) * t, zc))
            on.append(True)
    return out, on


def border_rel():
    """Граница игры (метры от пиццерии): кольцо, флаги «на срезе»"""
    return clip_ring(fence_ring(), CLIP_Z)


def fetch_box():
    ring, _ = border_rel()
    xs = [q[0] for q in ring]
    zs = [q[1] for q in ring]
    p = FETCH_PAD
    s, w = unrel(min(xs) - p, max(zs) + p)
    n, e = unrel(max(xs) + p, min(zs) - p)
    return (round(s, 5), round(w, 5), round(n, 5), round(e, 5))


# ─────────────── выгрузка ───────────────

def overpass(query, tries=15):
    """Серверы Overpass по очереди: занятый отвечает html-ошибкой, а
       перегруженный — json с remark «timed out» и обрезанными данными.
       И то и другое — повтор на следующем."""
    for i in range(tries):
        ep = ENDPOINTS[i % len(ENDPOINTS)]
        try:
            r = subprocess.run(["curl", "-s", "-m", "420", "-A", UA, ep, "--data-urlencode", "data=" + query],
                               capture_output=True, timeout=440)
            out = r.stdout
        except subprocess.TimeoutExpired:
            out = b""
        if out.lstrip()[:1] == b"{":
            try:
                js = json.loads(out)
            except ValueError:
                js = None
            rm = str((js or {}).get("remark", "")).lower()
            if js is not None and "error" not in rm and "timed out" not in rm:
                return out
        if b"parse error" in out or b"static error" in out:
            raise SystemExit("Overpass: ошибка в запросе\n" + query)
        print(f"  {ep.split('/')[2]} занят, попытка {i + 1}", flush=True)
        time.sleep(8 if i % len(ENDPOINTS) else 25)
    raise SystemExit("Overpass не ответил — повтори позже (кеш сохранён, продолжит с места)")


def dem_tiles():
    n = 2 ** DEM_Z
    s, w, nth, e = fetch_box()

    def tile(lat, lon):
        return (int((lon + 180) / 360 * n),
                int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n))
    x0, y0 = tile(nth, w)
    x1, y1 = tile(s, e)
    return x0, x1, y0, y1


def got(p):
    return p.exists() and p.stat().st_size > 300


def fetch():
    CACHE.mkdir(parents=True, exist_ok=True)
    dst = CACHE / "fence.json"
    if not got(dst):
        print("тянем забор", flush=True)
        dst.write_bytes(overpass(f"[out:json][timeout:100];way(id:{','.join(map(str, FENCE))});out body geom;"))
    s, w, n, e = fetch_box()
    print(f"рамка {s},{w},{n},{e}")
    bbox = f"{s},{w},{n},{e}"
    for name, q in QUERIES.items():
        for i in range(TILES):
            for j in range(TILES):
                dst = CACHE / f"{name}_{i}{j}.json"
                if got(dst):
                    continue
                tb = (round(s + (n - s) * i / TILES, 5), round(w + (e - w) * j / TILES, 5),
                      round(s + (n - s) * (i + 1) / TILES, 5), round(w + (e - w) * (j + 1) / TILES, 5))
                print("тянем", name, i, j, flush=True)
                dst.write_bytes(overpass(f"[out:json][timeout:250];{q.format(bbox=','.join(map(str, tb)))}out geom;"))
                print("  ok", dst.stat().st_size // 1024, "КБ", flush=True)
    for name, q in SMALL.items():
        dst = CACHE / f"{name}.json"
        if got(dst):
            continue
        print("тянем", name, flush=True)
        body = KPP_Q.format(bbox=bbox) if name == "kpp" else f"[out:json][timeout:250];{q.format(bbox=bbox)}out geom;"
        dst.write_bytes(overpass(body))
        print("  ok", dst.stat().st_size // 1024, "КБ", flush=True)
    for name, body in (("river", RIVER_Q.format(bbox=bbox)),
                       ("home", f"[out:json][timeout:60];node({HOME_NODE});out;")):
        dst = CACHE / f"{name}.json"
        if not got(dst):
            print("тянем", name, flush=True)
            dst.write_bytes(overpass(body))
    (CACHE / "dem").mkdir(exist_ok=True)
    x0, x1, y0, y1 = dem_tiles()
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            dst = CACHE / "dem" / f"{DEM_Z}_{x}_{y}.png"
            if dst.exists() and dst.stat().st_size > 1000:
                continue
            print("тянем высоты", x, y, flush=True)
            for k in range(5):
                r = subprocess.run(["curl", "-s", "-m", "60", "-A", UA, "-o", str(dst),
                                    DEM_URL.format(z=DEM_Z, x=x, y=y)])
                if r.returncode == 0 and dst.exists() and dst.stat().st_size > 1000:
                    break
                time.sleep(3)
    print("выгрузка готова")


# ─────────────── геометрия ───────────────

def load(name):
    """выгрузка из кеша; кусками (name_ij.json) — склеиваем без повторов"""
    files = sorted(CACHE.glob(f"{name}_??.json")) or [CACHE / f"{name}.json"]
    seen, out = set(), []
    for p in files:
        if not p.exists():
            raise SystemExit(f"нет выгрузки {name} — сначала запусти fetch")
        for e in json.loads(p.read_text())["elements"]:
            k = (e["type"], e["id"])
            if k not in seen:
                seen.add(k)
                out.append(e)
    return out


def rnd(oid, salt=""):
    """детерминированная «случайность» от OSM id: одна и та же при каждой сборке"""
    h = hashlib.md5(f"{oid}:{salt}".encode()).digest()
    return int.from_bytes(h[:4], "little") / 2 ** 32


def pick(seq, oid, salt=""):
    return seq[int(rnd(oid, salt) * len(seq)) % len(seq)]


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


def simplify_ring(pts, eps):
    """замкнутый контур: режем в самой дальней от первой точке, чтобы
       Дуглас — Пекер не съел угол на стыке"""
    if len(pts) < 4:
        return pts
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    a = simplify(pts[:far + 1], eps)
    b = simplify(pts[far:] + [pts[0]], eps)
    return a[:-1] + b[:-1]


def ring_area(pts):
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def centroid(pts):
    s2 = cx = cz = 0.0
    for i in range(len(pts)):
        a, c = pts[i], pts[(i + 1) % len(pts)]
        cr = a[0] * c[1] - c[0] * a[1]
        s2 += cr
        cx += (a[0] + c[0]) * cr
        cz += (a[1] + c[1]) * cr
    if abs(s2) < 1e-6:
        return (sum(q[0] for q in pts) / len(pts), sum(q[1] for q in pts) / len(pts))
    return (cx / (3 * s2), cz / (3 * s2))


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


def seg_cross(a, b, c, d):
    """точка пересечения отрезков ab и cd (или None)"""
    r = (b[0] - a[0], b[1] - a[1])
    s = (d[0] - c[0], d[1] - c[1])
    den = r[0] * s[1] - r[1] * s[0]
    if abs(den) < 1e-9:
        return None
    t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den
    u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den
    if 0 <= t <= 1 and 0 <= u <= 1:
        return (a[0] + r[0] * t, a[1] + r[1] * t)
    return None


def hull(pts):
    """выпуклая оболочка (монотонная цепь Эндрю)"""
    p = sorted(set((float(x), float(z)) for x, z in pts))
    if len(p) < 3:
        return p
    cr = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for q in p:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], q) <= 0:
            lo.pop()
        lo.append(q)
    for q in reversed(p):
        while len(up) >= 2 and cr(up[-2], up[-1], q) <= 0:
            up.pop()
        up.append(q)
    return lo[:-1] + up[:-1]


def min_rect(pts):
    """Прямоугольник наименьшей площади вокруг контура: (ширина, длина,
       угол длинной стороны). Ширина и длина — главное, по чему угадываем
       дом: панелька — полоса 12 × 60—150, хрущёвка — 11—12 в ширину,
       точка — квадрат 18—25, гараж — коробка 3 × 6."""
    h = hull(pts)
    if len(h) < 3:
        return (0.0, 0.0, 0.0)
    best = None
    for i in range(len(h)):
        ax, az = h[i - 1]
        bx, bz = h[i]
        L = math.hypot(bx - ax, bz - az)
        if L < 1e-6:
            continue
        ux, uz = (bx - ax) / L, (bz - az) / L
        us = [(q[0] - ax) * ux + (q[1] - az) * uz for q in h]
        vs = [-(q[0] - ax) * uz + (q[1] - az) * ux for q in h]
        a, b = max(us) - min(us), max(vs) - min(vs)
        if not best or a * b < best[0]:
            ang = math.atan2(uz, ux) if a >= b else math.atan2(ux, -uz)
            best = (a * b, min(a, b), max(a, b), ang)
    return best[1:]


def rings_of(members, roles):
    """куски мультиполигона -> замкнутые кольца (lat, lon)"""
    parts = [[(q["lat"], q["lon"]) for q in m["geometry"] if q] for m in members
             if m.get("type") == "way" and m.get("role", "") in roles and m.get("geometry")]
    rings = []
    while parts:
        cur = parts.pop()
        while cur[0] != cur[-1]:
            for k, p in enumerate(parts):
                if p[0] == cur[-1]:
                    cur = cur + p[1:]
                elif p[-1] == cur[-1]:
                    cur = cur + p[::-1][1:]
                elif p[-1] == cur[0]:
                    cur = p + cur[1:]
                elif p[0] == cur[0]:
                    cur = p[::-1] + cur[1:]
                else:
                    continue
                parts.pop(k)
                break
            else:
                break
        if cur[0] == cur[-1] and len(cur) >= 4:
            rings.append(cur[:-1])
    return rings


def clip_rect(poly, x0, z0, x1, z1):
    """многоугольник ∩ прямоугольник (Сазерленд — Ходжмен по четырём сторонам)"""
    def cut(p, inside, cross):
        out = []
        for i in range(len(p)):
            a, b = p[i - 1], p[i]
            if inside(b):
                if not inside(a):
                    out.append(cross(a, b))
                out.append(b)
            elif inside(a):
                out.append(cross(a, b))
        return out

    def at_x(xv):
        return lambda a, b: (xv, a[1] + (b[1] - a[1]) * (xv - a[0]) / ((b[0] - a[0]) or 1e-9))

    def at_z(zv):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (zv - a[1]) / ((b[1] - a[1]) or 1e-9), zv)
    p = list(poly)
    for ins, cr in ((lambda q: q[0] >= x0, at_x(x0)), (lambda q: q[0] <= x1, at_x(x1)),
                    (lambda q: q[1] >= z0, at_z(z0)), (lambda q: q[1] <= z1, at_z(z1))):
        if not p:
            break
        p = cut(p, ins, cr)
    return p


class SegIndex:
    """отрезки по клеткам — чтобы «ближайшая дорога» не перебирала весь город"""

    def __init__(self, cell=40):
        self.c, self.g = cell, {}

    def add(self, a, b, item):
        c = self.c
        for i in range(int(min(a[0], b[0]) // c), int(max(a[0], b[0]) // c) + 1):
            for j in range(int(min(a[1], b[1]) // c), int(max(a[1], b[1]) // c) + 1):
                self.g.setdefault((i, j), []).append((a, b, item))

    def near(self, x, z, r):
        c, seen = self.c, set()
        for i in range(int((x - r) // c), int((x + r) // c) + 1):
            for j in range(int((z - r) // c), int((z + r) // c) + 1):
                for s in self.g.get((i, j), ()):
                    if id(s) not in seen:
                        seen.add(id(s))
                        yield s

    def nearest(self, x, z, r, ok=None):
        best = None
        for a, b, item in self.near(x, z, r):
            if ok and not ok(item):
                continue
            d, t = seg_dist(x, z, a[0], a[1], b[0], b[1])
            if d <= r and (not best or d < best[0]):
                best = (d, t, a, b, item)
        return best


def water_mask(segs, gx0, gz0, nx, nz):
    """Маска воды по узлам сетки — как в osm_moscow.py: мультиполигон Томи
       на сотни километров, в выгрузку попадают только берега у города,
       цепочки обрываются на краю. Чётность пересечений считаем лучами в
       четыре стороны и берём большинство — луч, ушедший в разрыв берега,
       врёт один, три других его перебивают."""
    XS = gx0 + np.arange(nx) * GRID
    ZS = gz0 + np.arange(nz) * GRID
    rows = [[] for _ in range(nz)]
    cols = [[] for _ in range(nx)]
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
        left = np.searchsorted(c, XS)
        votes[j] += (left % 2) + ((len(c) - left) % 2)
    for i in range(nx):
        c = np.sort(np.array(cols[i]))
        up = np.searchsorted(c, ZS)
        votes[:, i] += (up % 2) + ((len(c) - up) % 2)
    return votes >= 3


def drop_specks(wet, min_cells):
    """Лучи маски иногда красят одиночные клетки посреди суши (берег Томи в
       выгрузке рваный); там рельеф провалился бы ямой на 3 м. Связные куски
       воды меньше min_cells узлов выкидываем."""
    nz, nx = wet.shape
    seen = np.zeros_like(wet)
    out = wet.copy()
    dropped = 0
    for j0, i0 in zip(*np.nonzero(wet)):
        if seen[j0, i0]:
            continue
        comp, stack = [], [(j0, i0)]
        seen[j0, i0] = True
        while stack:
            j, i = stack.pop()
            comp.append((j, i))
            for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                a, b = j + dj, i + di
                if 0 <= a < nz and 0 <= b < nx and wet[a, b] and not seen[a, b]:
                    seen[a, b] = True
                    stack.append((a, b))
        if len(comp) < min_cells:
            for j, i in comp:
                out[j, i] = False
            dropped += 1
    return out, dropped


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


# ─────────────── дома: угадайка ───────────────
#
# Теги в Северске бедные: из трёх с лишним тысяч домов у двух с
# половиной — просто building=yes, этажность у полутора сотен, цвета и
# крыш нет вовсе. Поэтому что есть в теге — берём как есть, а остальное
# угадываем по форме пятна (минимальный прямоугольник: ширина × длина,
# заполненность), по месту (в каком он квартале по landuse, в старом ли
# центре, что вокруг) и по соседям с этажностью. Угадайка детерминирована:
# случайное — от OSM id, одна и та же при каждой сборке.

CHURCH_B = ("church", "chapel", "cathedral", "temple", "mosque", "synagogue", "religious", "monastery")
GAR_B = ("garage", "garages", "carport", "parking")
IND_B = ("industrial", "warehouse", "hangar", "service", "manufacture", "factory", "storage_tank",
         "transformer_tower", "bunker", "guardhouse", "military", "power", "substation", "boathouse",
         "hut", "container", "silo", "tech_cab")
PRIV_B = ("house", "detached", "bungalow", "cabin", "semidetached_house", "farm", "shed", "barn", "sauna",
          "greenhouse", "farm_auxiliary", "allotment_house", "toilets", "stable", "cowshed")
PUB_B = ("public", "civic", "university", "college", "school", "kindergarten", "hospital", "clinic",
         "train_station", "sports_centre", "sports_hall", "government", "fire_station", "museum",
         "theatre", "cinema", "library", "stadium", "grandstand", "dormitory_school")
SHOP_B = ("retail", "supermarket", "kiosk", "commercial", "mall", "shop", "pavilion")
PUB_AM = ("school", "kindergarten", "hospital", "clinic", "college", "university", "theatre", "cinema",
          "library", "community_centre", "arts_centre", "townhall", "police", "fire_station", "doctors",
          "social_facility", "post_office", "courthouse", "prison")
MALL_RE = ("тц ", "трц", "торгов", "стц", "цум", "гипермаркет", "молл")

# Палитры по стилю. Сталинки Северска крашеные: жёлтые, кремовые, персиковые,
# розоватые, с белыми карнизами; хрущёвки — белый силикатный кирпич; панельки
# 70—80-х — светло-серые плиты; частный сектор — дерево, сайдинг, крашеная
# вагонка; гаражи — серый кирпич и бетон, промзона — бетон и профлист.
PAL = {
    "stalin": ["#e8d8a8", "#f0e0b0", "#ecd39a", "#e8b89a", "#efc8a6", "#e9c3bc", "#f2e6c9", "#e4cf9e"],
    "panel": ["#dcdad3", "#d4d6d6", "#e2ded4", "#cfd2d4", "#d9d2c4", "#e0e2e2", "#cdc9bf"],
    "panel5": ["#e6e4de", "#e1ded6", "#dedbd2", "#e8e5dc", "#d8d5cd", "#c98f73"],
    "brick": ["#e6e4de", "#d9d4c8", "#c98f73", "#b97a63", "#e2d6bf", "#d1c7b4"],
    "priv": ["#b3895e", "#a7805a", "#c49a6c", "#9fb7a0", "#c8b27a", "#8fa9c2", "#e3dcc8", "#d8c7a2",
             "#b8c9a4", "#cfae85", "#e9e2cf", "#9c7b58"],
    "gar": ["#a9aaa8", "#b5b0a4", "#9ea3a6", "#b9b2a4", "#c1bcb0", "#a79b8a"],
    "ind": ["#c4c2bb", "#b8bcbf", "#d2cbbd", "#bfc5c9", "#c9c4b7", "#aeb4b8", "#c7b9a4"],
    "pub": ["#e6c7a0", "#f0e0c8", "#d9b7a5", "#e8dcc0", "#e5e1d6", "#dcc9a8"],
    "shop": ["#e8e3d8", "#d7dde2", "#ece6d6", "#dfe3e6", "#e2d9c8"],
    "mall": ["#d9dcdf", "#e4e6e8", "#cfd5da"],
    "modern": ["#d9dcdf", "#e4e0d8", "#cfd6db", "#e8e1d4"],
    "church": ["#f3efe6", "#f2ece0"],
}
ROOF_PITCHED = {
    "stalin": ["#4a6b4a", "#5b7a58", "#8a8f8f", "#7d8286", "#8c5a44"],
    "priv": ["#6f8f6a", "#9c5a45", "#7a5a48", "#8b8f94", "#5f7a8c", "#a3a6a8", "#7e4a3c", "#556f52"],
    "brick": ["#8a8f8f", "#6f8f6a", "#8c5a44", "#7d8286"],
    "panel5": ["#8a8f8f", "#7d8286", "#6f8f6a"],
    "pub": ["#6f8f6a", "#8a8f8f"],
    "ind": ["#8b8f94", "#a3a6a8", "#6f8f6a", "#7d8286"],
    "church": ["#4f7a5a", "#5f7a8c"],
}


def classify(b):
    """Решает про дом: вид k, стиль st, этажи lv, цвет col, крыша roof, цвет
       крыши rc. На входе b — сырые теги, метрики пятна, соседи и
       кварталы (всё посчитано заранее в build). Возвращает поля для
       выгрузки и why — какое правило решило (для сводки)."""
    tg, oid = b["tags"], b["id"]
    bt = tg.get("building", "yes")
    A, w, L, fill = b["A"], b["w"], b["L"], b["fill"]
    Z = b["zones"]
    name = (tg.get("name") or "").lower()
    am = tg.get("amenity", "")
    k = st = why = None
    lv = b["lv"]
    old = b["old"]

    def lv_or(v):
        return lv or v

    # ── то, что сказано тегами ──
    if bt in CHURCH_B or am == "place_of_worship" or ("worship" in Z and A >= 60 and bt == "yes"):
        k, st, why = "church", "church", "тег/храм"
    elif bt in GAR_B or ("garages" in Z and A < 3000):
        k, st, why = "gar", "gar", "тег/гаражный кооператив"
    elif tg.get("shop") == "mall" or bt == "mall" or any(m in name + " " for m in MALL_RE) or ("mall" in Z and A >= 400) \
            or (A >= 400 and any(re.search(r"(^|[^а-яё])" + n_ + r"($|[^а-яё])", name) for n_, _ in MALL_STYLE)):
        k, st, why = "mall", "mall", "ТЦ"
    elif bt in PUB_B or am in PUB_AM or (Z & {"school", "kindergarten", "hospital", "clinic", "college", "university", "sports"}
                                         and A >= 150 and bt not in PRIV_B + IND_B):
        k, st, why = "pub", "stalin" if old else "pub", "тег/школа-больница"
    elif bt in SHOP_B or (tg.get("shop") and bt == "yes" and A < 4000):
        k, st, why = "shop", "shop", "тег/магазин"
    elif bt in ("office", "government") or (tg.get("office") and bt == "yes"):
        k, st, why = "off", "stalin" if old else "modern", "тег/офис"
    elif bt in IND_B or (Z & {"industrial", "railway", "military"} and bt == "yes"
                         and not (Z & {"residential"}) and not tg.get("addr:housenumber")):
        k, st, why = "ind", "ind", "тег/промзона"
    elif bt in PRIV_B:
        k, st, why = "priv", "priv", "тег/частный"
    # ── угадайка по форме ──
    elif b["lonely"] and not old and bt == "yes" and not name and A >= 250 and (b["slab"] or b["tower"] or A >= 600):
        k, st, why = ("gar", "gar", "полоса без адреса вдали от жилья — гаражи") if b["L"] >= 2.5 * w and w <= 22 \
            else ("ind", "ind", "коробка без адреса вдали от жилья — склад/база")
    elif b["garrow"] and not old:
        k, st, why = "gar", "gar", "ряды гаражей: параллельные полосы без адреса"
    elif 10 <= A <= 48 and w <= 4.8 and L <= 9 and b["box_nb"] >= 2:
        k, st, why = "gar", "gar", "ряд боксов 3×6"
    elif 4.2 <= w <= 8.2 and L >= 16 and L / max(w, 1) >= 2.8 and A <= 2600 and fill >= 0.75 \
            and bt not in ("apartments", "residential", "dormitory") and not old:
        k, st, why = "gar", "gar", "длинная полоса 6 м — гаражный ряд"
    elif A < 48:
        if b["small_nb"] >= 3 or Z & {"rural", "allot"}:
            k, st, why = "priv", "priv", "сарай/баня у частных"
        else:
            k, st, why = "ind", "ind", "будка/ТП"
    elif Z & {"allot"} and A < 250:
        k, st, why = "priv", "priv", "дача в СНТ"
    elif A < 185 and w >= 4 and (b["small_nb"] >= 3 or "rural" in Z) and not b["slab_nb"] \
            and bt not in ("apartments", "residential"):
        k, st, why = "priv", "priv", "частный сектор"
    elif old and b["slab"] and len(b["p"]) <= 6 and fill >= 0.93 and L >= 50:
        k, st, why = "res", "panel", "панельная вставка в старом центре"
    elif old and 140 <= A <= 5000 and w >= 8.5:
        k, st, why = "res", "stalin", "старый центр"
    elif b["slab"]:
        k, st, why = "res", "panel", "полоса-панелька"
    elif b["tower"] and not old:
        k, st, why = "res", "panel", "точка"
    elif A < 185 and w >= 4 and not b["slab_nb"] and bt not in ("apartments", "residential"):
        k, st, why = "priv", "priv", "малый отдельный дом"
    elif A > 1500 and fill >= 0.85 and w > 18:
        k, st, why = "ind", "ind", "большая коробка — склад/цех"
    else:
        k, st, why = "res", "brick", "прочее жильё"

    # ── этажи ──
    if not lv and b["h"]:
        lv = max(1, int(round((b["h"] - 1.5) / 3.0)))
    tag_lv = bool(lv)
    if k == "res" and st == "panel":
        if b["tower"]:
            lv = lv_or(b["nb_lv"] or (pick([9, 9, 10, 12, 12], oid, "lv") if b["east"] else pick([5, 5, 9], oid, "lv")))
        else:
            # 5 или 9. По-настоящему хрущёвка 1-335/1-464 — 11—12 м в ширину,
            # панели 70—80-х — 12—14 и длиннее; в OSM Северска пятна на пару
            # метров шире (см. build), отсюда пороги 14.5/17.5. Между ними
            # решает район: восточнее EAST_X — новый город 70—90-х (девятки),
            # западнее — 60-е (пятиэтажки). Сосед с тегом важнее формы.
            rule = 9 if w >= 17.5 or L >= 95 else 5 if w <= 14.5 and L <= 85 else (9 if b["east"] else 5)
            lv = lv_or(b["nb_lv"] or rule)
    elif st == "stalin":
        lv = lv_or(2 if A < 330 else 3 if w < 12.5 or A < 700 else (4 if L > 70 or rnd(oid, "lv") < 0.4 else 3))
    elif k == "priv":
        lv = lv_or(1 if A < 75 or bt in ("shed", "barn", "sauna", "greenhouse", "garage") else
                   (2 if A >= 95 and rnd(oid, "lv") < 0.28 else 1))
    elif k == "gar":
        lv = lv_or(1)
    elif k == "ind":
        lv = lv_or(1 if A < 400 else 2 if A < 4000 else 3)
    elif k == "pub":
        kind = next((z for z in ("kindergarten", "school", "hospital", "clinic", "college", "university", "sports") if z in Z), am or bt)
        lv = lv_or({"kindergarten": 2, "school": 3, "hospital": 5 if A > 1800 else 3, "clinic": 3,
                    "college": 4, "university": 4, "sports": 2}.get(kind, 2 if A < 400 else 3))
    elif k == "shop":
        lv = lv_or(1 if A < 350 else 2)
    elif k == "mall":
        lv = lv_or(3 if A > 4000 else 2)
    elif k == "off":
        lv = lv_or(3 if A > 300 else 2)
    elif k == "church":
        lv = lv_or(1)
    else:                                          # прочее жильё: двухэтажки, малоэтажный кирпич
        lv = lv_or(b["nb_lv"] if b["nb_lv"] and b["nb_lv"] <= 5 else (2 if A < 450 else 3 if A < 900 else 5))

    # ── цвет и крыша ──
    pal = "panel5" if st == "panel" and lv <= 5 else st
    col = b["col"]
    if not col:
        if st == "panel" and not b["tower"]:
            # в микрорайоне дома одной серии и одного цвета: цвет — от
            # клетки 250 м, а не от дома, иначе рябь
            col = pick(PAL[pal], f"{int(b['c'][0] // 250)}:{int(b['c'][1] // 250)}:{pal}", "col")
        else:
            col = pick(PAL.get(pal, PAL["brick"]), oid, "col")
    roof = b["roof"]
    if not roof:
        if k in ("priv", "church"):
            roof = "h" if rnd(oid, "roof") < 0.15 else "g"
        elif st == "stalin":
            roof = "h" if rnd(oid, "roof") < 0.7 else "g"
        elif st == "brick" and lv <= 3:
            roof = "g" if rnd(oid, "roof") < 0.7 else "h"
        elif st == "panel" and lv <= 5:
            roof = "g" if rnd(oid, "roof") < 0.2 else "f"
        elif k == "ind" and A < 300:
            roof = "g" if rnd(oid, "roof") < 0.35 else "f"
        else:
            roof = "f"
    rc = b["rc"]
    if not rc and roof != "f":
        rc = pick(ROOF_PITCHED.get(pal) or ROOF_PITCHED.get(st) or ROOF_PITCHED["brick"], oid, "rc")
    return {"k": k, "st": st, "lv": int(max(1, min(40, lv))), "col": col, "roof": roof, "rc": rc, "why": why,
            "tag_lv": tag_lv}


# ─────────────── сборка ───────────────

def build():
    ring_r, on_clip = border_rel()
    xs = [q[0] for q in ring_r]
    zs = [q[1] for q in ring_r]
    bx0, bz0 = int(math.floor(min(xs))), int(math.floor(min(zs)))
    bx1, bz1 = int(math.ceil(max(xs))), int(math.ceil(max(zs)))
    bx1 += (bx1 - bx0) % 2
    bz1 += (bz1 - bz0) % 2
    ox, oz = (bx0 + bx1) // 2, (bz0 + bz1) // 2       # центр рамки: от него считает игра
    W, D = bx1 - bx0, bz1 - bz0

    def prj(lat, lon):
        """градусы -> метры игры (начало — центр рамки границы)"""
        x, z = rel(lat, lon)
        return (x - ox, z - oz)

    def ints(pts):
        return [[int(round(x)), int(round(z))] for x, z in pts]

    def geom(el):
        g = el.get("geometry")
        return [prj(p["lat"], p["lon"]) for p in g if p] if g else None

    def polys(el, roles=("outer", "")):
        """контуры площадного объекта: у замкнутой линии — один, у
           мультиполигона — его внешние кольца (дыры не держим)"""
        if el["type"] == "way":
            g = geom(el)
            if not g or len(g) < 4 or g[0] != g[-1]:
                return []
            return [g[:-1]]
        if el["type"] == "relation":
            return [[prj(la, lo) for la, lo in r] for r in rings_of(el.get("members", []), roles)]
        return []

    # ── граница ── Кольцо поворачиваем так, чтобы оно начиналось сразу
    # после отрезка среза: тогда настоящий забор — одна ломаная, а срез —
    # её замыкание.
    ring = [(x - ox, z - oz) for x, z in ring_r]
    n = len(ring)
    ci = next(i for i in range(n) if on_clip[i] and on_clip[(i + 1) % n])
    ring = ring[ci + 1:] + ring[:ci + 1]
    real = simplify(ring, BORDER_EPS)
    border = real
    clip_seg = [real[-1], real[0]]
    b_edges = list(zip(border, border[1:] + border[:1]))

    def border_dist(x, z):
        return min(seg_dist(x, z, a[0], a[1], b[0], b[1])[0] for a, b in b_edges)

    # заборы — каждый свой ломаной (разрывы между ними — ворота КПП) + срез
    fence = []
    fence_els = {e["id"]: e for e in json.loads((CACHE / "fence.json").read_text())["elements"]}
    for fid in FENCE:
        g = geom(fence_els[fid])
        run = []
        for a, b in zip(g, g[1:]):
            ia, ib = a[1] >= CLIP_Z - oz, b[1] >= CLIP_Z - oz
            if ia:
                run.append(a)
            if ia != ib:
                t = (CLIP_Z - oz - a[1]) / (b[1] - a[1])
                q = (a[0] + (b[0] - a[0]) * t, CLIP_Z - oz)
                run.append(q)
                if ia:
                    fence.append(run)
                    run = []
        if g[-1][1] >= CLIP_Z - oz:
            run.append(g[-1])
        if len(run) >= 2:
            fence.append(run)
    fence = [ints(simplify(f, BORDER_EPS)) for f in fence] + [ints(clip_seg)]

    # ── маска «внутри забора» и «у забора» — растром, так быстрее ──
    mpad = PAD + 64
    mx0, mz0 = -W / 2 - mpad, -D / 2 - mpad
    mnx, mnz = int((W + 2 * mpad) / MASK) + 1, int((D + 2 * mpad) / MASK) + 1
    img = Image.new("L", (mnx, mnz), 0)
    dr = ImageDraw.Draw(img)
    pix = [((x - mx0) / MASK, (z - mz0) / MASK) for x, z in border]
    dr.polygon(pix, fill=1)
    m_in = np.array(img) > 0
    dr.line(pix + [pix[0]], fill=1, width=int(2 * PAD / MASK) + 1, joint="curve")
    m_near = np.array(img) > 0

    def inside(x, z):
        i, j = int((x - mx0) / MASK), int((z - mz0) / MASK)
        return 0 <= i < mnx and 0 <= j < mnz and bool(m_in[j, i])

    def near(x, z):
        i, j = int((x - mx0) / MASK), int((z - mz0) / MASK)
        return 0 <= i < mnx and 0 <= j < mnz and bool(m_near[j, i])

    def any_near(pts):
        return any(near(x, z) for x, z in pts)

    def clip_line(pts):
        """ломаная -> куски, что лежат у забора или внутри; кусок доводим
           до края полосы, а не обрываем на последней точке внутри"""
        out, cur = [], []
        for i, q in enumerate(pts):
            if near(*q):
                if not cur and i > 0:
                    cur.append(edge_pt(q, pts[i - 1]))
                cur.append(q)
            elif cur:
                cur.append(edge_pt(cur[-1], q))
                out.append(cur)
                cur = []
        if cur:
            out.append(cur)
        return [c for c in out if len(c) >= 2]

    def edge_pt(a, b):
        """a у забора, b снаружи: где отрезок выходит из полосы"""
        lo, hi = 0.0, 1.0
        for _ in range(12):
            t = (lo + hi) / 2
            if near(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t):
                lo = t
            else:
                hi = t
        return (a[0] + (b[0] - a[0]) * lo, a[1] + (b[1] - a[1]) * lo)

    rx0, rz0, rx1, rz1 = -W / 2 - PAD, -D / 2 - PAD, W / 2 + PAD, D / 2 + PAD

    # ── рельеф ──
    gx0, gz0 = -W / 2 - GRID_PAD, -D / 2 - GRID_PAD
    nx = int(math.ceil((W + 2 * GRID_PAD) / GRID)) + 1
    nz = int(math.ceil((D + 2 * GRID_PAD) / GRID)) + 1
    XS = gx0 + np.arange(nx) * GRID
    ZS = gz0 + np.arange(nz) * GRID
    gX, gZ = np.meshgrid(XS, ZS)
    clat, clon = PROJ_CENTER
    lat = clat - (gZ + oz) / MPD_LAT
    lon = clon + (gX + ox) / mpd_lon()
    raw = load_dem()(lat, lon)
    H = blur(raw, SMOOTH)

    def raw_at(x, z):
        i = min(nx - 1, max(0, int(round((x - gx0) / GRID))))
        j = min(nz - 1, max(0, int(round((z - gz0) / GRID))))
        return raw[j, i]

    # ── вода ── Томь — рельефом: всё ниже её уреза — вода, берег сам
    # уходит вниз. Озёра и пруды на другом уровне так не сделать (вода в
    # игре одна, на нуле), они плоским пятном k:'water' в зелёнке.
    river_segs, lakes, streams = [], [], []
    rv = load("river")
    rways = {e["id"]: e for e in rv if e["type"] == "way"}
    for r in rv:
        if r["type"] != "relation":
            continue
        tg = r.get("tags", {})
        # рельефом режем только саму Томь; Киргизки, канал СХК и пруды текут
        # выше её уреза — им проверка уровня ниже, как озёрам
        if "Томь" in tg.get("name", ""):
            for m in r["members"]:
                w_ = rways.get(m["ref"]) if m["type"] == "way" else None
                if w_:
                    g = geom(w_)
                    river_segs.extend(zip(g, g[1:]))
        else:
            mem = [dict(m, geometry=rways[m["ref"]]["geometry"]) for m in r["members"]
                   if m["type"] == "way" and m["ref"] in rways]
            for rg in rings_of(mem, ("outer", "")):
                lakes.append((r["id"], tg, [prj(la, lo) for la, lo in rg]))
    for e in load("water"):
        tg = e.get("tags", {})
        g = geom(e)
        if not g or len(g) < 2:
            continue
        if tg.get("waterway") in ("river", "stream", "canal") and tg.get("area") != "yes":
            if "Томь" in tg.get("name", ""):
                continue                               # сама Томь — рельефом
            for piece in clip_line(g):
                piece = simplify(piece, 2.0)
                w_ = {"river": 8, "canal": 5, "stream": 2.5}[tg["waterway"]]
                streams.append({"n": tg.get("name", ""), "w": w_, "p": ints(piece)})
            continue
        if g[0] != g[-1] or len(g) < 4:
            continue
        if "Томь" in tg.get("name", ""):
            river_segs.extend(zip(g, g[1:]))
        else:
            lakes.append((e["id"], tg, g[:-1]))
    wet = water_mask(river_segs, gx0, gz0, nx, nz) if river_segs else np.zeros((nz, nx), bool)
    wl = float(np.percentile(raw[wet], 55)) + 0.5 if wet.any() else float(np.percentile(raw, 1)) - 1
    water_decals = []
    low_lakes = 0
    for lid, tg, g in lakes:
        if not any_near(g) or ring_area(g) < 150:
            continue
        lvl = float(np.median([raw_at(x, z) for x, z in g]))
        if wet.any() and lvl - wl < 2.5:
            river_segs.extend(zip(g, g[1:] + g[:1]))     # протока или старица на уровне Томи — в рельеф
            low_lakes += 1
        else:
            gg = simplify_ring(clip_rect(g, rx0, rz0, rx1, rz1), 1.5)
            if len(gg) >= 3:
                it = {"k": "water", "p": ints(gg)}
                if tg.get("name"):
                    it["n"] = tg["name"]
                water_decals.append(it)
    if low_lakes:
        wet = water_mask(river_segs, gx0, gz0, nx, nz)
    wet, specks = drop_specks(wet, 40)
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

    # ── кварталы: landuse и площадные amenity — для угадайки домов ──
    zones = []

    def zone(kind, el, extra=None):
        for g in polys(el):
            if len(g) >= 3 and any_near(g):
                xs_, zs_ = [q[0] for q in g], [q[1] for q in g]
                zones.append((kind, g, (min(xs_), min(zs_), max(xs_), max(zs_)), el.get("tags", {}), el["id"]))
    lots, garlots = [], []
    for el in load("lots"):
        tg = el.get("tags", {})
        lu = tg.get("landuse")
        if lu == "garages":
            zone("garages", el)
        elif lu in ("industrial", "railway", "military"):
            zone(lu, el)
        elif lu in ("commercial", "retail"):
            zone("commercial", el)
        elif lu == "allotments":
            zone("allot", el)
        elif lu == "residential":
            zone("rural" if tg.get("residential") in ("rural", "single_family", "detached") or
                 str(tg.get("name", "")).startswith(("СНТ", "СТ ", "ДНТ", "садов")) else "residential", el)
        # площадки на выгрузку: парковки, промзоны, торговые, гаражи
        if lu in ("residential", "allotments", "military"):
            continue
        for g in polys(el):
            if len(g) < 3 or not any_near(g) or ring_area(g) < 80:
                continue
            g = simplify_ring(clip_rect(g, rx0, rz0, rx1, rz1), 1.2)
            if len(g) < 3:
                continue
            if tg.get("amenity") == "parking":
                if tg.get("parking") in ("underground", "multi-storey", "rooftop"):
                    continue
                k = "park"
            elif lu == "garages":
                k = "gar"
                garlots.append(ints(g))
            else:
                k = "ind" if lu in ("industrial", "railway", "construction") else "com"
            lots.append({"k": k, "p": ints(g)})
    AM_ZONE = {"school": "school", "kindergarten": "kindergarten", "hospital": "hospital", "clinic": "clinic",
               "college": "college", "university": "university", "place_of_worship": "worship", "prison": "industrial"}
    for el in load("amen"):
        tg = el.get("tags", {})
        if tg.get("shop") == "mall":
            zone("mall", el)
        elif tg.get("leisure") in ("sports_centre", "stadium"):
            zone("sports", el)
        elif tg.get("amenity") in AM_ZONE:
            zone(AM_ZONE[tg["amenity"]], el)

    def zones_at(x, z):
        return [(k, tg, zid) for k, g, bb, tg, zid in zones
                if bb[0] <= x <= bb[2] and bb[1] <= z <= bb[3] and in_poly(x, z, g)]

    # старый центр — многоугольник OLD_CENTRE в метрах от пиццерии
    oldc = [(x - ox, z - oz) for x, z in OLD_CENTRE]

    # ── дома ──
    pts_all = load("points")
    shop_pts = []
    for el in pts_all:
        tg = el.get("tags", {})
        if el["type"] == "node" and (tg.get("shop") or tg.get("amenity") in ("fast_food", "cafe", "restaurant", "pharmacy", "bank")):
            shop_pts.append((*prj(el["lat"], el["lon"]), tg))
    raw_b = []
    for el in load("buildings"):
        tg = el.get("tags", {})
        if tg.get("building") in ("roof", "carport", "construction", "ruins", "no") or tg.get("building:part"):
            continue
        if tg.get("layer", "0").startswith("-") or tg.get("location") == "underground":
            continue
        for g in polys(el):
            if len(g) < 3:
                continue
            A = ring_area(g)
            if A < 10:
                continue
            c = centroid(g)
            if not near(*c):
                continue
            g = simplify_ring(g, 0.7)
            if len(g) < 3 or is_wet(*c):
                continue
            w, L, ang = min_rect(g)
            try:
                lv = int(float(str(tg.get("building:levels", "")).replace(",", ".").split(";")[0]))
                lv = max(1, min(40, lv))
            except ValueError:
                lv = 0
            try:
                hh = float(str(tg.get("height", "")).replace("m", "").replace(",", ".").split(";")[0])
            except ValueError:
                hh = 0.0
            col = str(tg.get("building:colour", "")).split(";")[0].strip().lower()
            col = COLOURS.get(col, col if col.startswith("#") and len(col) in (4, 7) else None)
            rcol = str(tg.get("roof:colour", "")).split(";")[0].strip().lower()
            rcol = ROOF_COLOURS.get(rcol, rcol if rcol.startswith("#") and len(rcol) in (4, 7) else None)
            rs = tg.get("roof:shape")
            roof = {"gabled": "g", "hipped": "h", "pyramidal": "h", "half-hipped": "h", "skillion": "g",
                    "mansard": "h", "gambrel": "g", "flat": "f", "dome": "h", "onion": "h"}.get(rs)
            zk = zones_at(*c)
            raw_b.append({"id": el["id"], "tags": tg, "p": g, "A": A, "w": w, "L": L, "ang": ang,
                          "fill": A / max(w * L, 1e-6), "c": c, "lv": lv, "h": hh, "col": col, "rc": rcol,
                          "roof": roof, "zones": {q[0] for q in zk}, "zone_ids": zk,
                          "old": bool(oldc) and in_poly(c[0], c[1], oldc)})
    # Панелька — полоса. Пятна в OSM Северска шире настоящих на пару метров
    # (обведены по крыше с козырьками, по косому снимку): у размеченных
    # пятиэтажек ширина 12—16 м, у девятиэтажек 16—21, поэтому полоса —
    # 9.5—22 м в ширину, длиной от 28 м и не короче 2.6 ширины. Г- и
    # П-образные дома из секций — по толщине 2A/периметр (9—17.5 м).
    for b in raw_b:
        per = sum(math.hypot(b["p"][i][0] - b["p"][i - 1][0], b["p"][i][1] - b["p"][i - 1][1]) for i in range(len(b["p"])))
        b["thick"] = 2 * b["A"] / max(per, 1e-6)
        b["slab"] = (9.5 <= b["w"] <= 22 and b["L"] >= max(28, 2.6 * b["w"]) and b["fill"] >= 0.7) or \
                    (b["A"] >= 900 and 9 <= b["thick"] <= 17.5 and b["fill"] < 0.7 and b["L"] >= 40)
        b["tower"] = (15 <= b["w"] <= 30 and b["L"] <= 35 and b["L"] / b["w"] <= 1.6
                      and 220 <= b["A"] <= 900 and b["fill"] >= 0.6)
        b["east"] = b["c"][0] + ox > EAST_X
    # соседи: мелкие дома вокруг (частный сектор), боксы-гаражи рядом, панельки
    cell = {}
    for i, b in enumerate(raw_b):
        cell.setdefault((int(b["c"][0] // 50), int(b["c"][1] // 50)), []).append(i)

    def around(b, r):
        cx, cz = b["c"]
        for i0 in range(int((cx - r) // 50), int((cx + r) // 50) + 1):
            for j0 in range(int((cz - r) // 50), int((cz + r) // 50) + 1):
                for i in cell.get((i0, j0), ()):
                    q = raw_b[i]
                    if q is not b and math.hypot(q["c"][0] - cx, q["c"][1] - cz) <= r:
                        yield q
    tagged = [b for b in raw_b if b["lv"] and b["tags"].get("building") not in PRIV_B + GAR_B]
    multi = [b for b in tagged if b["lv"] >= 4 and (b["slab"] or b["tower"])]

    def nb_levels(b):
        """Этажность соседей с тегом: серия в микрорайоне одна. У полосы и
           точки — до трёх ближайших размеченных многоэтажек в 220 м, похожих
           по ширине (±2.5 м), берём частое (при равенстве — ближайшего). У
           малоэтажного — ближайший размеченный дом той же площади в 120 м."""
        cx, cz = b["c"]
        if not (b["slab"] or b["tower"]):
            best = None
            for q in tagged:
                d = math.hypot(q["c"][0] - cx, q["c"][1] - cz)
                if q is not b and d < 120 and abs(q["A"] - b["A"]) < 0.25 * b["A"] and (not best or d < best[0]):
                    best = (d, q["lv"])
            return best[1] if best else 0
        cand = sorted((math.hypot(q["c"][0] - cx, q["c"][1] - cz), q["lv"]) for q in multi
                      if q is not b and q["tower"] == b["tower"] and abs(q["w"] - b["w"]) <= 2.5)
        cand = [c for c in cand if c[0] < 220][:3]
        if not cand:
            return 0
        cnt = {}
        for _, v in cand:
            cnt[v] = cnt.get(v, 0) + 1
        top = max(cnt.values())
        return next(v for _, v in cand if cnt[v] == top)
    # Гаражные кооперативы в Северске почти не размечены (landuse=garages —
    # два), а сами ряды нарисованы как building=yes: полосы 10—20 м (два
    # ряда боксов спина к спине) по 50—300 м. От панелек их отличают две
    # вещи: у ряда нет адреса, и ряды стоят пачкой параллельно через проезд
    # 8—15 м (центры ближе 32 м), а панельки — через двор в 30+ м.
    def ang_d(a, b_):
        d = abs(a - b_) % math.pi
        return min(d, math.pi - d)
    for b in raw_b:
        b["garrow"] = False
        tg = b["tags"]
        if tg.get("addr:housenumber") or tg.get("name") or tg.get("building") not in ("yes", "garages", "garage") \
                or not (4 <= b["w"] <= 22 and b["L"] >= 2.2 * b["w"]):
            continue
        ux, uz = math.cos(b["ang"]), math.sin(b["ang"])
        par = 0
        for q in around(b, 200):
            if q["tags"].get("addr:housenumber") or not (4 <= q["w"] <= 22) or ang_d(q["ang"], b["ang"]) > 0.14:
                continue
            dx, dz = q["c"][0] - b["c"][0], q["c"][1] - b["c"][1]
            along, perp = abs(dx * ux + dz * uz), abs(-dx * uz + dz * ux)
            if perp <= 32 and along <= (b["L"] + q["L"]) / 2:
                par += 1
        b["garrow"] = par >= 2
        b["_cand"] = True
    # пачка растёт: полоса без адреса в 45 м от ряда и почти параллельная ему —
    # тоже ряд (крайние ряды кооператива, у которых сосед только с одной
    # стороны); одинокая узкая длинная полоса без адреса, у которой в 30 м
    # нет дома с адресом, — ряд вдоль дороги
    grow = True
    while grow:
        grow = False
        for b in raw_b:
            if b.get("_cand") and not b["garrow"] and any(
                    q["garrow"] and ang_d(q["ang"], b["ang"]) < 0.2 for q in around(b, 45)):
                b["garrow"] = grow = True
    for b in raw_b:
        if b.pop("_cand", False) and not b["garrow"] and b["w"] <= 14 and b["L"] >= 4 * b["w"] and \
                not any(q["tags"].get("addr:housenumber") for q in around(b, 30)):
            b["garrow"] = True
    # Дома с адресом в Северске размечены почти все, жилые — точно: полоса
    # или коробка без адреса, у которой и в 60 м нет ни одного дома с
    # адресом, — не жильё (гаражи, склады, базы за Калинина и у промзоны)
    for b in raw_b:
        b["lonely"] = not b["tags"].get("addr:housenumber") and \
            not any(q["tags"].get("addr:housenumber") for q in around(b, 60))
    for b in raw_b:
        nbs = list(around(b, 60))
        b["small_nb"] = sum(1 for q in nbs if q["A"] < 250 and q["w"] >= 3.5)
        b["slab_nb"] = sum(1 for q in nbs if q["slab"] and math.hypot(q["c"][0] - b["c"][0], q["c"][1] - b["c"][1]) < 45)
        b["box_nb"] = sum(1 for q in around(b, 14) if 10 <= q["A"] <= 60 and q["w"] <= 5.5)
        b["nb_lv"] = nb_levels(b)
    # Проверка угадайки на размеченных многоэтажках (без своего тега):
    # по одной форме и по форме с соседями. Считаем точное совпадение и
    # «тот же класс» (до 5 / 6—10 / выше).
    agree = {"форма": [0, 0, 0], "соседи": [0, 0, 0]}
    cls_ = lambda v: 0 if v <= 5 else 1 if v <= 10 else 2
    for b in multi:
        if b["old"]:
            continue
        keep = b["lv"], b["nb_lv"]
        for key, nbv in (("форма", 0), ("соседи", keep[1])):
            b["lv"], b["nb_lv"] = 0, nbv
            g = classify(b)["lv"]
            agree[key][0] += g == keep[0]
            agree[key][1] += cls_(g) == cls_(keep[0])
            agree[key][2] += 1
        b["lv"], b["nb_lv"] = keep

    overrides = {}
    if OVR.exists():
        overrides = {k: v for k, v in json.loads(OVR.read_text()).items() if not k.startswith("_")}
    buildings, malls, worship = [], [], []
    why_stat = {}
    for b in raw_b:
        tg = b["tags"]
        r = classify(b)
        why_stat[r["why"]] = why_stat.get(r["why"], 0) + 1
        out = {"p": ints(b["p"]), "lv": r["lv"], "k": r["k"], "st": r["st"], "col": r["col"], "roof": r["roof"]}
        if r["rc"]:
            out["rc"] = r["rc"]
        if b["h"]:
            out["h"] = round(b["h"], 1)
        if tg.get("name"):
            out["n"] = tg["name"]
        if tg.get("addr:street") and tg.get("addr:housenumber"):
            out["a"] = [tg["addr:street"], tg["addr:housenumber"]]
        out["id"] = b["id"]
        ov = overrides.get(str(b["id"]))
        if ov:
            if ov.get("drop"):
                continue
            for kk, vv in ov.items():
                if vv is None:
                    out.pop(kk, None)
                else:
                    out[kk] = vv
        if out["k"] == "mall":
            nm = out.get("n") or next((zt.get("name") for zk, zt, _ in b["zone_ids"] if zk == "mall" and zt.get("name")), "")
            if not nm:
                nm = next((t.get("name") for x, z, t in shop_pts if t.get("shop") == "mall" and in_poly(x, z, b["p"])), "")
            sty = next((s for rx, s in MALL_STYLE if re.search(r"(^|[^а-яё])" + rx + r"($|[^а-яё])", nm.lower())), None)
            malls.append({"n": nm, "id": b["id"], "p": out["p"], "lv": out["lv"],
                          "style": sty or {"facade": out["col"], "glass": True, "stripe": "#c8423b"}})
            if nm and "n" not in out:
                out["n"] = nm
            if sty:
                out["col"] = sty["facade"]
        if out["k"] == "church":
            worship.append({"n": tg.get("name", ""), "rel": tg.get("religion", "christian"), "id": b["id"],
                            "p": [round(b["c"][0], 1), round(b["c"][1], 1)]})
        buildings.append(out)
    by_id = {b["id"]: b for b in buildings}

    bcell = {}
    for bi, b in enumerate(buildings):
        xs_ = [q[0] for q in b["p"]]
        zs_ = [q[1] for q in b["p"]]
        b["_bb"] = (min(xs_), min(zs_), max(xs_), max(zs_))
        for i in range(int(min(xs_) // 40), int(max(xs_) // 40) + 1):
            for j in range(int(min(zs_) // 40), int(max(zs_) // 40) + 1):
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
        if tg.get("tunnel") not in (None, "no") or tg.get("covered") == "yes" or tg.get("area") == "yes":
            continue
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
        if not g or len(g) < 2 or not any_near(g):
            continue
        g = simplify_keeping_junctions(g, el.get("nodes", []), 1.2)
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
        for piece in clip_line(g):
            if len(piece) < 2 or sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(piece, piece[1:])) < 3:
                continue
            road = {"c": cls, "n": tg.get("name", ""), "l": lanes, "o": oneway, "w": round(w, 1), "p": ints(piece)}
            if tg.get("bridge") and tg.get("bridge") != "no":
                road["b"] = 1
            if tg.get("service"):
                road["s"] = tg["service"]
            roads.append(road)

    # полотно не залезает в дом — как в osm_moscow.py (только улицы и проезды)
    narrowed = 0
    for r in roads:
        if r.get("b") or r["c"] < 3:
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
                        continue
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

    # ── бульвары: газон с деревьями между полотном и тротуаром ──
    # Где в карте есть отдельный тротуар — берём, насколько он отнесён от
    # полотна. Где нет (таких в Северске почти все улицы) — на больших
    # улицах, если до домов и чужих дорог с обеих сторон хватает места,
    # тротуар отводим за полосу деревьев: так в Северске и строили.
    sw_idx = SegIndex()
    for el in load("sidewalks"):
        g = geom(el)
        if g and len(g) >= 2:
            for a, b in zip(g, g[1:]):
                sw_idx.add(a, b, 1)
    rd_idx = SegIndex()
    for ri, r in enumerate(roads):
        for a, b in zip(r["p"], r["p"][1:]):
            rd_idx.add(a, b, ri)
    boul_osm = boul_free = 0
    for ri, r in enumerate(roads):
        if r.get("b") or r["c"] > 5 or r.get("s"):
            continue
        w = r["w"]
        L_all = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(r["p"], r["p"][1:]))
        if L_all < 40:
            continue
        ds, free, n = [], 0, 0
        for (x1, z1), (x2, z2) in zip(r["p"], r["p"][1:]):
            L = math.hypot(x2 - x1, z2 - z1)
            if L < 1:
                continue
            ux, uz = (x2 - x1) / L, (z2 - z1) / L
            sx, sz = -uz, ux
            k = 6.0
            while k < L - 6:
                cx, cz = x1 + ux * k, z1 + uz * k
                n += 1
                for sd in (1, -1):
                    for a, b, _ in sw_idx.near(cx, cz, w / 2 + 16):
                        bl = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
                        if abs(((b[0] - a[0]) * ux + (b[1] - a[1]) * uz) / bl) < 0.94:
                            continue
                        d, _t = seg_dist(cx, cz, a[0], a[1], b[0], b[1])
                        side = (a[0] + (b[0] - a[0]) * _t - cx) * sx + (a[1] + (b[1] - a[1]) * _t - cz) * sz
                        if d < w / 2 + 16 and side * sd > 0:
                            ds.append(d)
                ok = True
                for sd in (1, -1):
                    for o in (w / 2 + 3, w / 2 + 6, w / 2 + 9, w / 2 + 11):
                        px, pz = cx + sx * o * sd, cz + sz * o * sd
                        if house_at(px, pz, 1.0) >= 0:
                            ok = False
                            break
                        other = rd_idx.nearest(px, pz, 12, lambda it: it != ri)
                        if other and other[0] < roads[other[4]]["w"] / 2 + 1.5:
                            ok = False
                            break
                    if not ok:
                        break
                free += ok
                k += 10.0
        if not n:
            continue
        gs = 0.0
        if len(ds) >= max(2, n // 3):
            ds.sort()
            gap = ds[len(ds) // 2] - w / 2 - 1.5
            if gap >= 2.5:
                gs = min(gap, 9.0)
                boul_osm += 1
        if not gs and r["c"] <= 3 and free >= 0.8 * n and rnd(str(r["p"][0]), "boul") < 0.8:
            gs = 3.5
            boul_free += 1
        if gs:
            r["g"] = round(gs, 1)
    print(f"бульвары: по тротуарам карты {boul_osm}, по свободному месту {boul_free}")

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

    # ── связность ── всё, что не связано с пиццерией, рисуем, но не ездим
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

    hx, hz = prj(*PROJ_CENTER)
    stitched = 0
    for _ in range(6):
        comps = graph()
        main = max(comps, key=lambda c: (min(math.hypot(q[0] - hx, q[1] - hz) for q in c) < 80, len(c)))
        cell_m = {}
        for q in main:
            cell_m.setdefault((q[0] // 30, q[1] // 30), []).append(q)
        added = False
        for comp in comps:
            if comp is main or len(comp) < 2:
                continue
            best = None
            for q in comp:
                if not inside(q[0], q[1]):
                    continue
                ci_, cj_ = q[0] // 30, q[1] // 30
                for i in (ci_ - 1, ci_, ci_ + 1):
                    for j in (cj_ - 1, cj_, cj_ + 1):
                        for m in cell_m.get((i, j), ()):
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

    comps = graph()
    home_q = min((q for c in comps for q in c), key=lambda q: (q[0] - hx) ** 2 + (q[1] - hz) ** 2)
    main = next(set(c) for c in comps if home_q in c)
    for r in roads:
        if r["c"] != 6 and not any((q[0], q[1]) in main for q in r["p"]):
            r["x"] = 1
    linked = len(main) / sum(len(c) for c in comps)

    rsi = SegIndex(40)
    for ri, r in enumerate(roads):
        for a, b in zip(r["p"], r["p"][1:]):
            rsi.add(a, b, ri)
    drive = lambda ri: roads[ri]["c"] != 6 and not roads[ri].get("x")

    # ── КПП ── Точка КПП в карте стоит на будке, а не на дороге: садим на
    # ближайшую проезжую улицу, направление — вдоль неё. КПП без дороги
    # в 80 м (пешеходные) не берём. Далеко от забора — внутренний (inner).
    kpp, cand = [], []
    for el in load("kpp"):
        tg = el.get("tags", {})
        c = el.get("center") or (el if "lat" in el else None)
        if not c or tg.get("public_transport") or tg.get("highway"):
            continue                                   # остановка «КПП Центральный» — не КПП
        x, z = prj(c["lat"], c["lon"])
        nm = tg.get("name", "")
        # будка с тегом checkpoint важнее ворот с именем «КПП»
        pri = 0 if tg.get("military") == "checkpoint" or tg.get("barrier") == "checkpoint" else \
            1 if tg.get("man_made") == "checkpoint" else 2 if tg.get("barrier") in ("gate", "lift_gate") and "КПП" in nm else None
        if pri is None or not near(x, z):
            continue
        key = " ".join(sorted(w_ for w_ in nm.lower().replace("кпп", " ").split())) or str(el["id"])
        cand.append((pri, key, x, z, nm, el["id"]))
    for pri, key, x, z, nm, oid in sorted(cand):
        if any(q["_key"] == key and math.hypot(q["_xz"][0] - x, q["_xz"][1] - z) < 250 for q in kpp):
            continue                                   # тот же КПП: будка, ворота, въезд и выезд
        best = rsi.nearest(x, z, 80, drive)
        if not best:
            continue                                   # пешеходный — без дороги
        d, tt, a, b, ri = best
        px, pz = a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt
        L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
        item = {"n": nm, "p": [round(px, 1), round(pz, 1)], "ux": round((b[0] - a[0]) / L, 3),
                "uz": round((b[1] - a[1]) / L, 3), "id": oid, "_key": key, "_xz": (x, z)}
        if border_dist(px, pz) > KPP_R:
            item["inner"] = 1
        kpp.append(item)
    for q in kpp:
        del q["_key"], q["_xz"]

    # ── закрытые въезды ── Проезжая улица пересекает забор, а КПП рядом
    # нет — ставим «дорога закрыта». Срез на севере — тоже забор.
    closed = []
    for r in roads:
        if r["c"] == 6 or r.get("x"):
            continue
        p = r["p"]
        ins = [inside(q[0], q[1]) for q in p]
        if all(ins) or not any(ins):
            continue
        for a, b in zip(p, p[1:]):
            for e0, e1 in b_edges:
                if max(a[0], b[0]) < min(e0[0], e1[0]) or min(a[0], b[0]) > max(e0[0], e1[0]) or \
                        max(a[1], b[1]) < min(e0[1], e1[1]) or min(a[1], b[1]) > max(e0[1], e1[1]):
                    continue
                q = seg_cross(a, b, e0, e1)
                if not q:
                    continue
                if any(math.hypot(k_["p"][0] - q[0], k_["p"][1] - q[1]) < KPP_R for k_ in kpp):
                    continue
                if any(math.hypot(c_[0] - q[0], c_[1] - q[1]) < 3 for c_ in closed):
                    continue
                L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
                closed.append([round(q[0], 1), round(q[1], 1), round((b[0] - a[0]) / L, 3),
                               round((b[1] - a[1]) / L, 3), r["w"]])

    # ── железная дорога ──
    rails, platforms, levelx, stations = [], [], [], []
    rail_len = 0.0
    for el in load("rails"):
        tg = el.get("tags", {})
        g = geom(el)
        if not g or len(g) < 2 or not any_near(g):
            continue
        if tg.get("railway") == "platform" or tg.get("public_transport") == "platform":
            if g[0] == g[-1] and len(g) >= 4:
                g = simplify_ring(clip_rect(g[:-1], rx0, rz0, rx1, rz1), 1.0)
            else:
                g = simplify(g, 1.0)
            if len(g) >= 2:
                platforms.append(ints(g))
            continue
        rw, sv = tg.get("railway"), tg.get("service")
        k = "tram" if rw in ("tram", "light_rail") else "siding" if sv in ("siding", "yard", "crossover") \
            else "spur" if sv == "spur" else "rail"
        if tg.get("tunnel") not in (None, "no"):
            continue
        for piece in clip_line(g):
            piece = simplify(piece, 1.5)
            it = {"k": k, "p": ints(piece)}
            if tg.get("bridge") and tg.get("bridge") != "no":
                it["b"] = 1
            if tg.get("name"):
                it["n"] = tg["name"]
            rails.append(it)
            rail_len += sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(piece, piece[1:]))

    # ── зелёнка ──
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
        if tg.get("natural") == "tree_row":
            g = geom(el)
            if not g or not any_near(g):
                continue
            for (x1, z1), (x2, z2) in zip(g, g[1:]):
                L = math.hypot(x2 - x1, z2 - z1)
                for k in range(int(L // 7) + 1):
                    tt = min(1.0, (k * 7 + 3) / (L or 1))
                    trees.append((x1 + (x2 - x1) * tt, z1 + (z2 - z1) * tt))
            continue
        k = green_kind(tg)
        if not k:
            continue
        for g in polys(el):
            if len(g) < 3 or not any_near(g) or ring_area(g) < 60:
                continue
            g = simplify_ring(clip_rect(g, rx0, rz0, rx1, rz1), 1.5 if ring_area(g) < 20000 else 3.0)
            if len(g) < 3 or ring_area(g) < 60:
                continue
            item = {"k": k, "p": ints(g)}
            if tg.get("name"):
                item["n"] = tg["name"]
            green.append(item)
    green.extend(water_decals)

    # ── дорожки ──
    paths = []
    for el in load("paths"):
        g = geom(el)
        if not g or len(g) < 2 or not any_near(g):
            continue
        for piece in clip_line(g):
            piece = simplify(piece, 1.5)
            if sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(piece, piece[1:])) >= 8:
                paths.append(ints(piece))

    # ── точки ──
    stops, signals, crossings, entrances, benches, pois = [], [], [], [], [], []
    POI_KIND = {"fast_food": "food", "cafe": "cafe", "restaurant": "food", "bar": "food", "pub": "food",
                "pharmacy": "pharm", "bank": "bank", "fuel": "fuel"}
    for el in pts_all:
        tg = el.get("tags", {})
        if el["type"] != "node":
            continue
        x, z = prj(el["lat"], el["lon"])
        if not near(x, z):
            continue
        p = [round(x, 1), round(z, 1)]
        hw, rw = tg.get("highway"), tg.get("railway")
        if rw in ("level_crossing", "crossing"):
            if rw == "level_crossing":
                levelx.append(p)
        elif rw in ("station", "halt"):
            stations.append({"n": tg.get("name", ""), "p": p})
        elif hw == "bus_stop" or tg.get("public_transport") == "platform":
            if tg.get("bus") == "yes" or tg.get("trolleybus") == "yes" or hw == "bus_stop":
                stops.append({"n": tg.get("name", ""), "p": p})
        elif hw == "traffic_signals":
            signals.append(p)
        elif hw == "crossing":
            crossings.append(p + [1 if tg.get("crossing") == "traffic_signals" else 0])
        elif tg.get("entrance"):
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
            entrances.append([round(ax + (bx - ax) * tt, 1), round(az + (bz - az) * tt, 1), round(nxv, 3), round(nzv, 3)])
        elif tg.get("natural") == "tree":
            trees.append((x, z))
        elif tg.get("amenity") == "bench":
            benches.append(p)
        elif tg.get("amenity") == "place_of_worship":
            if not any(math.hypot(wq["p"][0] - x, wq["p"][1] - z) < 40 for wq in worship):
                worship.append({"n": tg.get("name", ""), "rel": tg.get("religion", "christian"), "id": el["id"], "p": p})
        else:
            am, sh = tg.get("amenity", ""), tg.get("shop", "")
            k = POI_KIND.get(am) or ("shop" if sh else None)
            if not k or not tg.get("name"):
                continue
            if am == "cafe" or sh in ("coffee",):
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
                                continue
                            rn = rsi.nearest(mx, mz, 80, lambda ri: roads[ri]["c"] <= 5 and not roads[ri].get("x"))
                            score = d + (rn[0] if rn else 80) * 0.6
                            if not best or score < best[0]:
                                best = (score, mx, mz, nxv, nzv, L)
            if best:
                _, mx, mz, nxv, nzv, L = best
                poi["w"] = [round(mx, 1), round(mz, 1), round(nxv, 3), round(nzv, 3), round(L, 1)]
            pois.append(poi)

    # переезды: из карты + где рельсы пересекают проезжую улицу, а точки нет
    for rl in rails:
        if rl["k"] == "tram":
            continue
        for a, b in zip(rl["p"], rl["p"][1:]):
            for c_, d_, ri in rsi.near((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, math.hypot(b[0] - a[0], b[1] - a[1]) / 2 + 5):
                if roads[ri]["c"] == 6 or roads[ri].get("b") or rl.get("b"):
                    continue
                q = seg_cross(a, b, c_, d_)
                if q and not any(math.hypot(v[0] - q[0], v[1] - q[1]) < 15 for v in levelx):
                    levelx.append([round(q[0], 1), round(q[1], 1)])

    # ── въезды в дома ── как в osm_moscow.py
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
                continue
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
                                nxv, nzv = -nxv, -nzv
                            if -(nxv * ux + nzv * uz) < 0.6:
                                continue
                            if not best or d < best[0]:
                                best = (d, ax + (bx - ax) * tt, az + (bz - az) * tt, nxv, nzv)
            if best:
                _, gx, gz, nxv, nzv = best
                gates.append([round(gx, 1), round(gz, 1), round(nxv, 3), round(nzv, 3), r["w"]])

    tcell2, tree_out = {}, []
    for x, z in trees:
        if not near(x, z) or is_wet(x, z) or house_at(x, z, 1.2) >= 0:
            continue
        key = (int(x // 4), int(z // 4))
        if any(math.hypot(x - a, z - b) < 2.2 for i in (-1, 0, 1) for j in (-1, 0, 1)
               for a, b in tcell2.get((key[0] + i, key[1] + j), ())):
            continue
        tcell2.setdefault(key, []).append((x, z))
        tree_out.append([round(x, 1), round(z, 1)])

    # дом пиццерии: в чьём контуре точка, иначе ближайший
    home_b = house_at(hx, hz)
    if home_b < 0:
        home_b = min(range(len(buildings)), key=lambda i: min(math.hypot(q[0] - hx, q[1] - hz) for q in buildings[i]["p"]))
    for b in buildings:
        del b["_bb"]

    wet_in = [is_wet(x, z) for x, z in ((float(a), float(b_)) for a in range(-W // 2, W // 2, 64) for b_ in range(-D // 2, D // 2, 64))
              if inside(x, z)]
    # Томь за забором, но её видно: вода в сетке рельефа — значит, есть
    river = "Томь" if wet.mean() > 0.005 else None
    hv = np.clip(np.round(H * 10) + 1000, 0, 65535).astype("<u2")
    city = {
        "meta": {
            "city": "Северск",
            "src": "OpenStreetMap, ODbL; рельеф — SRTM через Terrarium",
            "center": list(PROJ_CENTER),
            "home": [round(hx, 1), round(hz, 1)],
            "origin": [round(hx, 1), round(hz, 1)],
            "homeId": buildings[home_b]["id"],
            "size": [W, D],
            "border": [-W // 2, -D // 2, W // 2, D // 2],
            "clip": ints(clip_seg),
            "river": river,
        },
        "terrain": {
            "g": GRID, "nx": nx, "nz": nz, "x0": gx0, "z0": gz0,
            "wl": round(wl, 1),
            "h": base64.b64encode(hv.tobytes()).decode("ascii"),
        },
        "border": ints(border), "fence": fence, "kpp": kpp, "closed": closed,
        "roads": roads, "buildings": buildings, "malls": malls, "worship": worship, "garlots": garlots,
        "green": green, "lots": lots, "paths": paths,
        "rails": rails, "levelx": levelx, "stations": stations, "platforms": platforms, "streams": streams,
        "stops": stops, "signals": signals, "crossings": crossings,
        "entrances": entrances, "trees": tree_out, "benches": benches, "pois": pois,
        "metro": [], "gates": gates,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(city, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text(
        "/* Северск (ЗАТО) целиком, по периметру забора, из OpenStreetMap (ODbL) и рельеф SRTM.\n"
        "   Собран scripts/osm_seversk.py — руками не правим, перегенерируем (правки домов —\n"
        "   src/maps/seversk/overrides.json). Координаты в метрах: x на восток, z на юг,\n"
        "   начало — центр рамки границы, пиццерия — meta.home; высота — над урезом Томи. */\n"
        "export default " + body + ";\n"
    )

    # ── сводка ──
    land = H[~wet]
    area = ring_area(border) / 1e6
    in_b = [b for b in buildings if inside(*centroid(b["p"]))]
    print(f"область      {W} × {D} м, граница {area:.1f} км² ({len(border)} точек), пиццерия в {city['meta']['home']}, "
          f"внутри: {inside(hx, hz)}, дом {buildings[home_b]['id']} {buildings[home_b].get('a', '')}")
    # «город» — все дома внутри полного кольца забора и южнее среза + 1.5 км
    full = [(x - ox, z - oz) for x, z in fence_ring()]
    city_b = [b for b in raw_b if in_poly(b["c"][0], b["c"][1], full) and b["c"][1] > CLIP_Z - oz - 1500]
    kept = sum(1 for b in city_b if inside(*b["c"]))
    print(f"город        домов внутри полного забора (до −1.5 км за срезом) {len(city_b)}, из них в границе "
          f"{kept} = {kept / max(1, len(city_b)):.1%}; всего в выгрузке {len(buildings)}, внутри границы {len(in_b)}")
    print(f"рельеф       {nx} × {nz} узлов по {GRID} м, урез {wl:.1f} м, суша до {land.max():.0f} м над водой, "
          f"вода {wet.mean():.1%} сетки, внутри границы {sum(wet_in) / max(1, len(wet_in)):.1%}; река: {river}; "
          f"старицы в рельеф {low_lakes}, крапин воды убрано {specks}, озёр пятном {len(water_decals)}, ручьёв {len(streams)}")
    print(f"дороги       {len(roads)} (мостов {sum(1 for r in roads if r.get('b'))}, односторонних {sum(1 for r in roads if r['o'])}, "
          f"сужено {narrowed}, сквозь дом убрано {dropped}, пришито {stitched}, только нарисовать "
          f"{sum(1 for r in roads if r.get('x'))}, в сети {linked:.0%} узлов)")
    print(f"КПП          {len(kpp)}: " + "; ".join(f"{q['n'] or '?'}{' (внутр.)' if q.get('inner') else ''}" for q in kpp))
    print(f"закрыто      {len(closed)} въездов через забор без КПП")
    print(f"ж/д          {len(rails)} кусков, {rail_len / 1000:.1f} км (" + ", ".join(
        f"{k} {sum(1 for r in rails if r['k'] == k)}" for k in ("rail", "siding", "spur", "tram")) +
        f"), переездов {len(levelx)}, станций {len(stations)}, платформ {len(platforms)}")
    kinds, styles, lvs = {}, {}, {}
    for b in buildings:
        kinds[b["k"]] = kinds.get(b["k"], 0) + 1
        styles[b["st"]] = styles.get(b["st"], 0) + 1
        lvs[b["lv"]] = lvs.get(b["lv"], 0) + 1
    print(f"дома         {len(buildings)} (с адресом {sum(1 for b in buildings if 'a' in b)}, "
          f"этажность из тега {sum(1 for b in raw_b if b['lv'])}, правок {len(overrides)})")
    print("  вид       " + ", ".join(f"{k} {v}" for k, v in sorted(kinds.items(), key=lambda kv: -kv[1])))
    print("  стиль     " + ", ".join(f"{k} {v}" for k, v in sorted(styles.items(), key=lambda kv: -kv[1])))
    print("  этажи     " + ", ".join(f"{k}:{v}" for k, v in sorted(lvs.items())))
    print("  почему    " + ", ".join(f"{k} {v}" for k, v in sorted(why_stat.items(), key=lambda kv: -kv[1])))
    print("  проверка  этажность многоэтажек без тега: " + "; ".join(
        f"{k} — точно {v[0]}/{v[2]}, класс {v[1]}/{v[2]}" for k, v in agree.items()))
    print(f"ТЦ           {len(malls)}: " + ", ".join(m["n"] or str(m["id"]) for m in malls))
    print(f"храмы        {len(worship)}: " + ", ".join(w_["n"] or "?" for w_ in worship))
    print(f"гаражи       кооперативов {len(garlots)}, боксов/рядов {kinds.get('gar', 0)}")
    print(f"зелёнка      {len(green)}, площадки {len(lots)}, дорожки {len(paths)}")
    print(f"светофоры    {len(signals)}, переходы {len(crossings)}, подъезды {len(entrances)}")
    print(f"заведения    {len(pois)} (с вывеской на стене {sum(1 for q in pois if 'w' in q)}), въездов {len(gates)}")
    print(f"деревья      {len(tree_out)}, лавочки {len(benches)}, остановки {len(stops)}")
    sizes = {k: len(json.dumps(v, ensure_ascii=False, separators=(",", ":")).encode()) for k, v in city.items()}
    print("размер       " + ", ".join(f"{k} {v // 1024}К" for k, v in sorted(sizes.items(), key=lambda kv: -kv[1])[:9]))
    print(f"файл         {OUT.stat().st_size // 1024} КБ")


# ─────────────── картинка для проверки ───────────────

def png(path, mpp=4.0, crop=None):
    """Карта сверху: дома цветом стиля, дороги, рельсы, вода, граница, КПП.
       crop = (x0, z0, x1, z1) — кусок в метрах игры (не от пиццерии!)."""
    txt = OUT.read_text()
    city = json.loads(txt[txt.index("export default ") + 15:].rstrip().rstrip(";"))
    W, D = city["meta"]["size"]
    x0, z0, x1, z1 = crop or (-W / 2 - PAD, -D / 2 - PAD, W / 2 + PAD, D / 2 + PAD)
    im = Image.new("RGB", (int((x1 - x0) / mpp), int((z1 - z0) / mpp)), "#e9e6dc")
    d = ImageDraw.Draw(im)
    try:
        from PIL import ImageFont
        font = ImageFont.truetype("/Library/Fonts/Arial Unicode.ttf", 15)
    except OSError:
        font = None
    T = lambda q: ((q[0] - x0) / mpp, (q[1] - z0) / mpp)
    ter = city["terrain"]
    hb = base64.b64decode(ter["h"])
    Hh = (np.frombuffer(hb, dtype="<u2").astype(np.float32).reshape(ter["nz"], ter["nx"]) - 1000) / 10
    # рельеф — отмывкой: чем выше, тем светлее, вода синим
    hmax = max(1.0, float(np.percentile(Hh, 99)))
    sh = np.clip(Hh / hmax, 0, 1)
    rgb = np.stack([200 + 40 * sh, 205 + 35 * sh, 180 + 40 * sh], -1)
    rgb[Hh < 0] = (111, 176, 201)
    timg = Image.fromarray(rgb.astype(np.uint8)).resize(
        (int(ter["nx"] * ter["g"] / mpp), int(ter["nz"] * ter["g"] / mpp)), Image.BILINEAR)
    im.paste(timg, (int((ter["x0"] - x0) / mpp), int((ter["z0"] - z0) / mpp)))
    GC = {"park": "#9ed07f", "green": "#b3d69a", "pitch": "#8dcd93", "play": "#d3bd88", "cem": "#aacd93", "water": "#6fb0c9"}
    for g in city["green"]:
        if len(g["p"]) >= 3:
            d.polygon([T(q) for q in g["p"]], fill=GC.get(g["k"], "#b3d69a"))
    for l in city["lots"]:
        d.polygon([T(q) for q in l["p"]], fill={"park": "#b8bcc2", "gar": "#c9b9a0", "ind": "#d3cdbf"}.get(l["k"], "#d8d2c8"))
    for s in city.get("streams", []):
        d.line([T(q) for q in s["p"]], fill="#5a9fc0", width=max(1, int(s["w"] / mpp)))
    for q in city["paths"]:
        d.line([T(v) for v in q], fill="#d8cdb8", width=1)
    for r in city["roads"]:
        col = "#c9b9b0" if r.get("x") else ("#8a8f99" if r["c"] <= 3 else "#a7adb6" if r["c"] <= 5 else "#c2c6cc")
        d.line([T(v) for v in r["p"]], fill=col, width=max(1, int(r["w"] / mpp)))
    for r in city["rails"]:
        d.line([T(v) for v in r["p"]], fill={"rail": "#5b4636", "siding": "#8a6a52", "spur": "#8a6a52", "tram": "#b03a2e"}[r["k"]],
               width=max(1, int(3 / mpp)) + (1 if r["k"] == "rail" else 0))
    SC = {"stalin": "#e8b84a", "panel": "#7f8fa6", "brick": "#c98f73", "priv": "#6e9e4f", "gar": "#555555",
          "ind": "#9a8f80", "pub": "#d9534f", "shop": "#e377c2", "mall": "#9b30d9", "modern": "#39a0b5", "church": "#ffffff"}
    for b in city["buildings"]:
        c = SC.get(b["st"], "#333333")
        if b["st"] == "panel" and b["lv"] >= 9:
            c = "#3c5a86"
        d.polygon([T(q) for q in b["p"]], fill=c, outline="#222222" if mpp < 2 else None)
    for f in city["fence"]:
        d.line([T(v) for v in f], fill="#d62728", width=3)
    for c in city["closed"]:
        a, b_ = T(c), T((c[0], c[1]))
        d.rectangle([a[0] - 4, a[1] - 4, a[0] + 4, a[1] + 4], fill="#000000")
    for k in city["kpp"]:
        a = T(k["p"])
        d.ellipse([a[0] - 7, a[1] - 7, a[0] + 7, a[1] + 7], fill="#ffd700" if not k.get("inner") else "#ff9900", outline="#000")
        d.text((a[0] + 9, a[1] - 6), k["n"], fill="#000", font=font)
    for v in city["levelx"]:
        a = T(v)
        d.rectangle([a[0] - 2, a[1] - 2, a[0] + 2, a[1] + 2], fill="#ff00ff")
    h = T(city["meta"]["home"])
    d.ellipse([h[0] - 9, h[1] - 9, h[0] + 9, h[1] + 9], outline="#ff6a00", width=4)
    d.text((10, 10), "Seversk: stalin=yellow, panel5=grey-blue, panel9+=dark blue, brick=terracotta, priv=green, gar=dark grey, "
           "ind=taupe, pub=red, shop=pink, mall=purple; KPP=gold, closed=black squares, rails=brown", fill="#000", font=font)
    im.save(path)
    print("картинка", path, im.size)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    if cmd == "fetch":
        fetch()
    elif cmd == "build":
        build()
    elif cmd == "png":
        dst = sys.argv[2] if len(sys.argv) > 2 else "/tmp/seversk.png"
        mpp = float(sys.argv[3]) if len(sys.argv) > 3 else 4.0
        crop = tuple(float(v) for v in sys.argv[4].split(",")) if len(sys.argv) > 4 else None
        png(dst, mpp, crop)
    else:
        raise SystemExit("команды: fetch | build | png ПУТЬ [м/пиксель] [x0,z0,x1,z1]")
