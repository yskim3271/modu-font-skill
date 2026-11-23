// 모두의 폰트 스킬(modu-font) 0.7.0 — 6×6 스케일-매칭 구제 장(redo --rescue)과 그 둘레의 도구.
//   배치(planRescue) · 정규화 · 측정 · 앵커 보정(calibrateRescue) · ref-2(makeRef2) · ref-3(makeRef3, 폰트 파일 name/cmap 읽기) ·
//   구제 프롬프트(rescuePrompt) · 프롬프트 대조(verifyJob) · 정밀 확대(compareBand) · 사람 검수용 그림(override).
//   hf.mjs 는 명령만 잇는다. 돈이 드는 일은 하나도 없다(그림을 그리지 않는다 — 그리는 것은 에이전트/openai 명령이고, 돈 규칙은 hf.mjs · lib.mjs 그대로).
// 근거: 크리스털 명조 2,350/2,350 실전(work/jrpg-myeongjo/rescue-6x6 — 61/61 회수, TTF 높이 오차 0.00% · 중심 −0.45%).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { P, isHangul, isMainSheet, jamo, kindOf, loadSharp, padOf, rcParse, readJson, writeJson } from "./lib.mjs";
import { checkSheet } from "./sheetcheck.mjs";

export const RESCUE_SHEET = "rescue-6x6", OVERRIDE_SHEET = "override";
export const GATE = { aspect: 0.08, stroke: 0.20 };   // 이 밖이면 보정하지 않고 리젝트(종료 코드 2)
export const TRIG = { aspect: 0.015, stroke: 0.03 };  // 이 안이면 장평 · 획은 건드리지 않는다
const FONT_UI = "Malgun Gothic, Apple SD Gothic Neo, Noto Sans CJK KR, Noto Sans KR, sans-serif";
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const med = (a) => { const b = a.filter((v) => v != null && Number.isFinite(v)).sort((x, y) => x - y); if (!b.length) return null; const n = b.length; return n % 2 ? b[n >> 1] : (b[n / 2 - 1] + b[n / 2]) / 2; };
export const r4 = (v) => (v == null || !Number.isFinite(v) ? null : +v.toFixed(4));
const pct = (v) => (v == null ? "-" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);
export const uname = (ch) => `u${[...ch].map((x) => x.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join("_")}`;

// ---- 한글 자모
const I = [..."ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"], M = [..."ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"], F = ["", ..."ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"];
export const dec = (c) => { const n = c.charCodeAt(0) - 0xac00; return { i: I[Math.floor(n / 588)], m: M[Math.floor((n % 588) / 28)], f: F[n % 28] }; };
export const DOUBLE_F = new Set([..."ㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ"]);
const VERT = new Set([..."ㅏㅐㅑㅒㅓㅔㅕㅖㅣ"]), HORZ = new Set([..."ㅗㅛㅜㅠㅡ"]);
const shapeOf = (c) => { const d = dec(c); return VERT.has(d.m) ? "V" : HORZ.has(d.m) ? "H" : "X"; };
const famGroup = (m) => ({ ㅛ: "y", ㅠ: "y", ㅑ: "y", ㅕ: "y", ㅒ: "y", ㅖ: "y", ㅙ: "w", ㅞ: "w", ㅚ: "w", ㅘ: "w", ㅝ: "w", ㅟ: "w", ㅢ: "ui" })[m] ?? "plain";
// 간섭 모음: 이 모음의 타깃이 있는 장에는 그 앵커를 넣지 않는다(크리스털 p06 — ㅝ 타깃 훰 이 ㅟ 앵커 휨 꼴로 다섯 번 모두 끌려갔다)
export const INTERFERE = { ㅝ: ["ㅟ"] };

// ---- 결정적 난수(다시 돌리면 같은 배치)
const rng = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); };

// =====================================================================================
// 1. 배치: 없는 글자(타깃) + 통과한 본문 글자(앵커) → 6×6 구제 장들
//   miss: 타깃 글자 · pool: [{ ch, sheet, rc, err }] 앵커 후보(본문 장의 통과 칸) · A: 장마다 앵커 수(기본 15 → 타깃 21)
//   잔여가 10자 이하면 한 장에 2~5번씩 되풀이(서로 다른 행 · 열, 8방향 이웃 금지). 남는 칸은 앵커가 채운다.
// =====================================================================================
export function groupTargets(miss, A) {
  const T = 36 - A;
  if (miss.length <= 10) return [miss];
  const groups = [];
  for (let i = 0; i < miss.length; i += T) groups.push(miss.slice(i, i + T));
  return groups;
}
export const copiesFor = (k, A) => (k <= 10 ? Math.max(2, Math.min(5, Math.floor((36 - A) / k))) : 1);

function sim(a, t) {
  const A = dec(a), T = dec(t);
  let s = 0;
  if (A.m === T.m) s += 4; else if (famGroup(A.m) === famGroup(T.m) && famGroup(A.m) !== "plain") s += 1.5;
  if (shapeOf(a) === shapeOf(t)) s += 1;
  if (A.f && T.f) s += 1;
  if (A.f === T.f && T.f) s += 2;
  if (DOUBLE_F.has(A.f) && DOUBLE_F.has(T.f)) s += 2;
  if (A.i === T.i) s += 0.5;
  return s;
}
// 앵커 고르기: 타깃마다 가장 닮은 앵커를 고루(facility location) + 같은 모음 앵커를 타깃마다 몫만큼(반복 장은 4자씩)
function pickAnchors(targets, nA, pool, used, sheetOrder) {
  const tDistinct = [...new Set(targets)];
  const hasW = new Set(tDistinct.flatMap((t) => INTERFERE[dec(t).m] ?? []));
  const anyDouble = tDistinct.some((t) => DOUBLE_F.has(dec(t).f));
  const ok = (g) => !used.has(g.ch) && !hasW.has(dec(g.ch).m) && (anyDouble || !DOUBLE_F.has(dec(g.ch).f)); // 겹받침 타깃이 없는 장에는 겹받침 앵커도 넣지 않는다(겹받침 간섭)
  const best = new Map(tDistinct.map((t) => [t, 0]));
  const need = new Map(tDistinct.map((t) => [t, Math.max(1, Math.floor(nA / tDistinct.length))]));
  const chosen = [];
  for (let k = 0; k < nA; k++) {
    let top = null, topScore = -Infinity;
    for (const g of pool) {
      if (!ok(g) || chosen.includes(g)) continue;
      let gain = 0;
      for (const t of tDistinct) { gain += Math.max(0, sim(g.ch, t) - best.get(t)); if (need.get(t) > 0 && dec(g.ch).m === dec(t).m) gain += 2; }
      const score = gain - g.err * 0.15 - sheetOrder(g.sheet) * 0.001;
      if (score > topScore) { topScore = score; top = g; }
    }
    if (!top) break;
    chosen.push(top); used.add(top.ch);
    for (const t of tDistinct) { best.set(t, Math.max(best.get(t), sim(top.ch, t))); if (dec(top.ch).m === dec(t).m) need.set(t, need.get(t) - 1); }
  }
  return chosen;
}
// 칸 배치(담금질): 행 · 열마다 앵커 수 고르게, 같은 타깃은 다른 행 · 열 · 이웃 금지, 같은 모음 앵커를 타깃 좌우(다음 위아래)에
function placeCells(targets, copies, anchors, seed) {
  const items = [...targets.flatMap((t) => Array(copies).fill({ ch: t, role: "target" })), ...anchors.map((a) => ({ ch: a.ch, role: "anchor" }))];
  if (items.length !== 36) throw new Error(`구제 장 칸이 36이 아니다(${items.length})`);
  const nA = anchors.length, lo = Math.floor(nA / 6), hi = Math.ceil(nA / 6), vowel = (x) => dec(x.ch).m;
  const at = (g, r, c) => (r < 0 || c < 0 || r > 5 || c > 5 ? null : g[r * 6 + c]);
  const off = (n) => (n < lo ? lo - n : n > hi ? n - hi : 0);
  function energy(g) {
    let bad = 0, sc = 0;
    for (let r = 0; r < 6; r++) { let n = 0; for (let c = 0; c < 6; c++) if (g[r * 6 + c].role === "anchor") n++; bad += 2 * off(n); }
    for (let c = 0; c < 6; c++) { let n = 0; for (let r = 0; r < 6; r++) if (g[r * 6 + c].role === "anchor") n++; bad += 2 * off(n); }
    if (copies > 1) for (const t of targets) {
      const pos = []; for (let k = 0; k < 36; k++) if (g[k].role === "target" && g[k].ch === t) pos.push(k);
      bad += (copies - new Set(pos.map((k) => Math.floor(k / 6))).size) + (copies - new Set(pos.map((k) => k % 6)).size);
      for (const k of pos) { const r = Math.floor(k / 6), c = k % 6; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && at(g, r + dr, c + dc)?.ch === t && at(g, r + dr, c + dc)?.role === "target") bad += 0.5; }
    }
    for (let k = 0; k < 36; k++) {
      const x = g[k]; if (x.role !== "target") continue;
      const r = Math.floor(k / 6), c = k % 6, v = vowel(x);
      const h = [at(g, r, c - 1), at(g, r, c + 1)].filter(Boolean), vv = [at(g, r - 1, c), at(g, r + 1, c)].filter(Boolean);
      const hA = h.filter((y) => y.role === "anchor"), vA = vv.filter((y) => y.role === "anchor");
      const hSame = hA.some((y) => vowel(y) === v), vSame = vA.some((y) => vowel(y) === v);
      if (hSame) sc += 5; else if (hA.some((y) => famGroup(vowel(y)) === famGroup(v) && famGroup(v) !== "plain")) sc += 2;
      if (vSame) sc += hSame ? 1 : 1.5;
      if (!hA.length && !vA.length) sc -= 3;
      if (h.some((y) => y.role === "target" && y.ch !== x.ch && vowel(y) === v)) sc -= 0.3;
    }
    return { bad, sc, e: bad * 100 - sc };
  }
  const rnd = rng(seed);
  let bestG = null, bestE = null;
  for (let restart = 0; restart < 10; restart++) {
    const g = [...items];
    for (let i = g.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [g[i], g[j]] = [g[j], g[i]]; }
    let cur = energy(g), temp = 30;
    for (let it = 0; it < 24000; it++) {
      const i = Math.floor(rnd() * 36), j = Math.floor(rnd() * 36);
      if (g[i].ch === g[j].ch && g[i].role === g[j].role) continue;
      [g[i], g[j]] = [g[j], g[i]];
      const nx = energy(g);
      if (nx.e <= cur.e || rnd() < Math.exp((cur.e - nx.e) / temp)) cur = nx; else [g[i], g[j]] = [g[j], g[i]];
      temp = Math.max(0.05, temp * 0.9996);
    }
    if (!bestE || (cur.bad < bestE.bad) || (cur.bad === bestE.bad && cur.e < bestE.e)) { bestE = cur; bestG = [...g]; }
  }
  return { cells: bestG, score: bestE };
}
export function planRescue({ miss, pool, A = 15, startNo = 1, sheetOrder = () => 0, seed = 20261123 }) {
  const used = new Set(), out = [];
  for (const [gi, group] of groupTargets(miss, A).entries()) {
    const copies = copiesFor(group.length, A), nA = 36 - group.length * copies;
    const anchors = pickAnchors(group, nA, pool, used, sheetOrder);
    if (anchors.length < nA) throw new Error(`앵커 후보가 모자란다(${anchors.length}/${nA}) — 통과한 본문 칸이 더 있어야 한다`);
    const { cells: g, score } = placeCells(group, copies, anchors, seed + gi * 7919);
    const id = `p${String(startNo + gi).padStart(2, "0")}`;
    const cells = g.map((x, k) => ({ rc: `${Math.floor(k / 6)}${k % 6}`, ch: x.ch, role: x.role }));
    const rows = Array.from({ length: 6 }, (_, r) => cells.slice(r * 6, r * 6 + 6).map((c) => c.ch).join(""));
    const src = new Map(anchors.map((a) => [a.ch, a]));
    out.push({
      id, kind: "rescue", grid: 6, rows, targets: group, ...(copies > 1 ? { copies } : {}), anchors: anchors.map((a) => a.ch),
      anchor_sources: cells.filter((c) => c.role === "anchor").map((c) => ({ ch: c.ch, sheet: src.get(c.ch).sheet, rc: src.get(c.ch).rc, placed: c.rc })),
      cells, print: true, placement: { score: r4(score.sc), constraints_broken: r4(score.bad) },
    });
  }
  return out;
}
// 배치 검사(redo --rescue 가 화면에 · 시험이 같은 식으로): 행 · 열 앵커 수, 같은 타깃 칸끼리 행 · 열 · 이웃
export function checkPlacement(s) {
  const nA = s.cells.filter((c) => c.role === "anchor").length, lo = Math.floor(nA / 6), hi = Math.ceil(nA / 6);
  const perRow = [0, 1, 2, 3, 4, 5].map((r) => s.cells.filter((c, k) => Math.floor(k / 6) === r && c.role === "anchor").length);
  const perCol = [0, 1, 2, 3, 4, 5].map((q) => s.cells.filter((c, k) => k % 6 === q && c.role === "anchor").length);
  const rep = [];
  for (const t of s.targets) {
    const pos = s.cells.map((c, k) => (c.role === "target" && c.ch === t ? k : -1)).filter((k) => k >= 0);
    if (pos.length < 2) continue;
    const rows = new Set(pos.map((k) => Math.floor(k / 6))).size, cols = new Set(pos.map((k) => k % 6)).size;
    const touch = pos.some((a) => pos.some((b) => a !== b && Math.abs(Math.floor(a / 6) - Math.floor(b / 6)) <= 1 && Math.abs((a % 6) - (b % 6)) <= 1));
    rep.push({ ch: t, n: pos.length, rows, cols, touch });
  }
  const wBan = new Set(s.targets.flatMap((t) => INTERFERE[dec(t).m] ?? []));
  return { perRow, perCol, lo, hi, rowsOk: perRow.every((n) => n >= lo && n <= hi), colsOk: perCol.every((n) => n >= lo && n <= hi), repeats: rep, repeatsOk: rep.every((x) => x.rows === x.n && x.cols === x.n && !x.touch), interfere: s.anchors.filter((a) => wBan.has(dec(a).m)) };
}

// =====================================================================================
// 2. 칸 그림 · 정규화 판 · 측정 (work/jrpg-myeongjo/rescue-6x6/scripts/lib6.mjs 를 옮긴 것)
//   정규화 판: 칸 한 변(선 사이 간격)을 P0 px 로 맞춘 칸 그림. 본문 칸(1배)과 6×6 칸을 같은 길로 옮긴다(칸 중심 = 판 중심, 가로 · 세로 같은 배율 → 장평 보존).
// =====================================================================================
export const SS = 4;
export async function loadGrey(file) {
  const sharp = await loadSharp();
  const { data, info } = await sharp(file).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, c = info.channels, g = new Uint8Array(w * h); // 채널 수는 늘 info.channels 로 읽는다(1채널로 넣어도 3채널로 나온다 — sharp 0.34 함정)
  for (let p = 0; p < w * h; p++) { const R = data[p * c], G = data[p * c + 1], B = data[p * c + 2]; g[p] = B - R > 18 ? 255 : Math.round((R + G + B) / 3); }
  return { g, w, h };
}
export async function greyPng(g, w, h) { const sharp = await loadSharp(); return sharp(Buffer.from(g.buffer, g.byteOffset, g.length), { raw: { width: w, height: h, channels: 1 } }).png().toBuffer(); }
export async function saveGrey(g, w, h, file) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, await greyPng(g, w, h)); }

// 칸 하나: cells/<장>/<칸>.png + 그 장 cells.json 의 선 좌표 → { g, w, h, pad, cw, ch, pitch }
const geomCache = new Map();
function sheetGeom(dir, sheet) {
  const key = P(dir, "cells", sheet, "cells.json");
  if (!geomCache.has(key)) {
    const cm = readJson(key, null);
    if (!cm?.check?.xs) throw new Error(`cells/${sheet}/cells.json 에 장 검사 선 좌표가 없다 — cut 을 먼저`);
    const { xs, ys } = cm.check, N = xs.length - 1;
    geomCache.set(key, { xs, ys, N, pitch: ((xs[N] - xs[0]) / N + (ys[N] - ys[0]) / N) / 2, cm });
  }
  return geomCache.get(key);
}
export async function loadCell(dir, sheet, rc) {
  const G = sheetGeom(dir, sheet), [r, c] = rcParse(rc);
  const img = await loadGrey(P(dir, "cells", sheet, `${rc}.png`));
  const cw = G.xs[c + 1] - G.xs[c], ch = G.ys[r + 1] - G.ys[r];
  return { ...img, pad: Math.round((cw - img.w) / 2), cw, ch, pitch: G.pitch, src: `${sheet}:${rc}`, N: G.N };
}
export function inkBox(g, w, h, thr = 150) {
  let x0 = w, x1 = -1, y0 = h, y1 = -1, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y * w + x] < thr) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return n ? { x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, n } : null;
}
const bil = (g, w, h, x, y) => {
  if (x < -1 || y < -1 || x > w || y > h) return 255;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= w || yy >= h ? 255 : g[yy * w + xx]);
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
};
function edt(isSeed, w, h) {
  const INF = 1e20, d2 = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) d2[i] = isSeed[i] ? 0 : INF;
  const n = Math.max(w, h), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const dt1 = (len) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) { let s; for (;;) { const p = v[k]; s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p); if (s > z[k]) break; k--; } k++; v[k] = q; z[k] = s; z[k + 1] = INF; }
    k = 0; for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  };
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = d2[y * w + x]; dt1(h); for (let y = 0; y < h; y++) d2[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = d2[y * w + x]; dt1(w); for (let x = 0; x < w; x++) d2[y * w + x] = d[x]; }
  return d2;
}
// 칸 그림 → 정규화 판(outP²). T = { sx, sy, tx, ty }(잉크 중심 기준 배율 · 이동), d = 획 보정(정규화 px, + 키움 / − 줄임 — 4배 세분 격자의 거리 변환)
export function render(cell, { outP, T = null, d = 0, center = null } = {}) {
  const f = outP / cell.pitch, H = outP * SS, hi = new Uint8Array(H * H);
  const { sx = 1, sy = 1, tx = 0, ty = 0 } = T ?? {};
  const c = center ?? { cx: outP / 2, cy: outP / 2 };
  for (let Y = 0; Y < H; Y++) {
    const yN = (Y + 0.5) / SS, v = (yN - c.cy - ty) / sy + c.cy, gy = (v - outP / 2) / f + cell.ch / 2 - cell.pad - 0.5;
    for (let X = 0; X < H; X++) {
      const xN = (X + 0.5) / SS, u = (xN - c.cx - tx) / sx + c.cx, gx = (u - outP / 2) / f + cell.cw / 2 - cell.pad - 0.5;
      hi[Y * H + X] = bil(cell.g, cell.w, cell.h, gx, gy) < 150 ? 1 : 0; // 잉크 문턱 150(hf.mjs glyphs 의 INK)
    }
  }
  let bin = hi;
  if (d) {
    const r2 = (Math.abs(d) * SS) ** 2;
    if (d > 0) { const dist = edt(hi, H, H); bin = new Uint8Array(H * H); for (let i = 0; i < H * H; i++) bin[i] = dist[i] <= r2 ? 1 : 0; }
    else { const bg = new Uint8Array(H * H); for (let i = 0; i < H * H; i++) bg[i] = hi[i] ? 0 : 1; const dist = edt(bg, H, H); bin = new Uint8Array(H * H); for (let i = 0; i < H * H; i++) bin[i] = hi[i] && dist[i] > r2 ? 1 : 0; }
  }
  const out = new Uint8Array(outP * outP);
  for (let y = 0; y < outP; y++) for (let x = 0; x < outP; x++) { let s = 0; for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) s += bin[(y * SS + j) * H + x * SS + i]; out[y * outP + x] = Math.round(255 * (1 - s / (SS * SS))); }
  return out;
}
// 잉크 측정(문턱 128): 상자 · 장평 · 획(2A/E — hf.mjs strokeUnits 와 같은 식) · 중심
export function metrics(g, w, h) {
  const ink = (x, y) => x >= 0 && y >= 0 && x < w && y < h && g[y * w + x] < 128;
  let A = 0, E = 0, x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink(x, y)) { A++; E += !ink(x - 1, y) + !ink(x + 1, y) + !ink(x, y - 1) + !ink(x, y + 1); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (!A) return null;
  const iw = x1 - x0 + 1, ih = y1 - y0 + 1;
  return { area: A, inkW: iw, inkH: ih, aspect: iw / ih, stroke: (2 * A) / E, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2, box: { x0, y0, x1: x1 + 1, y1: y1 + 1 } };
}
// 가로 연속 길이 = 세로획 굵기, 세로 연속 길이 = 가로획 굵기 → 대비(세로 ÷ 가로)
function stems(g, w, h) {
  const ink = (x, y) => g[y * w + x] < 128, hr = [], vr = [];
  for (let y = 0; y < h; y++) { let r = 0; for (let x = 0; x <= w; x++) { if (x < w && ink(x, y)) r++; else if (r) { hr.push(r); r = 0; } } }
  for (let x = 0; x < w; x++) { let r = 0; for (let y = 0; y <= h; y++) { if (y < h && ink(x, y)) r++; else if (r) { vr.push(r); r = 0; } } }
  return { vert: med(hr), horz: med(vr) };
}
export function pairRatios(m6, m12) {
  return { rH: m6.inkH / m12.inkH, rW: m6.inkW / m12.inkW, rA: m6.aspect / m12.aspect, rSabs: m6.stroke / m12.stroke, rS: m6.stroke / m6.inkH / (m12.stroke / m12.inkH), dCy: m12.cy - m6.cy, dCx: m12.cx - m6.cx };
}
export function summarize(pairs) {
  const k = (f) => med(pairs.map(f));
  return { n: pairs.length, rH: k((p) => p.rH), rW: k((p) => p.rW), rA: k((p) => p.rA), rS: k((p) => p.rS), rSabs: k((p) => p.rSabs), dCy: k((p) => p.dCy), dCx: k((p) => p.dCx) };
}
// 정규화 판 → 내보낼 칸 그림(본문 glyphs/ 의 2배 그림과 같은 관례: 선에서 PAD0 안쪽, 문턱 128 로 흑백)
export function cropBinary(g, P0, PAD0) {
  const w = P0 - 2 * PAD0, out = new Uint8Array(w * w);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) out[y * w + x] = g[(y + PAD0) * P0 + x + PAD0] < 128 ? 0 : 255;
  return { g: out, w, h: w };
}
// 정규화 판의 크기: 앵커 원본 장의 칸 간격(1배)의 2배 — 크리스털 명조(12×12 칸 151px)면 302 → 내보내는 칸 290×290
export const frameOf = (pitch, N) => { const P0 = 2 * Math.round(pitch); return { P0, PAD0: 2 * padOf(Math.round(pitch), N) }; };

// ---- 그림 도우미(SVG 글자 — 설치된 한글 글꼴)
const textW = (t, px) => Math.ceil([...String(t)].reduce((s, c) => s + (c.charCodeAt(0) < 0x2e80 ? 0.6 : 1.02), 0) * px + 12);
export const labelSvg = (t, px, color = "#222", w = null) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w ?? textW(t, px)}" height="${Math.ceil(px * 1.45)}"><text x="4" y="${Math.round(px * 1.08)}" font-size="${px}" font-family="${FONT_UI}" fill="${color}">${esc(t)}</text></svg>`);
const frameSvg = (W, H, extra = "") => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#bbb"/>${extra}</svg>`);
export async function compose(comps, file, minW, minH) {
  const sharp = await loadSharp();
  let Wd = minW, Hd = minH;
  for (const c of comps) { const m = await sharp(c.input).metadata(); Wd = Math.max(Wd, c.left + m.width + 10); Hd = Math.max(Hd, c.top + m.height + 10); }
  mkdirSync(path.dirname(file), { recursive: true });
  await sharp({ create: { width: Wd, height: Hd, channels: 3, background: "#ffffff" } }).composite(comps).png().toFile(file);
}
async function tile(g, P0, size, guide = null) {
  const sharp = await loadSharp();
  const base = await sharp(await greyPng(g, P0, P0)).resize(size, size, { kernel: "lanczos3" }).toColourspace("srgb").png().toBuffer();
  const k = size / P0, lines = guide ? [guide.y0, guide.y1].map((y) => `<line x1="0" x2="${size}" y1="${(y * k).toFixed(1)}" y2="${(y * k).toFixed(1)}" stroke="#e74c3c" stroke-width="1" stroke-dasharray="4 3"/>`).join("") + [guide.x0, guide.x1].map((x) => `<line y1="0" y2="${size}" x1="${(x * k).toFixed(1)}" x2="${(x * k).toFixed(1)}" stroke="#3498db" stroke-width="1" stroke-dasharray="4 3"/>`).join("") : "";
  return sharp(base).composite([{ input: frameSvg(size, size, lines) }]).png().toBuffer();
}

// =====================================================================================
// 3. 앵커 보정: cut <dir> pNN(그 뒤) · calibrate <dir> pNN
//   앵커 쌍(장 안의 앵커 칸 vs 본문 cells/ 원본)으로 ΔH · ΔAspect · ΔStroke(2A/E ÷ 높이) 중앙값 → 게이트 → 장 하나에 배율 하나(scaleX · scaleY · shiftY · 획 서브픽셀)
// =====================================================================================
export async function calibrateRescue(dir, s, { carrierCells = [] } = {}) {
  geomCache.clear();
  const errors = readJson(P(dir, "errors.json"), {});
  const cm = readJson(P(dir, "cells", s.id, "cells.json"), null);
  const outDir = P(dir, "calibrated", s.id);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const reject = (why, extra = {}) => { const rep = { sheet: s.id, at: new Date().toISOString(), verdict: "reject", why, ...extra }; writeJson(path.join(outDir, "rejected.json"), rep); return { pass: false, why, report: rep }; };
  if (!cm) return reject("자른 칸이 없다(cells.json 없음) — cut 먼저");
  if (!cm.check?.xs) return reject(`장 검사 ${cm.check?.verdict ?? "?"}(${cm.check?.reason ?? ""}) — 칸이 없다`);
  const errMap = errors[s.id] && typeof errors[s.id] === "object" ? errors[s.id] : {};
  const srcOf = new Map((s.anchor_sources ?? []).map((a) => [a.ch, a]));
  const cellsBy = new Map(cm.cells.map((c) => [c.rc, c]));
  const items = [];
  for (const p of s.cells) {
    const c = cellsBy.get(p.rc), mark = errMap[p.rc];
    const why = !c ? "칸 없음" : c.empty ? "빈 칸" : c.skip ? `장 검사(${c.skip})` : mark === "?" || mark === "" ? "errors.json ?" : mark != null ? `errors.json 다른 글자(${mark})` : null;
    if (why) { items.push({ ...p, excluded: why }); continue; }
    const it = { ...p, c6: await loadCell(dir, s.id, p.rc) };
    if (p.role === "anchor") {
      const a = srcOf.get(p.ch), bm = a ? errors[a.sheet] : null;
      if (!a || bm === "*" || (bm && typeof bm === "object" && bm[a.rc] != null) || !existsSync(P(dir, "cells", a.sheet, `${a.rc}.png`))) { items.push({ ...p, excluded: "앵커 원본 칸을 못 씀" }); continue; }
      it.c12 = await loadCell(dir, a.sheet, a.rc);
    }
    items.push(it);
  }
  const live = items.filter((x) => !x.excluded), anchors = live.filter((x) => x.role === "anchor");
  const excluded = items.filter((x) => x.excluded).map((x) => ({ rc: x.rc, ch: x.ch, role: x.role, why: x.excluded }));
  if (anchors.length < 5) return reject(`쓸 수 있는 앵커가 ${anchors.length}개뿐(5개 이상 필요)`, { excluded });
  const { P0, PAD0 } = frameOf(med(anchors.map((a) => a.c12.pitch)), anchors[0].c12.N);
  const norm = (cell, T = null, d = 0, center = null) => { const g = render(cell, { outP: P0, T, d, center }); return { g, m: metrics(g, P0, P0) }; };
  for (const it of live) { it.raw = norm(it.c6); it.center = it.raw.m ? { cx: it.raw.m.cx, cy: it.raw.m.cy } : null; if (it.c12) it.ref = norm(it.c12); }
  const good = anchors.filter((a) => a.raw.m && a.ref.m);
  const sumOf = (list, key) => summarize(list.map((x) => pairRatios(x[key].m, x.ref.m)));
  const before = sumOf(good, "raw");
  const gate = { aspect_dev: r4(before.rA - 1), stroke_dev: r4(before.rS - 1), aspect_limit: GATE.aspect, stroke_limit: GATE.stroke };
  gate.pass = Math.abs(before.rA - 1) <= GATE.aspect && Math.abs(before.rS - 1) <= GATE.stroke;
  gate.why = gate.pass ? "게이트 안" : [Math.abs(before.rA - 1) > GATE.aspect ? `장평 ${pct(before.rA - 1)}(한도 ±${GATE.aspect * 100}%)` : null, Math.abs(before.rS - 1) > GATE.stroke ? `획 ${pct(before.rS - 1)}(한도 ±${GATE.stroke * 100}%)` : null].filter(Boolean).join(" · ");
  const dev = (q) => (q ? { dH: r4(q.rH - 1), dAspect: r4(q.rA - 1), dStroke: r4(q.rS - 1), dStrokeAbs: r4(q.rSabs - 1), dCenterY_px: r4(q.dCy) } : null);
  let T = { sx: 1, sy: 1, tx: 0, ty: 0 }, d = 0, cur = before;
  const applied = { height: gate.pass, aspect: Math.abs(before.rA - 1) > TRIG.aspect, stroke: Math.abs(before.rS - 1) > TRIG.stroke, center: gate.pass };
  const history = [];
  if (gate.pass) {
    const measure = (TT, dd) => { for (const a of good) a.cur = norm(a.c6, TT, dd, a.center); return sumOf(good, "cur"); };
    for (let round = 0; round < 2; round++) {
      for (let k = 0; k < 3; k++) { // 기하(높이 · 장평 · 중심)
        T = { ...T, sy: T.sy / cur.rH, sx: applied.aspect ? T.sx / cur.rW : T.sx / cur.rH, ty: T.ty + cur.dCy };
        cur = measure(T, d); history.push({ step: `기하 ${round + 1}-${k + 1}`, T: { ...T }, d: r4(d), rH: r4(cur.rH), rA: r4(cur.rA), rS: r4(cur.rS) });
        if (Math.abs(cur.rH - 1) < 0.003 && (!applied.aspect || Math.abs(cur.rA - 1) < 0.003) && Math.abs(cur.dCy) < 0.5) break;
      }
      if (!applied.stroke) break;
      // 획: d 와 rS 의 관계를 할선법으로 — 중앙값이라 계단처럼 움직이므로 재 본 값 가운데 1 에 가장 가까운 d 를 쓴다
      const tried = [{ d, s: cur.rS, c: cur }];
      let d0 = d, s0 = cur.rS; const sAbs = med(good.map((a) => a.cur?.m?.stroke ?? a.raw.m.stroke));
      let d1 = d + (sAbs / s0 - sAbs) / 2;
      for (let k = 0; k < 5; k++) {
        const c1 = measure(T, d1); tried.push({ d: d1, s: c1.rS, c: c1 });
        history.push({ step: `획 ${round + 1}-${k + 1}`, T: { ...T }, d: r4(d1), rH: r4(c1.rH), rA: r4(c1.rA), rS: r4(c1.rS) });
        if (Math.abs(c1.rS - 1) < 0.004) break;
        const slope = (c1.rS - s0) / (d1 - d0), dn = Math.abs(slope) > 1e-4 ? d1 + (1 - c1.rS) / slope : d1 + (1 - c1.rS) * sAbs / 2;
        d0 = d1; s0 = c1.rS; d1 = dn;
      }
      const best = tried.reduce((a, b) => (Math.abs(b.s - 1) < Math.abs(a.s - 1) ? b : a));
      d = best.d; cur = best.c;
    }
  }
  // 모든 칸에 같은 값 하나 → calibrated/<장>/ (같은 글자가 여러 칸이면 rc-<칸>-uXXXX.png — 덮어쓰지 않는다)
  const nOf = new Map(); for (const p of s.cells) nOf.set(p.ch, (nOf.get(p.ch) ?? 0) + 1);
  const nameOf = (it) => `${nOf.get(it.ch) > 1 ? `rc-${it.rc}-` : ""}${uname(it.ch)}${it.role === "anchor" ? "-anchor" : ""}.png`;
  const glyphOut = [];
  if (gate.pass) for (const it of live) {
    if (!it.raw.m) continue;
    it.cal = norm(it.c6, T, d, it.center);
    const b = cropBinary(it.cal.g, P0, PAD0), m = metrics(b.g, b.w, b.h);
    if (!m) continue;
    const file = path.join(outDir, nameOf(it));
    await saveGrey(b.g, b.w, b.h, file);
    glyphOut.push({ ch: it.ch, role: it.role, rc: it.rc, file: path.basename(file), cell: { w: b.w, h: b.h }, ink: { x0: m.box.x0, x1: m.box.x1, y0: m.box.y0, y1: m.box.y1 } });
  }
  const after = gate.pass ? sumOf(good, "cal") : null;
  const residual = after ? r4(Math.abs(after.rH - 1) + Math.abs(after.rA - 1) + Math.abs(after.rS - 1)) : null;
  const perAnchor = good.map((a) => { const b = pairRatios(a.raw.m, a.ref.m), c = a.cal?.m ? pairRatios(a.cal.m, a.ref.m) : null; return { ch: a.ch, rc: a.rc, from: a.c12.src, before: { dH: r4(b.rH - 1), dAspect: r4(b.rA - 1), dStroke: r4(b.rS - 1) }, after: c ? { dH: r4(c.rH - 1), dAspect: r4(c.rA - 1), dStroke: r4(c.rS - 1) } : null }; });
  const report = {
    sheet: s.id, at: new Date().toISOString(), verdict: gate.pass ? "calibrated" : "reject",
    frame: { P0, PAD0, cell_px: P0 - 2 * PAD0, note: "정규화 판: 칸(선 사이) = P0px(앵커 원본 장 칸 간격의 2배). 본문 · 6×6 모두 가로 · 세로 같은 배율로 옮김. rS = (획 2A/E ÷ 잉크 높이)의 비" },
    gate, triggers: TRIG, applied,
    params: { scale_x: r4(T.sx), scale_y: r4(T.sy), shift_y_px: r4(T.ty), stroke_offset_px: r4(d), about: "글자마다 자기 잉크 중심을 기준으로, 앵커에서 정한 값 하나를 장 전체에 쓴다" },
    anchors_used: good.length, excluded, anchors_before: dev(before), anchors_after: dev(after), residual, per_anchor: perAnchor, search: history, glyphs: glyphOut,
  };
  // QA 그림 1: 앵커 [본문 | 보정 전 | 보정 후]
  const TS = 180, GAP = 10, BW = 3 * TS + 4 * GAP, LBL = 34, MET = 60, BH = LBL + TS + MET + GAP, COLS = 2, HEAD = 130, comps = [];
  const head = [`${s.id} — 앵커 비교 [본문 원본 | 6×6 보정 전 | 6×6 보정 후] · 점선 = 본문 원본의 잉크 위아래(빨강) · 좌우(파랑)`,
    `장 검사 ${cm.check.verdict} · 게이트 ${gate.pass ? "통과" : `리젝트(${gate.why})`} · 앵커 ${good.length}쌍 중앙값`,
    `보정 전 ΔH ${pct(before.rH - 1)} · ΔAspect ${pct(before.rA - 1)} · ΔStroke ${pct(before.rS - 1)}  →  보정 후 ${after ? `ΔH ${pct(after.rH - 1)} · ΔAspect ${pct(after.rA - 1)} · ΔStroke ${pct(after.rS - 1)}` : "(보정 안 함)"}`];
  head.forEach((l, i) => comps.push({ input: labelSvg(l, 20, i ? "#333" : "#111"), left: GAP, top: 6 + i * 32 }));
  for (const [k, a] of good.entries()) {
    const x = GAP + (k % COLS) * (BW + 20), y = HEAD + Math.floor(k / COLS) * BH;
    comps.push({ input: labelSvg(`${a.ch}  ${jamo(a.ch)}  [${a.rc}] · 원본 ${a.c12.src}`, 18, "#1a5276"), left: x, top: y + 2 });
    const gs = [a.ref.g, a.raw.g, a.cal?.g ?? a.raw.g];
    for (let j = 0; j < 3; j++) comps.push({ input: await tile(gs[j], P0, TS, a.ref.m.box), left: x + GAP + j * (TS + GAP), top: y + LBL });
    const b = pairRatios(a.raw.m, a.ref.m), c = a.cal?.m ? pairRatios(a.cal.m, a.ref.m) : null;
    comps.push({ input: labelSvg(`전  ΔH ${pct(b.rH - 1)}  ΔAsp ${pct(b.rA - 1)}  ΔStr ${pct(b.rS - 1)}`, 16, "#a04000"), left: x + GAP, top: y + LBL + TS + 4 });
    comps.push({ input: labelSvg(`후  ${c ? `ΔH ${pct(c.rH - 1)}  ΔAsp ${pct(c.rA - 1)}  ΔStr ${pct(c.rS - 1)}` : "보정 안 함"}`, 16, "#196f3d"), left: x + GAP, top: y + LBL + TS + 30 });
  }
  const cmpFile = P(dir, "review", `${s.id}-anchor-compare.png`);
  await compose(comps, cmpFile, COLS * (BW + 20) + GAP, HEAD + Math.ceil(good.length / COLS) * BH + GAP);
  // QA 그림 2: 섞어 쓰기(본문 글자 2자 + 구제 글자 1자) 24 · 48 · 96px + 48px 보정 전
  let ctxFile = null;
  const tCal = live.filter((x) => x.role === "target" && x.cal?.m);
  if (tCal.length) {
    ctxFile = P(dir, "review", `${s.id}-context-mix.png`);
    const carriers = [];
    for (const c of carrierCells) { try { carriers.push({ ch: c.ch, g: render(await loadCell(dir, c.sheet, c.rc), { outP: P0 }) }); } catch { /* 칸이 없으면 건너뛴다 */ } }
    await contextMix(tCal.map((t) => ({ ch: t.ch, g: t.cal.g, raw: t.raw.g })), carriers, P0, PAD0, ctxFile, `${s.id} 섞어 쓰기 — 본문 글자 사이에 6×6 보정 글자(${tCal.length}칸). 96px 줄의 빨간 밑줄 = 구제 글자 · 24px 줄은 표시 없음(눈가림 검수)`);
  }
  report.qa = { anchor_compare: `review/${s.id}-anchor-compare.png`, context_mix: ctxFile ? `review/${s.id}-context-mix.png` : null };
  if (gate.pass) writeJson(path.join(outDir, "calibrated.json"), report);
  else writeJson(path.join(outDir, "rejected.json"), report);
  return { pass: gate.pass, why: gate.why, report };
}
// 본문 글자(carriers: 정규화 판) 사이에 구제 글자를 끼운 글줄
export async function contextMix(targets, carriers, P0, PAD0, file, title) {
  const sharp = await loadSharp();
  const seq = []; let ci = 0;
  for (const t of targets) { for (let k = 0; k < 2 && carriers.length; k++) seq.push(carriers[ci++ % carriers.length]); seq.push({ ...t, six: true }); }
  const comps = [], WIDTH = 2000; let y = 10;
  comps.push({ input: labelSvg(title, 20, "#111"), left: 10, top: y }); y += 40;
  for (const [size, useRaw] of [[24, false], [48, false], [96, false], [48, true]]) {
    comps.push({ input: labelSvg(useRaw ? `${size}px — 비교용: 같은 6×6 글자의 보정 전` : `${size}px`, 16, useRaw ? "#a04000" : "#888"), left: 10, top: y }); y += 26;
    const k = size / (P0 - 2 * PAD0), lineH = Math.round(size * 1.35); let x = 10;
    for (const q of seq) {
      const b = cropBinary(useRaw && q.raw ? q.raw : q.g, P0, PAD0), m = metrics(b.g, b.w, b.h); if (!m) continue;
      const wPx = Math.max(1, Math.round(m.inkW * k)), adv = wPx + Math.round(size * 0.1);
      if (x + adv > WIDTH - 10) { x = 10; y += lineH; }
      const crop = await sharp(await greyPng(b.g, b.w, b.h)).extract({ left: m.box.x0, top: 0, width: m.inkW, height: b.h }).resize(wPx, Math.max(1, Math.round(b.h * k)), { kernel: "lanczos3" }).png().toBuffer();
      comps.push({ input: crop, left: x, top: y });
      if (q.six && size === 96) comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${wPx}" height="4"><rect width="${wPx}" height="4" fill="#e74c3c"/></svg>`), left: x, top: y + Math.round(b.h * k) + 2 });
      x += adv;
    }
    y += lineH + 18;
  }
  await compose(comps, file, WIDTH, y + 10);
}
// 섞어 쓰기에 쓸 본문 글자(통과한 칸) — 흔한 글자 문장
export const CARRIER = "고요한밤하늘아래용사는검을들고길을떠났다마을의종소리가멀리서울렸다";

// =====================================================================================
// 4. ref-2: 받은 본문 장의 가장 고른 6×6 영역(36칸)을 칸마다 같은 배율로 키워 2048 6×6 장으로(스케일-매칭)
// =====================================================================================
const SIZE = 2048, LINE_RGB = [0x7a, 0xb8, 0xe8], LINE_W = 3;
function gridLines(marginFrac) {
  const m = Math.round(SIZE * marginFrac), Pc = Math.round((SIZE - 2 * m) / 6), m2 = Math.round((SIZE - 6 * Pc) / 2);
  return { P: Pc, margin: m2, L: Array.from({ length: 7 }, (_, i) => m2 + i * Pc) };
}
function linesOver(grey, L) {
  const out = Buffer.alloc(SIZE * SIZE * 3);
  for (let p = 0; p < SIZE * SIZE; p++) out[p * 3] = out[p * 3 + 1] = out[p * 3 + 2] = grey[p];
  const half = (LINE_W - 1) / 2;
  for (const v of L) for (let dd = -half; dd <= half; dd++) {
    const q = v + dd;
    for (let t = L[0] - half; t <= L[6] + half; t++) for (const [x, y] of [[q, t], [t, q]]) { const i = (y * SIZE + x) * 3; out[i] = LINE_RGB[0]; out[i + 1] = LINE_RGB[1]; out[i + 2] = LINE_RGB[2]; }
  }
  return out;
}
const innerOf = (L, i) => [L[i] + (LINE_W + 1) / 2, L[i + 1] - (LINE_W + 1) / 2];
// 칸 그림 묶음 측정(같은 식으로 원본 영역 · ref-2 · ref-3 을 잰다)
function measureCells(cells, pitch) {
  const live = cells.filter((c) => c.box), ae = [], asp = [], cy = [], cx = [], vs = [], hs = [];
  for (const c of live) {
    const { w, h, g } = c, ink = (x, y) => x >= 0 && y >= 0 && x < w && y < h && g[y * w + x] < 128;
    let A = 0, E = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink(x, y)) { A++; E += !ink(x - 1, y) + !ink(x + 1, y) + !ink(x, y - 1) + !ink(x, y + 1); }
    ae.push(E ? (2 * A / E) / c.box.h : null); asp.push(c.box.w / c.box.h);
    cy.push((c.pad + (c.box.y0 + c.box.y1 + 1) / 2) / c.ch); cx.push((c.pad + (c.box.x0 + c.box.x1 + 1) / 2) / c.cw);
    const st = stems(g, w, h); vs.push(st.vert); hs.push(st.horz);
  }
  const gh = med(live.map((c) => c.box.h));
  return { cells: live.length, pitch: r4(pitch), glyph_height_px: gh, glyph_height_over_cell: r4(gh / pitch), glyph_width_over_cell: r4(med(live.map((c) => c.box.w)) / pitch), aspect_w_over_h: r4(med(asp)), stroke_over_height_2AE: r4(med(ae)), contrast_vert_over_horz: r4(med(vs) / med(hs)), ink_center_y_over_cell: r4(med(cy)), ink_center_x_over_cell: r4(med(cx)) };
}
async function cellsFromSheet(dir, sheet) {
  const G = sheetGeom(dir, sheet), out = [];
  for (const c of G.cm.cells) {
    const [r, q] = rcParse(c.rc), cell = await loadCell(dir, sheet, c.rc), b = inkBox(cell.g, cell.w, cell.h);
    out.push({ ...cell, r, c: q, rc: c.rc, ch_: c.ch, empty: c.empty, skip: c.skip, box: b ? { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, w: b.w, h: b.h } : null });
  }
  return out;
}
export async function makeRef2(dir, fmt, outFile) {
  geomCache.clear();
  const sharp = await loadSharp();
  const G = sheetGeom(dir, fmt), { xs, ys, N } = G, errors = readJson(P(dir, "errors.json"), {}), em = errors[fmt] && typeof errors[fmt] === "object" ? errors[fmt] : {};
  if (N < 6) throw new Error(`${fmt} 의 격자가 6 보다 작다`);
  const src = await sharp(P(dir, "inbox", `${fmt}.png`)).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const SW = src.info.width, SH = src.info.height, ch3 = src.info.channels, sd = src.data;
  const marginFrac = (xs[0] + (SW - xs[N]) + ys[0] + (SH - ys[N])) / 4 / SW;
  const { P: Pc, margin, L } = gridLines(marginFrac), k = Pc / G.pitch;
  const cellOk = new Map(G.cm.cells.map((c) => [c.rc, !c.empty && !c.skip && em[c.rc] == null]));
  // 가장 고른 영역: 칸 간격의 max/min 이 1 에 가깝고, 빈 칸 · 못 쓰는 칸 · 틀린 칸이 없는 곳
  let best = null;
  for (let r0 = 0; r0 <= N - 6; r0++) for (let c0 = 0; c0 <= N - 6; c0++) {
    const dy = ys.slice(r0 + 1, r0 + 7).map((v, i) => v - ys[r0 + i]), dx = xs.slice(c0 + 1, c0 + 7).map((v, i) => v - xs[c0 + i]);
    const even = Math.max(...dy, ...dx) / Math.min(...dy, ...dx);
    let bad = 0; for (let r = r0; r < r0 + 6; r++) for (let c = c0; c < c0 + 6; c++) if (!cellOk.get(N <= 10 ? `${r}${c}` : `${String(r).padStart(2, "0")}${String(c).padStart(2, "0")}`)) bad++;
    const score = -(even - 1) * 40 - bad * 3;
    if (!best || score > best.score) best = { r0, c0, even: r4(even), bad, score: r4(score) };
  }
  const greyOf = (i) => { const R = sd[i], Gc = sd[i + 1], B = sd[i + 2]; if (B - R > 18) return 255; const v = Math.round((R + Gc + B) / 3); return v >= 235 ? 255 : v; };
  const grey2 = Buffer.alloc(SIZE * SIZE, 255);
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
    const R0 = best.r0 + r, C0 = best.c0 + c, x0 = xs[C0], x1 = xs[C0 + 1], y0 = ys[R0], y1 = ys[R0 + 1], w = x1 - x0, h = y1 - y0;
    const g = Buffer.alloc(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = greyOf(((y0 + y) * SW + (x0 + x)) * ch3);
    const sw = Math.round(w * k), sh = Math.round(h * k);
    // sharp 1채널 함정: 1채널 raw 를 키운 뒤 raw() 는 3채널로 나올 수 있다 → 결과의 info.channels 로 읽는다
    const out = await sharp(g, { raw: { width: w, height: h, channels: 1 } }).resize(sw, sh, { kernel: "lanczos3", fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
    const big = Buffer.alloc(sw * sh); for (let p = 0; p < sw * sh; p++) big[p] = out.data[p * out.info.channels];
    const [ax, bx] = innerOf(L, c), [ay, by] = innerOf(L, r), cx = (L[c] + L[c + 1]) / 2, cy = (L[r] + L[r + 1]) / 2, ox = Math.round(cx - sw / 2), oy = Math.round(cy - sh / 2);
    for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) { const sx = x - ox, sy = y - oy; if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) continue; const v = big[sy * sw + sx]; grey2[y * SIZE + x] = v >= 235 ? 255 : v; }
  }
  mkdirSync(path.dirname(outFile), { recursive: true });
  await sharp(linesOver(grey2, L), { raw: { width: SIZE, height: SIZE, channels: 3 } }).png().toFile(outFile);
  // 검사: ref-2 장 검사(6×6) "됨" · 원본 영역과 같은 지표 ±3%
  const raw = await sharp(outFile).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const ck = checkSheet({ data: raw.data, W: SIZE, H: SIZE }, 6);
  const all = await cellsFromSheet(dir, fmt), region = all.filter((c) => c.r >= best.r0 && c.r < best.r0 + 6 && c.c >= best.c0 && c.c < best.c0 + 6);
  const mSrc = measureCells(region, G.pitch), mRef = ck.cells.length ? measureCells(ck.cells, ck.values.cell_pitch) : null;
  const keys = ["glyph_height_over_cell", "glyph_width_over_cell", "aspect_w_over_h", "stroke_over_height_2AE", "ink_center_y_over_cell"];
  const compare = mRef ? Object.fromEntries(keys.map((x) => [x, { source: mSrc[x], ref2: mRef[x], deviation: r4(mRef[x] / mSrc[x] - 1), within_3pct: Math.abs(mRef[x] / mSrc[x] - 1) <= 0.03 }])) : null;
  const report = {
    format_sheet: fmt, region: { rows: `${best.r0}~${best.r0 + 5}`, cols: `${best.c0}~${best.c0 + 5}`, r0: best.r0, c0: best.c0, evenness: best.even, bad_cells: best.bad, chars: Array.from({ length: 6 }, (_, r) => region.filter((c) => c.r === best.r0 + r).map((c) => c.ch_).join("")) },
    geometry: { size: SIZE, n: 6, margin_px: margin, pitch: Pc, line_px: LINE_W, line_rgb: "#7ab8e8", source_pitch: r4(G.pitch), scale_k: r4(k) },
    sheetcheck_n6: { verdict: ck.verdict, reason: ck.reason, lines: ck.lines, values: ck.values ?? null },
    measure: { source: mSrc, ref2: mRef }, compare,
    pass: ck.verdict === "됨" && !!compare && compare.glyph_height_over_cell.within_3pct,
  };
  return report;
}

// =====================================================================================
// 5. ref-3: 같은 격자 · 같은 글자 높이의 활자 구조 참조. print 는 시스템 폰트 후보 가운데 본문의 획 ÷ 높이(2A/E) · 세로/가로 대비에 가장 가까운 것,
//    hand 는 예전처럼 고딕(설치된 한글 고딕 — SVG 글꼴 이름), --ref-font <파일> 이면 그 파일. 폰트 파일은 읽기만 한다(설치 없음).
//    pango 가변 폰트 굵기는 글꼴 이름의 "@wght=" 가 아니라 <span font_weight="..."> 로 준다(크리스털 실측 — @wght 는 무시됐다).
// =====================================================================================
// 폰트 파일의 이름(name ID 1/16) · 굵기(OS/2) · 가변(fvar) · cmap(형식 4 · 12) — 설치 없이 파일만 읽는다
export function fontInfo(file) {
  const b = readFileSync(file);
  let off = 0;
  if (b.toString("latin1", 0, 4) === "ttcf") off = b.readUInt32BE(12);
  const nt = b.readUInt16BE(off + 4), tables = {};
  for (let i = 0; i < nt; i++) { const r = off + 12 + i * 16; tables[b.toString("latin1", r, r + 4)] = { o: b.readUInt32BE(r + 8), n: b.readUInt32BE(r + 12) }; }
  let family = null;
  if (tables.name) {
    const t = tables.name.o, count = b.readUInt16BE(t + 2), so = t + b.readUInt16BE(t + 4), names = [];
    for (let i = 0; i < count; i++) {
      const r = t + 6 + i * 12, pid = b.readUInt16BE(r), lid = b.readUInt16BE(r + 4), nid = b.readUInt16BE(r + 6), len = b.readUInt16BE(r + 8), o = so + b.readUInt16BE(r + 10);
      if (nid !== 1 && nid !== 16) continue;
      if (pid === 3) { let s = ""; for (let j = 0; j < len; j += 2) s += String.fromCharCode(b.readUInt16BE(o + j)); names.push({ nid, en: lid === 0x409, s }); }
      else if (pid === 1) names.push({ nid, en: lid === 0, s: b.toString("latin1", o, o + len) });
    }
    family = (names.find((x) => x.nid === 1 && x.en) ?? names.find((x) => x.nid === 16 && x.en) ?? names[0])?.s ?? null;
  }
  const weight = tables["OS/2"] ? b.readUInt16BE(tables["OS/2"].o + 4) : 400;
  const subs = [];
  if (tables.cmap) {
    const t = tables.cmap.o, n = b.readUInt16BE(t + 2);
    for (let i = 0; i < n; i++) { const r = t + 4 + i * 8, pid = b.readUInt16BE(r), eid = b.readUInt16BE(r + 2), so = t + b.readUInt32BE(r + 4); subs.push({ pid, eid, so, fmt: b.readUInt16BE(so) }); }
  }
  const sub = subs.find((x) => x.fmt === 12 && (x.pid === 3 || x.pid === 0)) ?? subs.find((x) => x.fmt === 4 && x.pid === 3 && x.eid === 1) ?? subs.find((x) => x.fmt === 4);
  const has = (cp) => {
    if (!sub) return false;
    const st = sub.so;
    if (sub.fmt === 12) { const ng = b.readUInt32BE(st + 12); for (let i = 0; i < ng; i++) { const g = st + 16 + i * 12, s0 = b.readUInt32BE(g), e0 = b.readUInt32BE(g + 4); if (cp >= s0 && cp <= e0) return b.readUInt32BE(g + 8) + (cp - s0) !== 0; } return false; }
    if (cp > 0xffff) return false;
    const segX2 = b.readUInt16BE(st + 6), ends = st + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ros = deltas + segX2;
    for (let i = 0; i < segX2 / 2; i++) {
      const e = b.readUInt16BE(ends + 2 * i); if (cp > e) continue;
      const s0 = b.readUInt16BE(starts + 2 * i); if (cp < s0) return false;
      const delta = b.readInt16BE(deltas + 2 * i), ro = b.readUInt16BE(ros + 2 * i);
      if (!ro) return ((cp + delta) & 0xffff) !== 0;
      const gid = b.readUInt16BE(ros + 2 * i + ro + 2 * (cp - s0));
      return gid !== 0;
    }
    return false;
  };
  return { file, family, weight, variable: !!tables.fvar, has };
}
const SERIF_FILES = ["HANBatangB.ttf", "HANBatang.ttf", "NotoSerifKR-VF.ttf", "batang.ttc", "AppleMyungjo.ttf", "NanumMyeongjoBold.ttf", "NanumMyeongjo.ttf", "NanumMyeongjoExtraBold.ttf", "NotoSerifCJK-Regular.ttc", "NotoSerifCJK-Bold.ttc", "NotoSerifKR-Regular.otf", "NotoSerifKR-Bold.otf"];
const SANS_FILES = ["malgun.ttf", "malgunbd.ttf", "NotoSansKR-VF.ttf", "AppleSDGothicNeo.ttc", "NanumGothic.ttf", "NanumGothicBold.ttf", "NotoSansCJK-Regular.ttc", "NotoSansCJK-Bold.ttc", "gulim.ttc"];
function fontDirs() {
  const h = os.homedir(), d = [];
  if (process.platform === "win32") d.push(path.join(process.env.WINDIR ?? "C:\\Windows", "Fonts"), ...(process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, "Microsoft", "Windows", "Fonts")] : []));
  else if (process.platform === "darwin") d.push("/System/Library/Fonts", "/System/Library/Fonts/Supplemental", "/Library/Fonts", path.join(h, "Library", "Fonts"));
  else d.push("/usr/share/fonts", "/usr/local/share/fonts", path.join(h, ".fonts"), path.join(h, ".local", "share", "fonts"));
  return d.filter((x) => existsSync(x));
}
function findFonts(names) {
  const want = new Map(names.map((n) => [n.toLowerCase(), n])), found = new Map();
  const walk = (d, depth) => { let ents; try { ents = readdirSync(d); } catch { return; } for (const e of ents) { const f = path.join(d, e); if (want.has(e.toLowerCase())) { if (!found.has(e.toLowerCase())) found.set(e.toLowerCase(), f); continue; } if (depth > 0) { try { if (statSync(f).isDirectory()) walk(f, depth - 1); } catch { /* 건너뛴다 */ } } } };
  for (const d of fontDirs()) walk(d, 3);
  return names.map((n) => found.get(n.toLowerCase())).filter(Boolean);
}
// 글자 하나를 그린 흰 바탕 회색 그림. font = { file, family, weight } 이면 그 파일(pango), 아니면 SVG 글꼴 이름(FONT_UI — 예전 고딕)
async function renderChar(font, ch, px) {
  const sharp = await loadSharp();
  let data, info;
  if (font?.file) ({ data, info } = await sharp({ text: { text: `<span foreground="#000000" font_weight="${font.weight ?? 400}">${esc(ch)}</span>`, font: `${font.family} ${px}px`, fontfile: font.file, rgba: true, dpi: 72 } }).raw().toBuffer({ resolveWithObject: true }));
  else { const S = Math.round(px * 1.6); ({ data, info } = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="100%" height="100%" fill="#fff"/><text x="${S / 2}" y="${Math.round(px * 1.15)}" text-anchor="middle" font-size="${px}" font-family="${FONT_UI}" fill="#000">${esc(ch)}</text></svg>`)).raw().toBuffer({ resolveWithObject: true })); }
  const w = info.width, h = info.height, c = info.channels, g = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = font?.file ? 255 - data[i * c + 3] : Math.round((data[i * c] + data[i * c + 1] + data[i * c + 2]) / 3);
  return { g, w, h, box: inkBox(g, w, h, 128) };
}
async function fontStyle(font, chars) {
  const ss = [];
  for (const ch of chars) { const r = await renderChar(font, ch, 200); if (!r.box) continue; const m = metrics(r.g, r.w, r.h), st = stems(r.g, r.w, r.h); ss.push({ s: m.stroke / m.inkH, c: st.vert / st.horz }); }
  return { stroke_over_height_2AE: r4(med(ss.map((x) => x.s))), contrast_vert_over_horz: r4(med(ss.map((x) => x.c))) };
}
// 폰트 고르기: 후보마다 같은 10자(겹모음 · 겹받침이 든 드문 글자 — 크리스털 font_probe 와 같은 글자)를 200px 로 그려 잰 값과 본문 원본 영역의 값을 견준다.
//   후보는 그 장의 36자가 모두 cmap 에 있는 폰트만. 잰 값은 cache(style/ref-3-fonts.json — hf.mjs 가 읽고 쓴다)에 남겨 다음 장에서 다시 재지 않는다.
const PROBE = [..."륩쇘꿱닯쟎쏀읠뀀횹쒔"];
export async function chooseRefFont({ kind, refFont = null, body, chars, cache = {} }) {
  const need = [...new Set(chars)];
  const styleOf = async (f) => { const k = `${f.file.replace(/\\/g, "/")}|${f.weight}|${statSync(f.file).size}`; if (!cache[k]) { const fi = fontInfo(f.file); cache[k] = await fontStyle(f, PROBE.filter((c) => fi.has(c.codePointAt(0)))); } return cache[k]; };
  const weightsOf = (fi) => (fi.variable ? [400, 600, 700, 900] : [fi.weight]);
  if (refFont) {
    if (!existsSync(refFont)) throw new Error(`--ref-font 파일이 없다: ${refFont}`);
    const fi = fontInfo(refFont), missing = need.filter((c) => !fi.has(c.codePointAt(0)));
    if (!fi.family) throw new Error(`--ref-font ${path.basename(refFont)} 에서 글꼴 이름(name 표)을 못 읽었다`);
    if (missing.length) throw new Error(`--ref-font ${path.basename(refFont)} 에 없는 글자 ${missing.length}개(${missing.slice(0, 10).join("")}) — 다른 폰트를 준다`);
    let best = null;
    for (const w of weightsOf(fi)) { const f = { file: refFont, family: fi.family, weight: w }, st = await styleOf(f), dist = r4(styleDist(st, body)); if (!best || dist < best.dist) best = { ...f, ...st, dist }; }
    return { by: "--ref-font", font: { file: refFont, family: fi.family, weight: best.weight }, measured: best, body, candidates: [] };
  }
  if (kind !== "print") return { by: "hand — 예전처럼 기본 고딕(SVG 글꼴 이름)", font: null, body, candidates: [] };
  const cands = [];
  for (const f of findFonts([...SERIF_FILES, ...SANS_FILES])) {
    let fi; try { fi = fontInfo(f); } catch { continue; }
    if (!fi.family) continue;
    const missing = need.filter((c) => !fi.has(c.codePointAt(0)));
    if (missing.length) { cands.push({ file: f, family: fi.family, skipped: `cmap 에 없는 글자 ${missing.length}개(${missing.slice(0, 6).join("")})` }); continue; }
    for (const w of weightsOf(fi)) {
      const font = { file: f, family: fi.family, weight: w };
      try { const st = await styleOf(font); cands.push({ ...font, ...st, dist: r4(styleDist(st, body)) }); } catch (e) { cands.push({ ...font, skipped: `그리지 못함(${String(e.message).slice(0, 60)})` }); }
    }
  }
  const ok = cands.filter((c) => c.dist != null).sort((x, y) => x.dist - y.dist);
  if (!ok.length) return { by: "후보 폰트를 못 찾아 기본 고딕(SVG 글꼴 이름)", font: null, body, candidates: cands };
  const b = ok[0];
  return { by: "본문 원본 영역의 획 ÷ 높이(2A/E) · 세로/가로 대비에 가장 가까운 후보", font: { file: b.file, family: b.family, weight: b.weight }, measured: b, body, candidates: cands.map((c) => ({ ...c, file: c.file.replace(/\\/g, "/") })) };
}
const styleDist = (st, body) => Math.abs(Math.log(st.stroke_over_height_2AE / body.stroke_over_height_2AE)) + 0.5 * Math.abs(Math.log(st.contrast_vert_over_horz / body.contrast_vert_over_horz));
// ref-3 그리기: ref-2 와 같은 격자 · 여백 · 선, 글자 잉크 높이 중앙값 = ref-2 의 것, 잉크 중심 = ref-2 의 중앙값
export async function makeRef3(choice, rows, ref2, outFile) {
  const sharp = await loadSharp();
  const chars = [...rows.join("")], L = Array.from({ length: 7 }, (_, i) => ref2.geometry.margin_px + i * ref2.geometry.pitch), Pc = ref2.geometry.pitch;
  const targetH = ref2.measure.ref2.glyph_height_px, cyT = ref2.measure.ref2.ink_center_y_over_cell, cxT = ref2.measure.ref2.ink_center_x_over_cell;
  const probe = []; for (const c of chars) probe.push(await renderChar(choice.font, c, 200));
  const px = Math.round(200 * targetH / med(probe.filter((p) => p.box).map((p) => p.box.h)));
  const rs = []; for (const c of chars) rs.push(await renderChar(choice.font, c, px));
  const topOff = med(rs.filter((q) => q.box).map((q) => (q.box.y0 + q.box.y1 + 1) / 2));
  const grey = Buffer.alloc(SIZE * SIZE, 255);
  rs.forEach((q, kk) => {
    if (!q.box) return;
    const r = Math.floor(kk / 6), c = kk % 6, [ax, bx] = innerOf(L, c), [ay, by] = innerOf(L, r);
    const oy = Math.round(L[r] + cyT * Pc - topOff), ox = Math.round(L[c] + cxT * Pc - (q.box.x0 + q.box.x1 + 1) / 2);
    for (let y = 0; y < q.h; y++) for (let x = 0; x < q.w; x++) { const X = ox + x, Y = oy + y; if (X < ax || X >= bx || Y < ay || Y >= by) continue; const v = q.g[y * q.w + x]; if (v < grey[Y * SIZE + X]) grey[Y * SIZE + X] = v; }
  });
  mkdirSync(path.dirname(outFile), { recursive: true });
  await sharp(linesOver(grey, L), { raw: { width: SIZE, height: SIZE, channels: 3 } }).png().toFile(outFile);
  const raw = await sharp(outFile).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const ck = checkSheet({ data: raw.data, W: SIZE, H: SIZE }, 6), m3 = ck.cells.length ? measureCells(ck.cells, ck.values.cell_pitch) : null;
  const cmapMissing = choice.font ? (() => { const fi = fontInfo(choice.font.file); return [...new Set(chars)].filter((c) => !fi.has(c.codePointAt(0))); })() : null;
  return { px, font: choice.font ? { ...choice.font, file: choice.font.file.replace(/\\/g, "/") } : { svg_family: FONT_UI }, by: choice.by, sheetcheck_n6: ck.verdict, lines: `${ck.lines.vertical}/${ck.lines.horizontal}`, blank: ck.cells_check?.blank ?? null, crossing: ck.cells_check?.crossing ?? null, height_over_cell: m3?.glyph_height_over_cell ?? null, height_vs_ref2: m3 ? r4(m3.glyph_height_over_cell / ref2.measure.ref2.glyph_height_over_cell - 1) : null, cmap_missing: cmapMissing };
}

// =====================================================================================
// 6. 구제 장 프롬프트(크리스털 p01~p06 의 문안을 일반화). print 면 손글씨 낱말 0, hand 면 손글씨 문장.
//    겹받침 타깃이 없으면 일반 겹받침 경고를 빼고 "홑받침에 ㄹ 을 덧붙이지 않는다"를 넣는다. 고위험 자모(ㄱ+ㅛ · ㅍ+ㅖ · ㅙ · ㅠ+ㅂ · ㅝ)는 칸 좌표로.
// =====================================================================================
const RISKS = [
  { id: "ㄱ+ㅛ", hit: (d) => (d.i === "ㄱ" || d.i === "ㄲ") && d.m === "ㅛ", hint: "TWO short vertical strokes of ㅛ standing on its bar under ㄱ (not ㅗ with one stroke)" },
  { id: "ㅍ+ㅖ", hit: (d) => d.i === "ㅍ" && d.m === "ㅖ", hint: "ㅖ after ㅍ has TWO short ticks pointing left and TWO long vertical strokes (not ㅔ, not ㅕ)" },
  { id: "ㅙ", hit: (d) => d.m === "ㅙ", hint: "ㅙ = ㅗ + ㅐ: a bar with ONE short upward stroke, then TWO vertical strokes on the right joined by a crossbar (keep the upward ㅗ stroke)" },
  { id: "ㅠ+ㅂ", hit: (d) => d.m === "ㅠ" && d.f === "ㅂ", hint: "ㅠ has TWO short legs under its bar, with a clear white gap above the final ㅂ (do not merge the legs into ㅂ, not ㅡ)" },
  { id: "ㅝ", hit: (d) => d.m === "ㅝ", hint: "ㅝ = ㅜ + ㅓ: a bar with ONE downward leg, then a long vertical stroke on the right with ONE short tick pointing left (not ㅟ — keep the ㅓ tick)" },
];
const KEY_JAMO = [
  ["ㅛ (TWO short strokes on its bar)", (d) => d.m === "ㅛ"], ["ㅠ (TWO legs hanging under the bar)", (d) => d.m === "ㅠ"],
  ["ㅙ (ㅗ + ㅐ: a bar with one short upward stroke, then TWO vertical strokes on the right joined by a crossbar)", (d) => d.m === "ㅙ"],
  ["ㅞ (ㅜ + ㅔ: a bar with one downward leg, then TWO vertical strokes on the right)", (d) => d.m === "ㅞ"],
  ["ㅝ (ㅜ + ㅓ: a bar with one downward leg, then a long vertical stroke with ONE short tick pointing left)", (d) => d.m === "ㅝ"],
  ["ㅖ (TWO short side ticks pointing left, and TWO long vertical strokes)", (d) => d.m === "ㅖ"], ["ㅒ (TWO short side ticks pointing right, and TWO long vertical strokes)", (d) => d.m === "ㅒ"],
  ["ㅢ (ㅡ + ㅣ)", (d) => d.m === "ㅢ"], ["final ㅆ (double ㅅ)", (d) => d.f === "ㅆ"],
  ["a final made of two consonants (written side by side, the first one on the left)", (d) => DOUBLE_F.has(d.f)],
];
export function rescuePrompt(s, cfg, ref2) {
  const pr = kindOf(cfg) === "print", style = cfg.style_text;
  const hPct = Math.round(ref2.measure.ref2.glyph_height_over_cell * 100), wPct = Math.round(ref2.measure.ref2.glyph_width_over_cell * 100);
  const chars = [...s.rows.join("")], uniq = [...new Set(chars)], targets = s.targets, tset = new Set(targets);
  const posAll = (ch) => chars.map((c, i) => (c === ch && s.cells[i].role === (tset.has(ch) ? "target" : "anchor") ? `Row ${Math.floor(i / 6) + 1}, Col ${(i % 6) + 1}` : null)).filter(Boolean);
  const where = (ch) => `(${posAll(ch).join("), (")})`;
  const anyDouble = targets.some((t) => DOUBLE_F.has(dec(t).f));
  const lines = [
    pr ? "Reference 1 is a lettering sample (a printed typeface). Reference 2 is an earlier sheet in the same typeface, shown in the exact target format of this sheet: a 6x6 grid, and exactly how big, how wide and how heavy this typeface's characters are inside each cell."
      : "Reference 1 is a handwriting sample. Reference 2 is an earlier sheet by the same hand, shown in the exact target format of this sheet: a 6x6 grid, and exactly how big, how wide and how heavy these characters are inside each cell.",
    pr ? `Draw a new sheet in EXACTLY the same typeface: ${style}. Same stroke weight, contrast, serifs, proportions and slant, as if set from the same font file. A character that appears in several cells has exactly the same shape in every one of them, as printed type does.`
      : `Write a new sheet in EXACTLY the same handwriting: ${style}. Same stroke weight, letter proportions, roundness and slant, as if the same person wrote it with the same pen on the same day.`,
    `Size and proportion lock: copy reference 2 exactly. Each syllable is about ${hPct}% of the cell height and about ${wPct}% of the cell width, the same width-to-height proportion as in reference 2 — do not stretch characters wider or squeeze them narrower. Stroke thickness relative to the character height${pr ? ", the contrast between thick and thin strokes, and the size of the serifs are" : " and the contrast of the strokes are"} the same as in reference 2. These cells are larger than the cells of the earlier sheets; that does NOT make the letters heavier, bolder, wider or larger relative to the cell — ${pr ? "they are the same type, only printed bigger" : "they are the same letters, only written bigger"}.`,
    "Layout exactly like reference 2: a square sheet of plain white paper seen flat from directly above like a clean scan, a 6x6 grid of equal square cells drawn with thin light-blue lines, filling the sheet with a small even margin. Black ink; only the grid lines are light blue.",
    "No other text: no labels, no numbers outside the listed ones, no titles. No drawings, no shadows, no decorations. Do NOT copy the characters of reference 2; write only the characters listed below.",
    pr ? "Reference 3 shows the same 36 characters in a standard typeface, cell for cell in the same grid: use it only for the jamo structure of each cell (count the short strokes and ticks of each vowel, the vertical strokes of compound vowels such as ㅙ ㅝ ㅖ, and the exact final consonant of each cell). Keep the typeface of references 1 and 2 for stroke weight, serifs, letter width and size — never copy the letter shapes or the heavier strokes of reference 3."
      : "Reference 3 is NOT handwriting: it shows the very same 36 characters printed in a standard typeface, cell for cell in the same grid. Use it only for the jamo structure of each cell (count the short strokes and ticks of each vowel, the vertical strokes of compound vowels such as ㅙ ㅝ ㅖ, and the exact final consonant of each cell), but draw every stroke in the handwriting of references 1 and 2 — never copy the printed letter shapes.",
    `Each cell holds ONE Hangul syllable, centered, upright, about the same size in every cell (roughly ${hPct}% of the cell height, as in reference 2).`,
    "Cells row by row from the top, left to right within each row. Write exactly these syllables, every jamo correct (check each final consonant and each vowel stroke):",
    ...s.rows.map((r, i) => `Row ${i + 1}: ${[...r].join(" ")}`),
    "Spelling check. Do NOT write this list on the sheet; it only spells out the jamo of each syllable above:",
    uniq.map((c) => `${c} = ${jamo(c)}`).join(", "),
  ];
  const key = KEY_JAMO.map(([what, f]) => [what, uniq.filter((c) => tset.has(c) && f(dec(c)))]).filter(([, hit]) => hit.length);
  if (key.length) lines.push("Key jamo of the hard syllables on this sheet (look at reference 3 for these cells):", ...key.map(([what, hit]) => `- ${what}: ${hit.join(" ")}`));
  if ((s.copies ?? 1) > 1) lines.push(`Each hard syllable on this sheet appears in ${s.copies} cells (Row = row from the top, Col = column from the left, both counted from 1); draw ALL copies correctly and identically. Every other cell is a correctly spelled syllable — look at the ones with the same vowel.`);
  const risk = [];
  for (const t of targets) { const d = dec(t); for (const r of RISKS) if (r.hit(d)) { const fam = uniq.filter((c) => !tset.has(c) && dec(c).m === d.m); risk.push(`- ${t} = ${jamo(t)} at ${where(t)}: ${r.hint}.${fam.length ? ` Compare with ${fam.map((c) => `${c} ${where(c)}`).join(", ")} on this sheet.` : ""}`); } }
  if (risk.length) lines.push("Cell-by-cell notes for the riskiest syllables:", ...risk);
  lines.push(anyDouble
    ? "Reminders: ㅠ has TWO downward legs under its bar and ㅛ TWO short strokes above its bar (do not reduce them to ㅡ, ㅜ or ㅗ); ㅑ ㅕ ㅒ ㅖ have two short side strokes; a final made of two consonants (ㄳ ㄵ ㄶ ㄺ ㄻ ㄼ ㄽ ㄾ ㄿ ㅀ ㅄ) is written as exactly those two consonants side by side, the first one on the left."
    : "Reminders: ㅠ has TWO downward legs under its bar and ㅛ TWO short strokes above its bar (do not reduce them to ㅡ, ㅜ or ㅗ); ㅑ ㅕ ㅒ ㅖ have two short side strokes; ㅙ keeps its short upward ㅗ stroke and ㅝ its short ㅓ tick.",
  );
  if (!anyDouble) lines.push("Every final consonant on this sheet is a single consonant: write exactly the one final shown, and never add an extra ㄹ (or any second consonant) beside or under it.");
  lines.push("These syllables were miswritten several times before. Look at every syllable twice before writing it.",
    `Common mistakes to avoid: writing ㅠ or ㅛ with only ONE leg/stroke (that makes ㅜ or ㅗ); drawing ㅁ as a round circle (${pr ? "ㅁ is a square box with flat sides and corners" : "ㅁ is a rounded SQUARE box with flat sides"}, ㅇ is a circle); doubling a single final ㅅ into ㅆ;${anyDouble ? " writing ㄻ (ㄹ+ㅁ box) or ㄶ (ㄴ+ㅎ) as ㄹ+ㅂ;" : ""} dropping the extra vertical stroke of ㅐ ㅔ ㅙ ㅞ ㅖ; dropping the short ㅗ stroke of ㅙ or the short ㅓ tick of ㅝ.`);
  return lines.join("\n");
}

// =====================================================================================
// 7. 프롬프트 대조(verify-prompt): 보내기 전(prompt.txt = sheets.json · 손글씨 낱말 · 자모 풀이 · ref_sha256) · 보낸 뒤(--echo 서버 echo 와 칸 하나씩)
// =====================================================================================
export const HAND_WORDS = /handwrit|hand-drawn|by hand|same hand|this hand|same person|same pen|the hand would|by one person|look handwritten|cursive/i; // T12 와 같은 정규식
export function rowsOfText(text) {
  const rows = {};
  for (const line of String(text).split(/\r?\n/)) { const m = line.match(/^\s*Row\s+(\d+)\s*:\s?(.*)$/); if (m && rows[+m[1]] == null) rows[+m[1]] = [...m[2].replace(/\s+/g, "")]; }
  return rows;
}
export function diffRows(want, got, N) {
  const out = [];
  for (let r = 1; r <= N; r++) {
    const x = want[r] ?? [], y = got[r];
    if (!y) { for (let i = 0; i < x.length; i++) out.push({ row: r, col: i + 1, want: x[i], got: null }); continue; }
    for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) out.push({ row: r, col: i + 1, want: x[i] ?? null, got: y[i] ?? null });
  }
  for (const k of Object.keys(got)) if (+k > N) out.push({ row: +k, col: null, want: null, got: got[k].join("") });
  return out;
}
export function findPromptText(raw) {
  try {
    const j = JSON.parse(raw), hits = [];
    const walk = (v) => { if (typeof v === "string") { if (/Row\s+1\s*:/.test(v)) hits.push(v); } else if (v && typeof v === "object") for (const x of Object.values(v)) walk(x); };
    walk(j); return hits[0] ?? null;
  } catch { return /Row\s+1\s*:/.test(raw) ? raw : null; }
}
export function verifyJob({ dir, s, cfg, sha256Of, echoRaw = null }) {
  const d = P(dir, "jobs", s.id), txt = readFileSync(path.join(d, "prompt.txt"), "utf8"), job = readJson(path.join(d, "job.json"), null), N = s.rows.length;
  const want = Object.fromEntries(s.rows.map((r, i) => [i + 1, [...r]]));
  const rowDiff = diffRows(want, rowsOfText(txt), N);
  const style = cfg.style_text ?? "";
  const hand = kindOf(cfg) === "print" ? txt.split(/\r?\n/).map((l, i) => [i + 1, l]).filter(([, l]) => HAND_WORDS.test(style ? l.split(style).join("") : l)) : [];
  // 자모 풀이: "가 = ㄱ + ㅏ, …" 줄이 있으면 쌍마다 맞는지, 그 장의 한글이 모두 들었는지
  const spellLine = txt.split(/\r?\n/).find((l) => /^\S = [ㄱ-ㅎ]/.test(l)) ?? null, spellBad = [];
  if (spellLine) {
    const pairs = new Map(spellLine.split(", ").map((p) => p.split(" = ")));
    for (const [c, j] of pairs) if (!isHangul(c) || jamo(c) !== j) spellBad.push(`${c} = ${j}(맞는 풀이 ${isHangul(c) ? jamo(c) : "한글 아님"})`);
    for (const c of new Set(s.rows.join(""))) if (isHangul(c) && !pairs.has(c)) spellBad.push(`${c} 풀이 없음`);
  }
  const hashBad = !job ? ["job.json 없음"] : (job.refs ?? []).filter((f) => !existsSync(path.join(d, f)) || sha256Of(path.join(d, f)) !== job.ref_sha256?.[f]);
  const jobRows = job && JSON.stringify(job.rows) !== JSON.stringify(s.rows) ? ["job.json 의 rows 가 sheets.json 과 다르다"] : [];
  let echo = null;
  if (echoRaw != null) { const t = findPromptText(echoRaw); echo = t ? { diff: diffRows(rowsOfText(txt), rowsOfText(t), N) } : { diff: [{ row: null, col: null, want: "Row 1:", got: "echo 에서 'Row 1:' 이 든 글을 못 찾음" }] }; echo.ok = echo.diff.length === 0; }
  const cells = N * N, matched = cells - rowDiff.filter((x) => x.row <= N).length;
  const ok = !rowDiff.length && !hand.length && !spellBad.length && !hashBad.length && !jobRows.length && (!echo || echo.ok);
  return { ok, rows_match: `${matched}/${cells}`, row_diff: rowDiff, hand_word_lines: hand, spelling_bad: spellBad, ref_hash_bad: hashBad, job_rows: jobRows, echo };
}

// =====================================================================================
// 8. compare --band: 칸마다 720px 단독 확대 + 가운데 모음 띠(ㅛ · ㅠ · ㅖ · ㅙ · ㅝ …) 4배 — 칸 그림은 cells/<장>/<칸>.png(sheetcheck 가 자른 실제 칸)
// =====================================================================================
export async function compareBand(dir, items, outFile) {
  const sharp = await loadSharp(), comps = [], Z = 720, GAP = 20; let y = 10, W = 0;
  comps.push({ input: labelSvg("compare --band — 왼쪽: 칸 그림 720px 단독 확대 · 오른쪽: 가운데 모음 띠 4배(가로 모음은 잉크 높이 30~80% 띠, 세로 모음은 오른쪽 45%)", 20, "#111"), left: 10, top: y }); y += 40;
  for (const it of items) {
    const f = P(dir, "cells", it.sheet, `${it.rc}.png`), { g, w, h } = await loadGrey(f), b = inkBox(g, w, h) ?? { x0: 0, x1: w - 1, y0: 0, y1: h - 1, w, h };
    const d = it.ch && isHangul(it.ch) ? dec(it.ch) : null, vertical = d && VERT.has(d.m);
    const band = vertical ? { left: Math.max(0, b.x0 + Math.floor(b.w * 0.55)), top: Math.max(0, b.y0 - 2), width: 0, height: 0 } : { left: Math.max(0, b.x0 - 2), top: Math.max(0, b.y0 + Math.floor(b.h * 0.3)), width: 0, height: 0 };
    band.width = Math.max(1, Math.min(w - band.left, vertical ? b.x1 + 3 - band.left : b.w + 4));
    band.height = Math.max(1, Math.min(h - band.top, vertical ? b.h + 4 : Math.ceil(b.h * 0.5)));
    comps.push({ input: labelSvg(`${it.sheet}:${it.rc}${it.ch ? `  ${it.ch}${d ? ` = ${jamo(it.ch)}` : ""}` : ""}${it.note ? ` · ${it.note}` : ""}`, 22, "#1a5276"), left: 10, top: y }); y += 36;
    const big = await sharp(f).resize(Z, Z, { fit: "contain", background: "#fff", kernel: "lanczos3" }).flatten({ background: "#fff" }).png().toBuffer();
    comps.push({ input: big, left: 10, top: y }, { input: frameSvg(Z, Z), left: 10, top: y });
    const bw = band.width * 4, bh = band.height * 4;
    const zoom = await sharp(f).extract(band).resize(bw, bh, { kernel: "lanczos3" }).flatten({ background: "#fff" }).png().toBuffer();
    comps.push({ input: zoom, left: 10 + Z + GAP, top: y }, { input: frameSvg(bw, bh), left: 10 + Z + GAP, top: y });
    comps.push({ input: labelSvg(`띠 ${vertical ? "오른쪽(세로 모음)" : "가운데(가로 · 섞임 모음)"} ${band.width}×${band.height}px → 4배`, 16, "#666"), left: 10 + Z + GAP, top: y + bh + 4 });
    W = Math.max(W, 10 + Z + GAP + bw + 10); y += Math.max(Z, bh + 30) + 30;
  }
  await compose(comps, outFile, W, y);
}

// =====================================================================================
// 9. override(요소 조합 보정 + 사람 검수) — 그림 · 페이지만 만든다. 상태(pending → approved/rejected)는 hf.mjs override 가 manifest 에 적는다
// =====================================================================================
export async function exportNormalized(dir, sheet, rc, outFile) {
  geomCache.clear();
  const cell = await loadCell(dir, sheet, rc), { P0, PAD0 } = frameOf(cell.pitch, cell.N), b = cropBinary(render(cell, { outP: P0 }), P0, PAD0);
  await saveGrey(b.g, b.w, b.h, outFile);
  return { w: b.w, h: b.h, P0, PAD0 };
}
// review/override-u<코드>.png: [원본 실패 칸 | 보정 후보 | 참고 글자들] 300px + 후보 가운데 띠 4배 + 섞어 쓰기
export async function overrideSheet(dir, e, carriers, outFile) {
  const sharp = await loadSharp(), Z = 300, comps = []; let y = 10;
  comps.push({ input: labelSvg(`override ${e.ch} = ${isHangul(e.ch) ? jamo(e.ch) : e.ch} · 상태 ${e.status} — [원본 실패 칸 | 보정 후보 | 참고(이미 통과한 같은 폰트 글자)]`, 22, "#111"), left: 10, top: y }); y += 34;
  comps.push({ input: labelSvg(`조합 출처 · 설명: ${e.note ?? ""}`, 18, "#444"), left: 10, top: y }); y += 34;
  const tiles = [];
  if (e.base) { const [sh, rc] = e.base.split(":"), f = P(dir, "cells", sh, `${rc}.png`); if (existsSync(f)) tiles.push({ f, t: `원본 실패 칸 ${e.base}` }); }
  tiles.push({ f: P(dir, e.file), t: "보정 후보" });
  for (const r of e.refs ?? []) { const [sh, rc] = r.split(":"), f = P(dir, "cells", sh, `${rc}.png`); if (existsSync(f)) tiles.push({ f, t: `참고 ${r}` }); }
  for (const [k, t] of tiles.entries()) {
    comps.push({ input: await sharp(t.f).resize(Z, Z, { fit: "contain", background: "#fff" }).flatten({ background: "#fff" }).png().toBuffer(), left: 10 + k * (Z + 16), top: y }, { input: frameSvg(Z, Z), left: 10 + k * (Z + 16), top: y });
    comps.push({ input: labelSvg(t.t, 16, t.t === "보정 후보" ? "#b03a2e" : "#666"), left: 12 + k * (Z + 16), top: y + Z + 2 });
  }
  y += Z + 36;
  const { g, w, h } = await loadGrey(P(dir, e.file)), b = inkBox(g, w, h) ?? { x0: 0, y0: 0, w, h };
  const band = { left: Math.max(0, b.x0 - 2), top: Math.max(0, b.y0 + Math.floor(b.h * 0.25)), width: Math.min(w - Math.max(0, b.x0 - 2), b.w + 4), height: Math.min(h - Math.max(0, b.y0 + Math.floor(b.h * 0.25)), Math.ceil(b.h * 0.55)) };
  comps.push({ input: labelSvg("보정 후보 가운데 띠 4배(이음매 · 획 수 확인)", 16, "#666"), left: 10, top: y }); y += 24;
  comps.push({ input: await sharp(P(dir, e.file)).extract(band).resize(band.width * 4, band.height * 4, { kernel: "nearest" }).flatten({ background: "#fff" }).png().toBuffer(), left: 10, top: y });
  y += band.height * 4 + 20;
  await compose(comps, outFile, Math.max(tiles.length * (Z + 16) + 20, band.width * 4 + 20), y);
  if (carriers?.length) {
    const P0 = w + 2 * (e.frame?.PAD0 ?? 6), PAD0 = e.frame?.PAD0 ?? 6, gg = new Uint8Array(P0 * P0).fill(255);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) gg[(yy + PAD0) * P0 + xx + PAD0] = g[yy * w + xx];
    const cs = [];
    for (const c of carriers) { try { cs.push({ ch: c.ch, g: render(await loadCell(dir, c.sheet, c.rc), { outP: P0 }) }); } catch { /* 건너뛴다 */ } }
    await contextMix([{ ch: e.ch, g: gg }], cs, P0, PAD0, outFile.replace(/\.png$/, "-mix.png"), `${e.ch} 섞어 쓰기 — 본문 글자 사이에 보정 후보(96px 줄의 빨간 밑줄)`);
  }
}
export function overridesHtml(dir, man, { ttf = null } = {}) {
  const rows = Object.values(man.glyphs ?? {});
  const badge = { pending: "검수 기다림(폰트에 안 들어감)", approved: "통과(폰트에 들어감)", rejected: "반려(폰트에 안 들어감)" };
  const card = (e) => `<section class="card ${e.status}"><h2>${esc(e.ch)} <small>${esc(e.code)} · ${esc(badge[e.status] ?? e.status)}</small></h2>
<p>${esc(e.note ?? "")}${e.approved_note ? `<br>승인: ${esc(e.approved_note)} (${esc(e.approved_at)})` : ""}</p>
<img src="override-${esc(e.code)}.png" alt="${esc(e.ch)} 검수 그림">${existsSync(P(dir, "review", `override-${e.code}-mix.png`)) ? `<img src="override-${esc(e.code)}-mix.png" alt="${esc(e.ch)} 섞어 쓰기">` : ""}
${ttf ? `<p class="ttf">지금 폰트(out/${esc(path.basename(ttf))})로 쓴 줄 — 승인 · glyphs · build 뒤에 이 글자가 보인다: <span>용사는 ${esc(e.ch)} 검을 들고 ${esc(e.ch)}</span></p>` : ""}
<p class="cmd">${e.status === "pending" ? `통과면 <code>node scripts/hf.mjs override &lt;dir&gt; approve ${esc(e.ch)} --note "&lt;사용자가 한 말&gt;"</code> · 반려면 <code>override &lt;dir&gt; reject ${esc(e.ch)}</code>` : ""}</p></section>`;
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>보정 글자 검수</title>
<style>:root{color-scheme:light dark;--bg:#f4f5f7;--card:#fff;--ink:#1b2030;--line:#d8dce4}@media (prefers-color-scheme:dark){:root{--bg:#13161c;--card:#1a1e26;--ink:#e6e8ee;--line:#2e3440}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 'Malgun Gothic',sans-serif}main{max-width:1200px;margin:0 auto;padding:20px 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:16px 0}.card img{max-width:100%;background:#fff;display:block;margin:8px 0}
.pending{border-left:6px solid #e0a000}.approved{border-left:6px solid #2e8b57}.rejected{border-left:6px solid #c93a2f;opacity:.7}h2 small{font-weight:400;font-size:13px;opacity:.75}
${ttf ? `@font-face{font-family:Built;src:url("../out/${encodeURI(path.basename(ttf))}")}.ttf span{font-family:Built;font-size:40px}` : ""}code{font-size:12px}</style>
<main><h1>보정 글자 검수(override)</h1><p>여러 라운드에서 되풀이해 실패한 드문 글자를, 이미 통과한 같은 폰트 글자의 요소로 조합한 후보다. <b>사람이 이 페이지(또는 review/override-&lt;코드&gt;.png)를 보고 통과라고 해야만</b> 폰트에 들어간다. pending · rejected 는 glyphs 가 넣지 않는다.</p>
${rows.length ? rows.map(card).join("\n") : "<p>보정 글자가 없다.</p>"}</main></html>`;
  writeFileSync(P(dir, "review", "overrides.html"), html, "utf8");
}
