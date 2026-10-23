"""Зимние деревья — голые ветки со снегом сверху, в Blender без окна:
  blender -b --factory-startup -P wintertrees.py -- ../../src/game/wintertrees.data.js [папка-для-картинок]
Модели: берёза (две), тополь, клён, липа, рябина, дерево аллеи. Ветвятся в 3 уровня (сук → ветка → прут), концы прутьев
лежат на поверхности кроны-«яйца» — силуэт округлый, как летняя крона (trees.js: комки кроны там же). Каждая ветка
сужается в точку. Сечение: ствол — квадрат; сук и ветка — ромб (две верхние грани — снег: сбоку белая верхняя половина,
снизу — кора); прут — треугольник вершиной вверх. Снег — флаг грани, которая смотрит вверх (нормаль выше 0,3).
Части: 0 — ствол, 1 — сук (видны всегда, летом — внутри кроны), 2 — ветка, 3 — прут (видны, когда облетела листва).
В файл — вершины (см) и треугольники группами (часть, снег) с общими вершинами (Blender: сварка совпавших); игра
раскладывает их в склейку деревьев (seasons.js PILE). Размеры — в метрах при s = 1, H = 1 (trees.js growTree: ширина × s,
высота × s × H). LITE — без прутьев (мобильный режим, память телефона): у каждой модели в файле ещё число треугольников
без части 3. Картинки — каждая модель сбоку и снизу-сбоку (как с дороги), для проверки глазами."""
import bpy, bmesh, sys, math, random, os
from mathutils import Vector

a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = a[0] if a else os.path.join(os.path.dirname(__file__), '../../src/game/wintertrees.data.js')
PNG = a[1] if len(a) > 1 else None
UP = Vector((0, 0, 1))


class Tree:
    def __init__(s, env, rng):
        s.c, s.r = Vector(env[0]), Vector(env[1])   # крона-«яйцо»: центр и полуоси (x, y, z), z — вверх
        s.rng = rng
        s.chains = []                              # (точки, радиусы, часть, сечение)

    def hit(s, p, d, k=1.0):
        """сколько идти от p по d до «яйца» × k, м"""
        P = Vector(((p.x - s.c.x) / s.r.x, (p.y - s.c.y) / s.r.y, (p.z - s.c.z) / s.r.z))
        D = Vector((d.x / s.r.x, d.y / s.r.y, d.z / s.r.z))
        A, B, C = D.dot(D), 2 * P.dot(D), P.dot(P) - k * k
        q = B * B - 4 * A * C
        if q < 0: return 0.0
        return max(0.0, (-B + math.sqrt(q)) / (2 * A))

    def chain(s, pts, r0, part, sec=None, taper=0.5):
        """ветка: ломаная pts, радиус у основания r0, сужается в точку"""
        n = len(pts)
        rads = [r0 * (1 - taper * i / max(1, n - 1)) for i in range(n)]
        s.chains.append((pts, rads, part, sec or ('sq' if part == 0 else 'dia' if part < 3 else 'tri')))
        return pts

    def along(s, pts, t):
        """точка на ломаной и направление там: t от 0 до 1 по длине"""
        L = [(pts[i + 1] - pts[i]).length for i in range(len(pts) - 1)]
        x = t * sum(L)
        for i, l in enumerate(L):
            if x <= l or i == len(L) - 1:
                return pts[i].lerp(pts[i + 1], min(1, x / max(l, 1e-6))), (pts[i + 1] - pts[i]).normalized()
            x -= l

    def jit(s, d, k):
        g = s.rng.gauss
        return (d + Vector((g(0, k), g(0, k), g(0, k)))).normalized()

    def limb(s, p, d, k, r0, part, bend=0.0, segs=2, cap=99.0, mn=0.4):
        """от p в сторону d до «яйца» × k; bend — дугой вверх к концу"""
        L = min(cap, max(mn, s.hit(p, d, k)))
        if segs == 1: return s.chain([p, p + d * L], r0, part)
        m = p + d * (L * 0.5)
        e = p + (d + UP * bend).normalized() * L
        return s.chain([p, m, e], r0, part)


def az(a, el):
    """направление: по кругу a, подъём el (радианы)"""
    return Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)))


def crown(T, limbs, n2, n3, r2, r3, k2=0.9, k3=1.0, out2=0.5, up3=0.15, droop=0.0, el2=(0.0, 0.4), t2=(0.35, 0.95), t3=(0.3, 0.95),
          tip3=1, cap3=1.8, spread=(0.5, 0.9)):
    """от каждого сука — ветки (часть 2) вразлёт, от веток — прутья (часть 3) до поверхности «яйца»; tip3 — ещё прутья с конца сука"""
    rng = T.rng
    for pts in limbs:
        brs = []
        for j in range(n2):
            t = t2[0] + (t2[1] - t2[0]) * (j + 0.3 + rng.random() * 0.4) / n2
            p, d = T.along(pts, t)
            side = d.cross(UP)
            if side.length < 1e-3: side = Vector((1, 0, 0))
            side.normalize()
            sg = 1 if (j + len(brs)) % 2 == 0 else -1
            out = Vector((p.x - T.c.x, p.y - T.c.y, 0))
            out = out.normalized() if out.length > 0.05 else d
            dd = (d + side * sg * rng.uniform(*spread) + UP * rng.uniform(*el2) + out * out2).normalized()
            brs.append(T.limb(p, dd, k2, r2, 2, segs=1, mn=0.6))
        for br, nn in [(b, n3) for b in brs] + [(pts, tip3)]:
            for j in range(nn):
                t = t3[0] + (t3[1] - t3[0]) * (j + 0.3 + rng.random() * 0.4) / max(1, nn)
                if br is pts: t = 0.97
                p, d = T.along(br, t)
                out = Vector((p.x - T.c.x, p.y - T.c.y, (p.z - T.c.z) * 0.7)).normalized()
                dd = T.jit(d * 0.6 + out * 0.9 + UP * up3 - UP * droop, 0.3)
                T.limb(p, dd, k3 * rng.uniform(0.97, 1.04), r3, 3, segs=1, cap=cap3, mn=0.45)


GA = 2.39996                                       # золотой угол: суки по кругу без повторов


# ─────────── крона по «целям»: концы прутьев — ровно по поверхности «яйца», суки и ветки — кучками целей ───────────
def tips(T, n, zmin=-0.35, k=(0.94, 1.04), xmin=-9.0):
    """n точек по поверхности «яйца» (спираль Фибоначчи), только выше zmin (доля полуоси вниз от центра)"""
    out, i, N = [], 0, int(n / ((1 - zmin) / 2)) + 1
    for i in range(N):
        z = 1 - 2 * (i + 0.5) / N
        if z < zmin: continue
        rr, a = math.sqrt(1 - z * z), i * GA
        f = T.rng.uniform(*k)
        p = Vector((T.c.x + math.cos(a) * rr * T.r.x * f, T.c.y + math.sin(a) * rr * T.r.y * f, T.c.z + z * T.r.z * f))
        if p.x >= xmin: out.append(p)
    return out


def kmeans(P, k, ref, it=12):
    """кучки точек по направлению от ref (свои, без случайности: старт — через равные шаги)"""
    k = max(1, min(k, len(P)))
    D = [(p - ref).normalized() for p in P]
    C = [D[int(i * len(P) / k)].copy() for i in range(k)]
    for _ in range(it):
        G = [[] for _ in C]
        for i, d in enumerate(D): G[max(range(len(C)), key=lambda j: d.dot(C[j]))].append(i)
        C = [(sum((D[i] for i in g), Vector()) / len(g)).normalized() if g else C[j] for j, g in enumerate(G)]
    return [[P[i] for i in g] for g in G if g]


def grow(T, stems, nL, nB, rL, rB, rT, fL=0.55, fB=0.8, base=lambda c: c.z * 0.5, zmin=-0.35, n=24, xmin=-9.0, sag=0.0, hang=0.0):
    """stems — ломаные стволов (к ним крепятся суки); каждой кучке целей — сук от ствола, подкучкам — ветки, целям — прутья"""
    P = tips(T, n, zmin, xmin=xmin)
    lo = [s for s in stems]
    ref = Vector((T.c.x, T.c.y, T.c.z - T.r.z * 0.6))
    for g in kmeans(P, nL, ref):
        cen = sum(g, Vector()) / len(g)
        st = min(lo, key=lambda s: ((s[0] + s[-1]) / 2 - cen).length)    # ближний ствол
        zb = base(cen)
        z0, z1 = st[0].z + 0.3 * (st[-1].z - st[0].z), st[-1].z - 0.2
        t = (min(max(zb, z0), z1) - st[0].z) / max(0.1, st[-1].z - st[0].z)
        p0, _ = T.along(st, t)
        e = p0.lerp(cen, fL)
        m = p0.lerp(e, 0.5) + UP * (e - p0).length * 0.08
        limb = T.chain([p0, m, e + (e - m).normalized() * 0.35], rL, 1, taper=0.6)
        for sg in kmeans(g, nB, e):
            sc = sum(sg, Vector()) / len(sg)
            q0, _ = T.along(limb, T.rng.uniform(0.72, 0.95))
            be = q0.lerp(sc, fB)
            br = T.chain([q0, be + (be - q0).normalized() * 0.25], rB, 2)
            for tp in sg:
                w0, _ = T.along(br, T.rng.uniform(0.7, 0.97))
                if hang:                                    # плакучая ива: прут дугой через «яйцо» и вниз, почти до земли
                    o = Vector((tp.x - T.c.x, tp.y - T.c.y, 0)).normalized()
                    L = hang * T.rng.uniform(0.75, 1.1) * (0.6 + 0.4 * max(0.0, (tp.z - T.c.z) / T.r.z + 0.5))
                    T.chain([w0, tp, tp + o * 0.35 - UP * L], rT, 3, taper=0.6)
                elif sag:                                   # берёза: прут свисает — середина ниже
                    T.chain([w0, w0.lerp(tp, 0.5) - UP * sag, tp], rT, 3)
                else:
                    T.chain([w0, tp], rT, 3)


GA = 2.39996                                       # золотой угол


# ─────────── породы (размеры — как у летней кроны trees.js) ───────────
def birch(seed):
    """берёза: белый ствол-ось до макушки, суки вверх, прутья свисают («плачет»), крона — высокое «яйцо»"""
    T = Tree(((0, 0, 5.7), (1.95, 1.95, 3.2)), random.Random(seed))
    lead = T.chain([Vector((0, 0, -0.2)), Vector((0.04, 0.02, 3.6)), Vector((T.rng.uniform(-0.2, 0.2), T.rng.uniform(-0.2, 0.2), 8.6))], 0.16, 0, taper=0.7)
    grow(T, [lead], 6, 2, 0.08, 0.05, 0.04, fL=0.5, fB=0.7, base=lambda c: c.z - 1.6, zmin=-0.6, n=24)
    return T


def maple(seed, lime=False):
    """клён — широкий круглый, суки вразлёт с развилки 3 м; липа — «яйцо» выше и уже"""
    T = Tree(((0, 0, 5.3), (2.6, 2.6, 2.5)) if lime else ((0, 0, 4.7), (3.0, 3.0, 2.1)), random.Random(seed))
    trunk = T.chain([Vector((0, 0, -0.2)), Vector((0.03, 0.0, 1.8)), Vector((0.0, 0.04, 4.6 if lime else 3.6))], 0.24, 0, taper=0.55)
    grow(T, [trunk], 5, 2, 0.12, 0.065, 0.05, fL=0.5, fB=0.7, base=lambda c: c.z - 2.0, zmin=-0.3, n=26)
    return T


def poplar(seed):
    """тополь колонной: ось до 11 м, суки почти стоймя — «метла»"""
    T = Tree(((0, 0, 6.6), (1.5, 1.5, 5.2)), random.Random(seed))
    lead = T.chain([Vector((0, 0, -0.2)), Vector((0, 0, 2.4)), Vector((0.05, -0.03, 10.8))], 0.25, 0, taper=0.7)
    grow(T, [lead], 6, 2, 0.1, 0.06, 0.045, fL=0.6, fB=0.8, base=lambda c: c.z - 4.5, zmin=-0.75, n=22)
    return T


def rowan(seed):
    """рябина: невысокая, ствол раздвоен, крона круглая"""
    T = Tree(((0, 0, 3.5), (1.9, 1.9, 1.55)), random.Random(seed))
    st = [T.chain([Vector((sd * 0.12, 0, -0.2)), Vector((sd * 0.3, 0, 1.4)), Vector((sd * 0.55, sd * 0.05, 3.0))], 0.12, 0) for sd in (-1, 1)]
    grow(T, st, 4, 2, 0.065, 0.045, 0.04, fL=0.5, fB=0.7, base=lambda c: c.z - 1.2, zmin=-0.3, n=18)
    return T


def alley(seed):
    """дерево аллеи: ствол до развилки 6 м, сучья и прутья тянутся к оси улицы (+x, 10 м) — с той стороны навстречу такое же"""
    T = Tree(((4.4, 0, 9.6), (6.4, 3.6, 2.2)), random.Random(seed))
    trunk = T.chain([Vector((0, 0, -0.2)), Vector((0.15, 0, 3.0)), Vector((0.5, 0, 7.0))], 0.39, 0, taper=0.6)
    grow(T, [trunk], 6, 2, 0.17, 0.08, 0.05, fL=0.6, fB=0.72, base=lambda c: 6.2, zmin=-0.25, n=34, xmin=-2.2)
    return T


# ─────────── новые породы (М6, 24.10.2026): яблоня, черёмуха, ива (две), каштан, вяз, лиственница, старое дерево; кусты ───────────
def apple(seed):
    """яблоня-дичка: низкий кривой ствол 1,5 м, развилка на 3—4 толстых сука, крона широкая и приплюснутая"""
    T = Tree(((0, 0, 3.2), (2.7, 2.7, 1.55)), random.Random(seed))
    trunk = T.chain([Vector((0, 0, -0.2)), Vector((0.18, 0.06, 0.9)), Vector((0.05, 0.16, 1.7))], 0.2, 0, taper=0.45)
    grow(T, [trunk], 5, 2, 0.11, 0.06, 0.045, fL=0.55, fB=0.75, base=lambda c: 1.2, zmin=-0.45, n=22)
    return T


def cherry(seed):
    """черёмуха: три ствола из земли вразлёт, крона — высокий овал"""
    T = Tree(((0, 0, 4.7), (2.3, 2.3, 2.4)), random.Random(seed))
    st = []
    for i in range(3):
        a = i * 2.1 + T.rng.uniform(-0.3, 0.3)
        o = Vector((math.cos(a), math.sin(a), 0))
        st.append(T.chain([Vector((0, 0, -0.2)) + o * 0.12, o * 0.45 + Vector((0, 0, 2.0)), o * 0.9 + Vector((0, 0, 4.6))], 0.1, 0, taper=0.6))
    grow(T, st, 5, 2, 0.065, 0.045, 0.035, fL=0.5, fB=0.7, base=lambda c: c.z - 1.6, zmin=-0.45, n=22)
    return T


def willow(seed, weep=True):
    """ива у воды: weep — плакучая (толстый ствол 2,4 м, прутья свисают почти до земли), иначе — ракита (короткий ствол,
    суки торчком из «головы», круглая шапка)"""
    if weep:
        T = Tree(((0, 0, 4.9), (3.6, 3.6, 3.1)), random.Random(seed))
        trunk = T.chain([Vector((0, 0, -0.2)), Vector((0.2, 0, 1.4)), Vector((0.35, 0.05, 3.2))], 0.3, 0, taper=0.5)
        grow(T, [trunk], 5, 2, 0.13, 0.07, 0.035, fL=0.5, fB=0.65, base=lambda c: 2.8, zmin=0.0, n=18, hang=3.2)
    else:
        T = Tree(((0, 0, 4.6), (2.6, 2.6, 2.2)), random.Random(seed))
        trunk = T.chain([Vector((0, 0, -0.2)), Vector((0.1, 0, 1.1)), Vector((0.12, 0.04, 2.2))], 0.32, 0, taper=0.3)
        grow(T, [trunk], 7, 2, 0.08, 0.05, 0.035, fL=0.6, fB=0.75, base=lambda c: 2.0, zmin=-0.35, n=26)
    return T


def chestnut(seed):
    """каштан: толстый ствол 3 м, плотный купол"""
    T = Tree(((0, 0, 6.0), (3.2, 3.2, 3.0)), random.Random(seed))
    trunk = T.chain([Vector((0, 0, -0.2)), Vector((0.04, 0.02, 2.0)), Vector((0.0, 0.05, 5.2))], 0.3, 0, taper=0.55)
    grow(T, [trunk], 6, 2, 0.14, 0.07, 0.05, fL=0.5, fB=0.72, base=lambda c: c.z - 2.6, zmin=-0.35, n=28)
    return T


def elm(seed):
    """вяз — «ваза»: ствол до 3,2 м, там три лидера вразлёт вверх, крона широким зонтом наверху"""
    T = Tree(((0, 0, 7.9), (3.9, 3.9, 2.5)), random.Random(seed))
    trunk = T.chain([Vector((0, 0, -0.2)), Vector((0.05, 0, 1.6)), Vector((0.0, 0.04, 3.3))], 0.27, 0, taper=0.3)
    st = [trunk]
    for i in range(3):
        a = i * 2.1 + T.rng.uniform(-0.25, 0.25)
        o = Vector((math.cos(a), math.sin(a), 0))
        st.append(T.chain([Vector((0, 0.04, 3.2)), o * 0.9 + Vector((0, 0, 5.4)), o * 1.8 + Vector((0, 0, 8.2))], 0.15, 1, sec='sq', taper=0.6))
    grow(T, st[1:], 6, 2, 0.08, 0.05, 0.04, fL=0.5, fB=0.75, base=lambda c: c.z - 1.6, zmin=-0.25, n=28)
    return T


def larch(seed):
    """лиственница: прямой ствол до 12 м, ветки мутовками почти горизонтально, концы чуть вверх; конус — внизу шире"""
    rng = random.Random(seed)
    T = Tree(((0, 0, 6.5), (2.6, 2.6, 6.0)), rng)
    lead = T.chain([Vector((0, 0, -0.2)), Vector((0, 0, 4.0)), Vector((0.03, -0.02, 12.2))], 0.22, 0, taper=0.8)
    k = 0
    for i in range(6):                              # мутовки: 2,4 м … 10,5 м, по 2—3 ветки
        z = 2.4 + i * 1.6 + rng.uniform(-0.2, 0.2)
        L = 2.7 * (1 - (z - 2.0) / 11.0) + 0.35      # длина ветки — конус
        for j in range(3 if i < 4 else 2):
            a = k * GA + rng.uniform(-0.2, 0.2); k += 1
            p0 = Vector((0, 0, z))
            d = az(a, rng.uniform(-0.12, 0.05))
            e = p0 + d * L + UP * (0.25 + 0.1 * L)
            br = T.chain([p0, p0 + d * L * 0.55 - UP * 0.1 * L, e], 0.06 + 0.012 * L, 1 if L > 1.4 else 2, taper=0.6)
            for t in (0.5, 0.92):                    # веточки в стороны от ветки
                q, dd = T.along(br, t)
                sd = dd.cross(UP).normalized() * (1 if (j + int(t * 10)) % 2 else -1)
                T.chain([q, q + (sd * 0.8 + dd * 0.5 - UP * 0.1).normalized() * (0.35 + 0.3 * L * (1 - t))], 0.03, 3)
    return T


def oldtree(seed):
    """старое корявое дерево: толстый ствол с наклоном, кривые суки, один обломан (короткий тупой), крона редкая, набок"""
    T = Tree(((0.7, 0.2, 6.4), (3.7, 3.0, 2.8)), random.Random(seed))
    trunk = T.chain([Vector((0, 0, -0.2)), Vector((0.35, 0.1, 1.8)), Vector((0.2, 0.3, 3.4)), Vector((0.75, 0.25, 5.0))], 0.42, 0, taper=0.55)
    T.chain([Vector((0.25, 0.25, 3.0)), Vector((-0.9, 0.4, 3.8)), Vector((-1.5, 0.5, 4.0))], 0.16, 1, taper=0.35)   # обломанный сук
    T.chain([Vector((0.6, 0.25, 4.6)), Vector((0.2, -0.8, 6.2)), Vector((0.1, -1.0, 7.6))], 0.09, 1, taper=0.7)      # сухой сук торчит вверх
    grow(T, [trunk], 4, 2, 0.13, 0.07, 0.045, fL=0.6, fB=0.75, base=lambda c: c.z - 2.4, zmin=-0.3, n=18, xmin=-1.0)
    return T


def shrub(T, stems, nB, rS, rB, rT, fS=0.7, fB=0.8, zmin=-0.2, n=18, sag=0.0):
    """куст: stems стеблей из земли (часть 1 — видны всегда, на телефоне — только они), к кучкам концов — ветки (2), прутья (3)"""
    P = tips(T, n, zmin)
    root = Vector((T.c.x, T.c.y, -0.1))
    for g in kmeans(P, stems, Vector((T.c.x, T.c.y, T.c.z - T.r.z))):
        cen = sum(g, Vector()) / len(g)
        a = T.rng.uniform(0, 6.283)
        p0 = root + Vector((math.cos(a), math.sin(a), 0)) * 0.12
        e = p0.lerp(cen, fS)
        m = p0.lerp(e, 0.5) + (Vector((e.x - p0.x, e.y - p0.y, 0)) * 0.12)
        st = T.chain([p0, m, e], rS, 1, sec='dia', taper=0.6)
        for sg in kmeans(g, nB, e):
            sc = sum(sg, Vector()) / len(sg)
            q0, _ = T.along(st, T.rng.uniform(0.6, 0.92))
            be = q0.lerp(sc, fB)
            br = T.chain([q0, be], rB, 2)
            for tp in sg:
                w0, _ = T.along(br, T.rng.uniform(0.6, 0.95))
                T.chain([w0, w0.lerp(tp, 0.5) - UP * sag, tp] if sag else [w0, tp], rT, 3)
    return T


def caragana(seed):
    """жёлтая акация: прямой узкий куст ~2,6 м, стебли почти стоймя"""
    return shrub(Tree(((0, 0, 1.6), (0.95, 0.95, 1.15)), random.Random(seed)), 6, 2, 0.045, 0.03, 0.022, fS=0.75, zmin=-0.1, n=15)


def elder(seed):
    """бузина: широкий раскидистый куст ~3 м, стебли дугой наружу"""
    return shrub(Tree(((0, 0, 1.8), (1.7, 1.7, 1.3)), random.Random(seed)), 5, 2, 0.06, 0.04, 0.028, fS=0.65, zmin=-0.3, n=16)


def hawthorn(seed):
    """боярышник: деревце-куст ~3,5 м — короткий ствол, развилка, круглая крона"""
    T = Tree(((0, 0, 2.5), (1.55, 1.55, 1.2)), random.Random(seed))
    trunk = T.chain([Vector((0, 0, -0.2)), Vector((0.06, 0.03, 0.6)), Vector((0.02, 0.06, 1.3))], 0.1, 0, taper=0.4)
    grow(T, [trunk], 4, 2, 0.06, 0.04, 0.025, fL=0.55, fB=0.75, base=lambda c: 1.0, zmin=-0.35, n=15)
    return T


def currant(seed):
    """смородина: низкий круглый куст ~1,2 м из тонких стеблей"""
    return shrub(Tree(((0, 0, 0.7), (0.8, 0.8, 0.6)), random.Random(seed)), 5, 2, 0.03, 0.022, 0.016, fS=0.7, zmin=-0.25, n=12)


MODELS = [('birchA', lambda: birch(11)), ('birchB', lambda: birch(29)), ('poplar', lambda: poplar(5)), ('maple', lambda: maple(7)),
          ('lime', lambda: maple(13, lime=True)), ('rowan', lambda: rowan(3)), ('alley', lambda: alley(17)),
          ('apple', lambda: apple(23)), ('cherry', lambda: cherry(31)), ('willowA', lambda: willow(41)), ('willowB', lambda: willow(43, False)),
          ('chestnut', lambda: chestnut(47)), ('elm', lambda: elm(53)), ('larch', lambda: larch(59)), ('oldtree', lambda: oldtree(61)),
          ('caragana', lambda: caragana(67)), ('elder', lambda: elder(71)), ('hawthorn', lambda: hawthorn(73)), ('currant', lambda: currant(79))]
SEC = {'sq': [45, 135, 225, 315], 'dia': [0, 90, 180, 270], 'tri': [90, 210, 330]}


# ─────────── сетка: кольца по точкам ломаной, конец — в точку ───────────
def build(T):
    """→ вершины [Vector] и треугольники [(часть, снег, a, b, c)]"""
    V, F = [], []

    def frame(d):
        s = d.cross(UP)
        if s.length < 0.2: s = Vector((1, 0, 0)) - d * d.x   # почти стоймя — любая сторона
        s.normalize()
        return s, s.cross(d).normalized()                  # u — «верх» сечения

    for pts, rads, part, sec in T.chains:
        angs, n = SEC[sec], len(SEC[sec])
        if sec == 'dia': rads = [r * 1.15 for r in rads]
        rings = []
        for i, p in enumerate(pts[:-1]):
            d0 = (pts[i + 1] - p).normalized()
            d = d0 if i == 0 else ((p - pts[i - 1]).normalized() + d0).normalized()
            s, u = frame(d)
            ring = []
            for g in angs:
                th = math.radians(g)
                V.append(p + (s * math.cos(th) + u * math.sin(th)) * rads[i]); ring.append(len(V) - 1)
            rings.append((ring, p))
        V.append(pts[-1].copy()); apex = len(V) - 1

        def tri(a_, b_, c_, axis_p):
            na = (V[b_] - V[a_]).cross(V[c_] - V[a_])
            cen = (V[a_] + V[b_] + V[c_]) / 3
            if na.dot(cen - axis_p) < 0: b_, c_ = c_, b_; na = -na
            nz = na.normalized().z if na.length > 1e-12 else 0
            F.append((part, 1 if (part > 0 and nz > 0.3) else 0, a_, b_, c_))

        for i in range(len(rings)):
            ra, pa = rings[i]
            if i + 1 < len(rings):
                rb, pb = rings[i + 1]
                mid = (pa + pb) / 2
                for k in range(n):
                    k2 = (k + 1) % n
                    tri(ra[k], ra[k2], rb[k2], mid); tri(ra[k], rb[k2], rb[k], mid)
            else:
                mid = (pa + pts[-1]) / 2
                for k in range(n):
                    tri(ra[k], ra[(k + 1) % n], apex, mid)
    return V, F


bpy.ops.wm.read_factory_settings(use_empty=True)
WINTER = {0: (0.42, 0.33, 0.25), 1: (0.36, 0.27, 0.19), 2: (0.32, 0.24, 0.17), 3: (0.27, 0.2, 0.15)}
BIRCH = {0: (0.85, 0.82, 0.76), 1: (0.72, 0.68, 0.62), 2: (0.36, 0.3, 0.27), 3: (0.22, 0.15, 0.12)}
mats = {}
def mat(key, rgb):
    if key not in mats:
        m = bpy.data.materials.new('m_' + '_'.join(map(str, key))); m.diffuse_color = (*rgb, 1); mats[key] = m
    return mats[key]

out, objs = {}, []
for mi, (name, fn) in enumerate(MODELS):
    T = fn()
    V, F = build(T)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in V], [], [f[2:] for f in F])
    keys = sorted(set((f[0], f[1]) for f in F))
    pal = BIRCH if name.startswith('birch') else WINTER
    for k in keys: me.materials.append(mat((name[:5],) + k, (0.93, 0.95, 0.99) if k[1] else pal[k[0]]))
    for poly, f in zip(me.polygons, F): poly.material_index = keys.index((f[0], f[1]))
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.002)   # общие вершины
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    objs.append(ob)
    vs = []                                          # Blender z вверх → игра y вверх: (x, z, −y), сантиметры
    for v in me.vertices: vs += [round(v.co.x * 100), round(v.co.z * 100), round(-v.co.y * 100)]
    groups = {}
    for poly in me.polygons: groups.setdefault(keys[poly.material_index], []).extend(poly.vertices)
    nt = len(me.polygons); lite = sum(len(g) // 3 for k, g in groups.items() if k[0] < 3)
    out[name] = (vs, groups, nt, lite)
    print('%-7s треугольников %3d (без прутьев %3d)  вершин %3d  снег %3d' % (name, nt, lite, len(me.vertices),
          sum(len(g) // 3 for k, g in groups.items() if k[1])))

with open(OUT, 'w') as f:
    f.write('/* Зимние деревья: голые ветки, снег сверху — модели из Blender (tools/trees/wintertrees.py; собрано скриптом, руками не править).\n'
            '   v — вершины, см (x, y — вверх, z); g — треугольники группами [часть, снег, индексы…]: часть 0 — ствол, 1 — сук,\n'
            '   2 — ветка, 3 — прут; снег 1 — грань смотрит вверх (зимой белая). tris — треугольников, lite — без прутьев.\n'
            '   Размеры — при s = 1, H = 1 (trees.js growTree) */\n')
    f.write('export const WTREES = {\n')
    for name, (vs, groups, nt, lite) in out.items():
        f.write('  %s: { tris: %d, lite: %d, v: [%s],\n    g: [%s] },\n' % (name, nt, lite, ','.join(map(str, vs)),
                ', '.join('[%d, %d, [%s]]' % (k[0], k[1], ','.join(map(str, g))) for k, g in sorted(groups.items()))))
    f.write('};\n')
print('ok', OUT)

if PNG:   # проверка глазами: каждая модель — сбоку (с тротуара) и снизу-сбоку (камера над машиной, дерево ближе)
    os.makedirs(PNG, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x = 560; sc.render.resolution_y = 640
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'
    sc.display.shading.show_backface_culling = True
    sc.world = bpy.data.worlds.new('w'); sc.world.color = (0.62, 0.68, 0.76)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam)
    cam.data.lens = 35
    sc.camera = cam
    for ob in objs:
        for o2 in objs: o2.hide_render = o2 is not ob
        al = ob.name == 'alley'
        hz = max(v.co.z for v in ob.data.vertices)         # кусты — ближе и ниже (камера по высоте модели)
        k = 1.5 if al else max(0.35, hz / 9.0)
        tgt = Vector((4.5, 0, 6.5)) if al else Vector((0, 0, hz * 0.55))
        for i, loc in enumerate(((0, -15, 1.6), (8, -9, 7.0))):
            cam.location = tgt + Vector(loc) * k - Vector((0, 0, tgt.z))
            cam.location.z = loc[2] * (1 if al or k >= 1 else max(0.4, k))
            cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
            sc.render.filepath = os.path.join(PNG, '%s_%d.png' % (ob.name, i)); bpy.ops.render.render(write_still=True)
