# 글자 그림(glyphs.json 또는 glyphs-bold.json) → TrueType. 표준 라이브러리 + fontTools 만 쓴다.
# python scripts/build_font.py <작업 폴더> [--bold] [--only 가나다]
# 윤곽 따기: 잉크 경계 변을 고리로 잇고(바깥·구멍 방향이 저절로 반대) → 이웃 평균으로 다듬기 → Douglas-Peucker → 남은 점을 모두 off-curve 로 둔 2차 B-스플라인(펜 글씨라 둥근 모서리).
# 단위: 1em=1000, 한글 잉크 높이 중앙값 → 780, 칸 안 세로 자리는 그대로(쉼표 아래, 「 위).
# 영문(glyphs.json latin): 대문자 높이 중앙값 → 640, 장마다 잰 기준선 → 0. 글자 종류별로 기준선·x-높이에 붙이고(어긋남이 작을 때만),
#   글자 모양에 따른 옆 여백 + 윤곽 모양으로 잰 커닝(kern). 숫자·? ! . % 도 영문 기준선에 붙인다.
import argparse, json, struct, sys, zlib
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")  # 멈춤 메시지(sys.exit)가 Windows 코드 페이지로 깨지지 않게
except Exception:
    pass

ap = argparse.ArgumentParser()
ap.add_argument("dir")
ap.add_argument("--bold", action="store_true")
ap.add_argument("--only", default="")
args = ap.parse_args()
DIR = Path(args.dir).resolve()
STYLE = "Bold" if args.bold else "Regular"
if not (DIR / "font.json").exists():
    sys.exit(f"멈춤: {DIR} 는 작업 폴더가 아니다(font.json 없음) — 먼저 hf.mjs init")
src = DIR / ("glyphs-bold.json" if args.bold else "glyphs.json")
if not src.exists():
    sys.exit(f"멈춤: {src.name} 가 없다 — 먼저 node scripts/hf.mjs {'bold' if args.bold else 'glyphs'} {DIR}")
cfg = json.loads((DIR / "font.json").read_text(encoding="utf-8"))
meta = json.loads(src.read_text(encoding="utf-8"))

UPM, ASC, DESC = 1000, 880, -120
HANGUL_H, CENTER_Y = 780, 370
SB = {"hangul": 45, "other": 35}
SPACE, SMOOTH, EPS, MIN_AREA = 300, 3, 0.7, 40
k = HANGUL_H / meta["hangulInkHeightMedian"]
center = meta["hangulCenterMedian"]
LAT = meta.get("latin")  # 영문 장이 있을 때만: {cap, k, baseline: {장: 기준선 px(2배 그림 기준)}}
CAP = LAT["cap"] if LAT else 0
# 기준선에 붙일 글자(잉크 아래 끝 → 0) · x-높이에 붙일 꼬리 글자(잉크 위 끝 → x-높이). J Q j 와 괄호·쉼표 등은 칸에서 옮긴 자리 그대로.
SNAP_BASE = set("ABCDEFGHIKLMNOPRSTUVWXYZabcdefhiklmnorstuvwxz0123456789!?.%&#@")
SNAP_DESC = set("gpqy")
X_CLASS = "acemnorsuvwxz"
# 영문 옆 여백(1em=1000): 곧은 기둥 · 둥근 쪽 · 열린(빗긴) 쪽
SB_L = {**{c: 50 for c in "BDEFHIKLMNPRbhiklmnpru"}, **{c: 32 for c in "CGOQScdeoqgsa"}, **{c: 14 for c in "AJTVWXYZfjtvwxyz"}}
SB_R = {**{c: 50 for c in "HIMNadhijlmnqu"}, **{c: 32 for c in "BDGOQSbops"}, **{c: 14 for c in "ACEFKLPRTVWXYZcefkrtvwxyz"}}


def read_png_gray(path):
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    pos, idat, w, h, ch = 8, b"", 0, 0, 1
    while pos < len(data):
        ln = struct.unpack(">I", data[pos:pos + 4])[0]; typ = data[pos + 4:pos + 8]; body = data[pos + 8:pos + 8 + ln]
        if typ == b"IHDR":
            w, h, depth, ctype = struct.unpack(">IIBB", body[:10])
            assert depth == 8, depth
            ch = {0: 1, 2: 3, 4: 2, 6: 4}[ctype]
        elif typ == b"IDAT":
            idat += body
        pos += 12 + ln
    raw = zlib.decompress(idat)
    stride = w * ch
    rows, prev = [], bytearray(stride)
    for y in range(h):
        f = raw[y * (stride + 1)]; line = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            a = line[i - ch] if i >= ch else 0; b = prev[i]; c = prev[i - ch] if i >= ch else 0
            if f == 1: line[i] = (line[i] + a) & 255
            elif f == 2: line[i] = (line[i] + b) & 255
            elif f == 3: line[i] = (line[i] + ((a + b) >> 1)) & 255
            elif f == 4:
                p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(bytes(line[0::ch]))
        prev = line
    return w, h, rows


def loops_of(w, h, rows, ink=128):
    isink = lambda x, y: 0 <= x < w and 0 <= y < h and rows[y][x] < ink
    out = {}
    for y in range(h):
        r = rows[y]
        for x in range(w):
            if r[x] >= ink: continue
            if not isink(x, y - 1): out.setdefault((x, y), []).append((x + 1, y))
            if not isink(x + 1, y): out.setdefault((x + 1, y), []).append((x + 1, y + 1))
            if not isink(x, y + 1): out.setdefault((x + 1, y + 1), []).append((x, y + 1))
            if not isink(x - 1, y): out.setdefault((x, y + 1), []).append((x, y))
    loops = []
    while out:
        start = next(iter(out)); cur = start; loop = [start]; prevd = None
        while True:
            nxts = out[cur]
            if len(nxts) == 1:
                nxt = nxts.pop()
            else:
                def turn(n):
                    d = (n[0] - cur[0], n[1] - cur[1])
                    return (prevd[0] * d[1] - prevd[1] * d[0]) if prevd else 0
                nxt = max(nxts, key=turn); nxts.remove(nxt)
            if not nxts: del out[cur]
            prevd = (nxt[0] - cur[0], nxt[1] - cur[1])
            if nxt == start: break
            loop.append(nxt); cur = nxt
        loops.append(loop)
    return loops


def area(p):
    return sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p))) / 2


def smooth(p, r):
    n = len(p)
    mids = [((p[i][0] + p[(i + 1) % n][0]) / 2, (p[i][1] + p[(i + 1) % n][1]) / 2) for i in range(n)]
    if r <= 0 or n < 2 * r + 3: return mids
    out = []
    for i in range(n):
        sx = sy = 0.0
        for j in range(-r, r + 1):
            q = mids[(i + j) % n]; sx += q[0]; sy += q[1]
        out.append((sx / (2 * r + 1), sy / (2 * r + 1)))
    return out


def dp(points, eps):
    n = len(points)
    if n < 8: return points
    b = max(range(n), key=lambda i: (points[i][0] - points[0][0]) ** 2 + (points[i][1] - points[0][1]) ** 2)
    def simp(seg):
        if len(seg) < 3: return seg
        (x1, y1), (x2, y2) = seg[0], seg[-1]
        dx, dy = x2 - x1, y2 - y1; L = (dx * dx + dy * dy) ** 0.5 or 1e-9
        idx, dmax = 0, -1
        for i in range(1, len(seg) - 1):
            d = abs(dy * seg[i][0] - dx * seg[i][1] + x2 * y1 - y2 * x1) / L
            if d > dmax: idx, dmax = i, d
        if dmax <= eps: return [seg[0], seg[-1]]
        return simp(seg[:idx + 1])[:-1] + simp(seg[idx:])
    s1 = simp(points[0:b + 1]); s2 = simp(points[b:] + [points[0]])
    return s1[:-1] + s2[:-1]


def place(g):
    """그림 좌표 → 글꼴 좌표: (scale, fy). 영문은 그 장의 기준선이 0, 나머지는 한글 세로 가운데가 CENTER_Y."""
    if g.get("latin"):
        scale = LAT["k"] * meta["sheetScale"][g["sheet"]]
        base = LAT["baseline"][g["sheet"]] + g.get("pad", 0)
        return scale, lambda y: (base - y) * scale
    scale = k * meta["sheetScale"][g["sheet"]]
    cy = center * g["cell"]["h"] + g.get("pad", 0)
    return scale, lambda y: CENTER_Y + (cy - y) * scale


def snap_dy(g):
    """영문 기준선 맞추기: 보통 굵기의 잉크 상자(g.ink — 굵게도 같은 값)로 잰 세로 이동. 어긋남이 크면(모델이 일부러 내려 쓴 모양일 수 있다) 그대로."""
    if not LAT: return 0
    ch = g["ch"]
    if ch not in SNAP_BASE and ch not in SNAP_DESC: return 0
    gg = {**g, "pad": 0}; _, fy = place(gg)
    if ch in SNAP_BASE:
        dy = -fy(g["ink"]["y1"])
    else:
        dy = XH - fy(g["ink"]["y0"])
    if abs(dy) > 0.2 * CAP:
        print(f"  기준선에서 많이 벗어나 그대로 둠: {ch} ({round(dy)})"); return 0
    return dy


def glyph_contours(g):
    w, h, rows = read_png_gray(DIR / g["file"])
    scale, fy = place(g)
    x0 = g["ink"]["x0"]
    dy = snap_dy(g)
    res = []
    for loop in loops_of(w, h, rows):
        if abs(area(loop)) < MIN_AREA: continue
        pts = dp(smooth(loop, SMOOTH), EPS)
        if len(pts) < 3: continue
        res.append([((x - x0) * scale, fy(y) + dy) for x, y in pts])
    # 커닝용 옆모습: 그림 줄마다 잉크 왼쪽·오른쪽 끝(글꼴 좌표, x 는 아직 옆 여백 전)
    prof = []
    if LAT and (g.get("latin") or g["ch"] in KERN_SET):
        for y in range(h):
            r = rows[y]; xs = [x for x in range(w) if r[x] < 128]
            if xs: prof.append((fy(y) + dy, (xs[0] - x0) * scale, (xs[-1] + 1 - x0) * scale))
    return res, prof


# x-높이: 꼬리 없는 소문자의 잉크 높이 중앙값(굵게도 보통의 잉크 상자로 — 두 굵기가 같은 자리에 오게)
def _xh():
    if not LAT: return 0
    hs = sorted((g["ink"]["y1"] - g["ink"]["y0"]) * LAT["k"] * meta["sheetScale"][g["sheet"]] for g in meta["glyphs"] if g.get("latin") and g["ch"] in X_CLASS)
    return round(hs[len(hs) // 2]) if hs else round(CAP * 0.66)
XH = _xh()
KERN_SET = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,'\"‘’“”-")


def draw(pen, contours, dx=0):
    for c in contours:
        pen.qCurveTo(*[(round(x + dx), round(y)) for x, y in c], None)
        pen.closePath()


glyph_order, cmap, glyphs, hmtx = [".notdef", "space"], {0x20: "space", 0xA0: "space"}, {}, {}
ymax_of = {".notdef": 700, "space": None}  # 세로 간격(vmtx tsb)용 잉크 위끝
vert_src = {}  # 일본어 세로용 대체 모양을 만들 글자: 이름 → 가로 자리의 윤곽
pen = TTGlyphPen(None)
for (a, b, c, d) in [((50, 0), (450, 0), (450, 700), (50, 700)), ((90, 40), (90, 660), (410, 660), (410, 40))]:
    pen.moveTo(a); pen.lineTo(b); pen.lineTo(c); pen.lineTo(d); pen.closePath()
glyphs[".notdef"] = pen.glyph(); hmtx[".notdef"] = (500, 50)
glyphs["space"] = TTGlyphPen(None).glyph(); hmtx["space"] = (SPACE, 0)

only = set(args.only)
done = 0
profiles, ymin_lat = {}, 0  # 커닝용 옆모습 · 영문 가장 낮은 잉크
JA = cfg.get("script", "ko") == "ja"
def fullwidth(cp):
    # CJK 부호(、。「」…) · 히라가나 · 가타카나 · 한자 · 전각 꼴(！？（）％ 등) · ♪♡♥★※→
    return 0x3000 <= cp <= 0x30FF or 0x3400 <= cp <= 0x4DBF or 0x4E00 <= cp <= 0x9FFF or 0xFF01 <= cp <= 0xFF60 or cp in (0x2026, 0x266A, 0x2661, 0x2665, 0x2605, 0x203B, 0x2192)
# ---- 일본어 세로쓰기: 세로용 대체 모양(이름.vert)은 가로 글자의 윤곽을 돌리거나 옮겨 만든다(그림을 새로 그리지 않는다)
#   rot   : 칸 가운데 기준 시계 90° 돌린 뒤 잉크 가운데를 목표 자리로 — 괄호는 다음/앞 글자 쪽에 붙게
#   shift : 옮기기만 — 、。 는 칸 오른쪽 위, 작은 가나는 조금 오른쪽 위
CY = (ASC + DESC) / 2  # 글자 상자 세로 가운데(380)
VERT_KIND = {}
for c in "「『（【〈《〔": VERT_KIND[c] = ("rot", (580, CY - 230))   # 여는 괄호: 칸 아래쪽 반·오른쪽 — 다음 글자에 붙는다
for c in "」』）】〉》〕": VERT_KIND[c] = ("rot", (420, CY + 230))   # 닫는 괄호: 칸 위쪽 반·왼쪽 — 앞 글자에 붙는다
for c in "ー〜～…‥：－＝": VERT_KIND[c] = ("rot", (500, CY))
for c in "、。，．": VERT_KIND[c] = ("shift", (730, CY + 300))
for c in "ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ": VERT_KIND[c] = ("shift", (580, CY + 40))

def make_vert(kind, target, cons):
    pts = [p for c in cons for p in c]
    x0, x1 = min(p[0] for p in pts), max(p[0] for p in pts); y0, y1 = min(p[1] for p in pts), max(p[1] for p in pts)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    if kind == "rot":  # 시계 90°: (x, y) → (cx + (y - cy), cy - (x - cx)) — 회전이라 윤곽 방향(바깥·구멍)은 그대로
        cons = [[(cx + (y - cy), cy - (x - cx)) for x, y in c] for c in cons]
    return [[(x + target[0] - cx, y + target[1] - cy) for x, y in c] for c in cons]

for g in meta["glyphs"]:
    if only and g["ch"] not in only: continue
    cp = ord(g["ch"]); name = f"uni{cp:04X}"
    if cp in cmap: continue
    cons, prof = glyph_contours(g)
    if not cons: print("빈 윤곽:", g["ch"]); continue
    rec = RecordingPen(); draw(rec, cons)
    bp = BoundsPen(None); rec.replay(bp)
    xmin, ymin, xmax, ymax = bp.bounds
    if JA and fullwidth(cp):
        # 일본어: 가나·한자·전각 부호는 전각(1em) 고정 폭에 가운데 — 일본어 조판의 기본(넓은 글자는 그만큼 넓힌다)
        adv = max(UPM, round(xmax - xmin + 2 * SB["other"]))
        sb = round((adv - (xmax - xmin)) / 2)
        tp = TTGlyphPen(None); draw(tp, cons, dx=sb - xmin)
        glyphs[name] = tp.glyph(); hmtx[name] = (adv, sb)
        if g["ch"] in VERT_KIND: vert_src[name] = (g["ch"], [[(x + sb - xmin, y) for x, y in c] for c in cons])
    else:
        sb = SB["hangul"] if 0xAC00 <= cp <= 0xD7A3 else SB["other"]
        sr = sb
        if g.get("latin"): sb, sr = SB_L.get(g["ch"], 30), SB_R.get(g["ch"], 30)
        tp = TTGlyphPen(None); draw(tp, cons, dx=sb - xmin)
        glyphs[name] = tp.glyph(); hmtx[name] = (round(xmax - xmin + sb + sr), sb)
        if prof: profiles[name] = [(y, xl - xmin + sb, xr - xmin + sb) for y, xl, xr in prof]
    glyph_order.append(name); cmap[cp] = name; ymax_of[name] = ymax
    if g.get("latin"): ymin_lat = min(ymin_lat, ymin)
    done += 1
    if done % 200 == 0: print(f"  … {done}", flush=True)

vert_subs = []
if JA:
    for base, (ch, cons) in vert_src.items():
        kind, target = VERT_KIND[ch]
        vc = make_vert(kind, target, cons)
        tp = TTGlyphPen(None); draw(tp, vc)
        vn = base + ".vert"
        glyphs[vn] = tp.glyph(); glyph_order.append(vn)
        xs = [x for c in vc for x, y in c]; ys = [y for c in vc for x, y in c]
        hmtx[vn] = (hmtx[base][0], round(min(xs))); ymax_of[vn] = max(ys)
        vert_subs.append((base, vn))

# ---- 커닝: 왼쪽 글자 오른쪽 옆모습(위아래 60 단위로 넓혀 빗긴 틈도 보게)과 오른쪽 글자 왼쪽 옆모습의 가장 좁은 틈이
#   옆 여백의 합(두 글자 끝이 같은 높이에서 마주 볼 때의 틈)보다 넓으면 그 차이의 70% 만큼 좁힌다 — 열리거나 빗긴 쪽이 있는 짝만(T o · A V · L T · r . 등)
BAND, LO, HI, WIN = 20, -300, 1000, 3
NB = (HI - LO) // BAND
def bands(prof):
    L, R = [None] * NB, [None] * NB
    for y, xl, xr in prof:
        b = int((y - LO) // BAND)
        if 0 <= b < NB:
            L[b] = xl if L[b] is None else min(L[b], xl); R[b] = xr if R[b] is None else max(R[b], xr)
    Rd = [max([v for v in R[max(0, b - WIN):b + WIN + 1] if v is not None], default=None) for b in range(NB)]
    return L, Rd
kern_pairs = []
if LAT and profiles:
    bp_ = {n: bands(p) for n, p in profiles.items()}
    def gap(a, b):
        La, Ra = bp_[a]; Lb, _ = bp_[b]
        gs = [hmtx[a][0] - Ra[i] + Lb[i] for i in range(NB) if Ra[i] is not None and Lb[i] is not None]
        return min(gs) if gs else None
    MAXK = round(0.15 * CAP)
    ch_of = {n: chr(cp) for cp, n in cmap.items()}
    OPEN = 20  # 이 값 이하의 옆 여백 = 열리거나 빗긴 쪽
    sbl = lambda c: SB_L.get(c, 30) if c.isascii() and c.isalpha() else 30
    sbr = lambda c: SB_R.get(c, 30) if c.isascii() and c.isalpha() else 30
    for a in bp_:
        ca = ch_of[a]
        for b in bp_:
            cb = ch_of[b]
            if not ca.isalpha() and not cb.isalpha(): continue  # 부호끼리는 하지 않는다
            if not (sbr(ca) <= OPEN or sbl(cb) <= OPEN or not ca.isalpha() or not cb.isalpha()): continue
            gv = gap(a, b)
            if gv is None: continue
            kv = max(-MAXK, round(0.7 * (sbr(ca) + sbl(cb) - gv) / 5) * 5)
            if kv <= -20: kern_pairs.append((a, b, kv))

FAM, PS, VER = cfg["family_en"], cfg["ps"], cfg.get("version", "1.000")
FAM_LOCAL, LANG = (cfg.get("family_ja"), 0x411) if JA else (cfg.get("family_ko"), 0x412)  # 일본어·한국어 Windows 앱 글꼴 목록에 뜨는 이름
fb = FontBuilder(UPM, isTTF=True)
fb.setupGlyphOrder(glyph_order)
fb.setupCharacterMap(cmap)
fb.setupGlyf(glyphs)
fb.setupHorizontalMetrics(hmtx)
fb.setupHorizontalHeader(ascent=ASC, descent=DESC)
if JA:
    # 세로 간격: 모든 글자 높이 1em, 세로 원점은 글자 상자 위(ASC) — tsb = ASC - 잉크 위끝
    fb.setupVerticalMetrics({n: (UPM, round(ASC - ymax_of[n]) if ymax_of.get(n) is not None else 0) for n in glyph_order})
    fb.setupVerticalHeader(ascent=UPM // 2, descent=-(UPM // 2))
fb.setupNameTable({"familyName": FAM, "styleName": STYLE})
name = fb.font["name"]
for nid in (1, 2, 3, 4, 5, 6):
    name.removeNames(nameID=nid)
en = {1: FAM, 2: STYLE, 3: f"{VER};NONE;{PS}-{STYLE}", 4: f"{FAM} {STYLE}", 5: f"Version {VER}", 6: f"{PS}-{STYLE}"}
for nid, s in en.items():
    name.setName(s, nid, 3, 1, 0x409); name.setName(s, nid, 1, 0, 0)
if FAM_LOCAL:
    for nid, s in {1: FAM_LOCAL, 2: STYLE, 4: f"{FAM_LOCAL} {STYLE}"}.items():
        name.setName(s, nid, 3, 1, LANG)
if cfg.get("copyright"): name.setName(cfg["copyright"], 0, 3, 1, 0x409)
if cfg.get("license"): name.setName(cfg["license"], 13, 3, 1, 0x409)
if cfg.get("license_url"): name.setName(cfg["license_url"], 14, 3, 1, 0x409)
if cfg.get("description"): name.setName(cfg["description"], 10, 3, 1, 0x409)
# 보통·굵게는 같은 가족 이름 + 스타일 — Word 의 굵게 단추·CSS font-weight 700 이 굵은 파일을 고른다
fb.setupOS2(sTypoAscender=ASC, sTypoDescender=DESC, sTypoLineGap=0, usWinAscent=1000, usWinDescent=250, achVendID="NONE", fsType=0,
            fsSelection=0x20 if args.bold else 0x40, usWeightClass=700 if args.bold else 400,
            **({"sxHeight": XH, "sCapHeight": CAP} if LAT else {}))
if args.bold: fb.font["head"].macStyle = 1
fb.setupPost()
fea = ""
if JA and vert_subs:
    rules = "\n".join(f"  sub {a} by {b};" for a, b in vert_subs)
    fea += f"feature vert {{\n{rules}\n}} vert;\nfeature vrt2 {{\n{rules}\n}} vrt2;\n"
if kern_pairs:
    fea += "feature kern {\n" + "\n".join(f"  pos {a} {b} {v};" for a, b, v in kern_pairs) + "\n} kern;\n"
if fea:
    from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
    langs = ["DFLT", "kana", "hani", "latn"] if JA else ["DFLT", "hang", "latn"]
    addOpenTypeFeaturesFromString(fb.font, "".join(f"languagesystem {t} dflt;\n" for t in langs) + fea)
os2 = fb.font["OS/2"]
os2.recalcUnicodeRanges(fb.font)
if hasattr(os2, "recalcCodePageRanges"): os2.recalcCodePageRanges(fb.font)
# Korean Wansung(19) / Japanese JIS(17) — 없으면 Windows 데스크톱 앱이 그 언어 글꼴로 안 보여 준다
os2.ulCodePageRange1 |= 1 << (17 if JA else 19)
fb.font["head"].fontRevision = float(VER)
outdir = DIR / "out"; outdir.mkdir(exist_ok=True)
out = outdir / ("test.ttf" if only else f"{PS}-{STYLE}.ttf")
fb.save(str(out))
if LAT and ymin_lat < -250: print(f"경고: 영문 꼬리가 {round(ymin_lat)} 까지 내려간다 — Windows 는 -250 아래를 잘라 그린다")
print(f"ok {out.name} · 글자 {done}개{f' · 영문 대문자 {CAP} · x-높이 {XH} · 커닝 {len(kern_pairs)}쌍' if LAT else ''}{f' · 세로용 모양 {len(vert_subs)}개(vert)' if vert_subs else ''} · {out.stat().st_size // 1024}KB")
