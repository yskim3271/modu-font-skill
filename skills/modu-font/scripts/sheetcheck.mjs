// 장 검사: 받은 장 그림(RGB 화소)과 격자 N → "이 장을 쓸 수 있나"(됨 · 일부 · 안 됨), 못 쓰는 줄, 찾은 선대로 자른 칸.
// hf.mjs 의 cut 이 한국어 모드의 영문 아닌 장(모든 격자, 6 포함)에 쓴다. 영문 장과 일본어 모드는 쓰지 않는다(예전 길 그대로).
// 기준(격자 실험 3단계에서 먼저 적고 받은 18장에 맞춰 본 것 — 글씨체 다섯 개 · 장 18개에서 나온 임시 규칙):
//   1. 하늘색 선이 가로 · 세로 N+1 개. 아니면 "안 됨(선 수 틀림)" — 칸을 만들지 않는다.
//      선이 N+1 개면 간격이 고르지 않아도 찾은 선대로 자른다(0.5.0 의 1.3 기준 · 등분으로 넘어가기를 쓰지 않는다).
//   2. 줄(행)마다 그 줄의 띠 안에서 세로 선 자리를 따로 찾아, 전체 선과 칸 너비의 15% 넘게 어긋나거나 선이 없으면 못 쓰는 줄. 열마다 가로 선도 같은 방법.
//   3. 칸마다 글자 하나: 빈 칸 · 두 글자가 있는 줄, 경계 넘음 칸이 max(3, N 의 25%) 이상인 줄은 못 쓰는 줄. 그 밖의 경계 넘음 칸은 그 칸만 못 쓴다.
//      부호 장은 쉼표 · 마침표가 작고 … “ ” 는 조각이 여럿이라 "거의 빈 칸" · "두 글자"를 판정에 넣지 않고, 빈 칸은 그 칸만 버린다.
//   4. 칸 간격(가장 넓은 칸 ÷ 가장 좁은 칸) · 5. 글자 높이와 획 ÷ 높이는 값만 적는다.
//   장 판정: 못 쓰는 줄 0 = 됨 · 전체 줄의 20% 이하 = 일부 · 선 수가 틀리거나 20% 초과 = 안 됨.
import { emptyPx, padOf, rcName } from "./lib.mjs";

export const C = { LINE_TOL: 0.15, ROWS_MAX: 0.20, LINE_MISSING: 0.40, SEARCH: 0.45, PEAK: 0.5, PEAK_SEP: 0.3, EMPTY_FRAC: 0.15, GAP_PX: 2, GAP_FRAC: 0.03, SIDE_W: 0.3, SIDE_INK: 0.25, TWO_W: 1.3, CROSS_PX: 3, CROSS_FRAC: 0.03, CROSS_ROW_FRAC: 0.25, CROSS_ROW_MIN: 3, SKILL_EVEN: 1.3 };
// 두 글자 규칙: a = 좌우 조각 높이 >= 중앙값의 0.6 / b = 0.45 + 두 조각 너비가 비슷함(좁은 쪽 ÷ 넓은 쪽 >= 0.5). 칸마다 둘 다 셈해 적고, 판정에는 TWO_RULE 을 쓴다.
//   b 를 쓴다: 활자로 그린 두 글자 가짜 장 여섯에서 a 는 3(낮은 글자가 낀 '륩 · 보' 셋을 놓침), b 는 6 을 잡았고,
//   진짜 장(실험의 '됨' 11장 + 이미 폰트로 만든 6×6 장 77장)에서 b 가 새로 켠 칸은 0 이었다. 진짜 "두 글자" 장은 본 적이 없다 — 임시 규칙.
export const TWO = { a: { SIDE_H: 0.6, SIM: 0 }, b: { SIDE_H: 0.45, SIM: 0.5 } };
export const TWO_RULE = "b";

const med = (a) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * 0.5))]; };
const r3 = (v) => (v == null || !Number.isFinite(v) ? null : +v.toFixed(3));

// 하늘색 선 자리: 하늘색 화소가 가장 많은 열(행) n 개, 서로 minGap 넘게 떨어진 것. N = 6 이면 0.5.0 의 linesOf(길이 ÷ 10)와 같다
export function linesOf(counts, n, N) {
  const minGap = (counts.length * 6) / (10 * N);
  const idx = [...counts.keys()].sort((a, b) => counts[b] - counts[a]);
  const picked = [];
  for (const i of idx) {
    if (picked.every((p) => Math.abs(p - i) > minGap)) picked.push(i);
    if (picked.length === n) break;
  }
  return picked.sort((a, b) => a - b);
}
// 실제로 그려진 하늘색 선의 개수: 9px 창으로 모은 값의 봉우리 가운데 가장 큰 봉우리의 40% 이상인 것(봉우리 사이 최소 간격 = 길이의 2%)
export function countLines(counts) {
  const n = counts.length, win = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let d = -4; d <= 4; d++) { const j = i + d; if (j >= 0 && j < n) s += counts[j]; } win[i] = s; }
  let mx = 0; for (let i = 0; i < n; i++) if (win[i] > mx) mx = win[i];
  if (mx <= 0) return { count: 0, at: [] };
  const sep = Math.max(3, Math.round(n * 0.02)), thr = mx * 0.4, idx = [...win.keys()].filter((i) => win[i] >= thr).sort((a, b) => win[b] - win[a]), at = [];
  for (const i of idx) if (at.every((p) => Math.abs(p - i) > sep)) at.push(i);
  return { count: at.length, at: at.sort((a, b) => a - b) };
}

// data: RGB 3채널 화소(sharp raw), W × H. opts.symbols: 부호 장. opts.twoRule: 판정에 쓸 두 글자 규칙(기본 TWO_RULE).
// 돌려주는 cells 에는 칸 그림(g: 회색 화소 — 하늘색은 흰색)이 들어 있다. 선 수가 틀리면 cells 는 빈 목록이다.
export function checkSheet({ data, W, H }, N, { symbols = false, twoRule = TWO_RULE } = {}) {
  const blue = (x, y) => { const i = (y * W + x) * 3; return data[i + 2] - data[i] > 25 && data[i + 2] > 120; };
  const grey = (x, y) => { const i = (y * W + x) * 3, R = data[i], G = data[i + 1], B = data[i + 2]; return B - R > 18 ? 255 : Math.round((R + G + B) / 3); };
  const out = { n: N, size: [W, H], symbols };
  const EMPTY = emptyPx(N);

  // ---- 1. 선 수
  const cols = new Array(W).fill(0), rws = new Array(H).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (blue(x, y)) { cols[x]++; rws[y]++; }
  const lv = countLines(cols), lh = countLines(rws);
  out.lines = { vertical: lv.count, horizontal: lh.count, expected: N + 1, ok: lv.count === N + 1 && lh.count === N + 1 };
  if (!out.lines.ok) {
    return { ...out, verdict: "안 됨", reason: "선 수 틀림", reason_detail: `세로 선 ${lv.count}개(${lv.count - 1}열) · 가로 선 ${lh.count}개(${lh.count - 1}행) — 있어야 할 것 ${N + 1}개(${N}×${N})`, unusable_rows: null, unusable_rows_lines: null, cells: [], xs: null, ys: null };
  }
  const xs = linesOf(cols, N + 1, N), ys = linesOf(rws, N + 1, N);
  const dx = xs.slice(1).map((v, i) => v - xs[i]), dy = ys.slice(1).map((v, i) => v - ys[i]);
  out.xs = xs; out.ys = ys;
  // ---- 4. 칸 간격(값만)
  const ex = Math.max(...dx) / Math.min(...dx), ey = Math.max(...dy) / Math.min(...dy);
  out.evenness = { x: r3(ex), y: r3(ey), cell_w_min_max: [Math.min(...dx), Math.max(...dx)], cell_h_min_max: [Math.min(...dy), Math.max(...dy)], rule_1_3_of_0_5_0_would_pass: ex < C.SKILL_EVEN && ey < C.SKILL_EVEN };

  // ---- 2. 줄(행)마다 세로 선 자리, 열마다 가로 선 자리
  function scan(bands, lines, vertical) {
    const len = vertical ? W : H, res = [];
    for (let b = 0; b < N; b++) {
      const a0 = bands[b] + 4, a1 = bands[b + 1] - 4, h = a1 - a0, cnt = new Float64Array(len);
      for (let p = a0; p < a1; p++) for (let q = 0; q < len; q++) if (vertical ? blue(q, p) : blue(p, q)) cnt[q]++;
      const sm = new Float64Array(len); for (let q = 0; q < len; q++) { let m = 0; for (let d = -2; d <= 2; d++) { const k = q + d; if (k >= 0 && k < len && cnt[k] > m) m = cnt[k]; } sm[q] = m; }
      const pitch = (lines[N] - lines[0]) / N, flags = [], at = [];
      for (let i = 0; i <= N; i++) {
        const lo = Math.max(0, Math.round(lines[i] - C.SEARCH * pitch)), hi = Math.min(len - 1, Math.round(lines[i] + C.SEARCH * pitch)); let best = lo;
        for (let q = lo; q <= hi; q++) if (cnt[q] > cnt[best] || (cnt[q] === cnt[best] && Math.abs(q - lines[i]) < Math.abs(best - lines[i]))) best = q;
        const strength = +(cnt[best] / h).toFixed(2), off = best - lines[i], w = i < N ? lines[i + 1] - lines[i] : lines[i] - lines[i - 1];
        if (strength < C.LINE_MISSING) { at.push(null); flags.push({ line: i, why: "줄 없음", strength }); }
        else { at.push(best); if (Math.abs(off) > C.LINE_TOL * w) flags.push({ line: i, why: "어긋남", off_px: off, off_pct_of_cell: +(100 * off / w).toFixed(1), strength }); }
      }
      const idx = [...sm.keys()].filter((q) => sm[q] >= C.PEAK * h).sort((x, y) => sm[y] - sm[x]), peaks = [];
      for (const q of idx) if (peaks.every((p) => Math.abs(p - q) > C.PEAK_SEP * pitch)) peaks.push(q);
      const offs = at.map((v, i) => (v == null ? null : Math.abs(v - lines[i]))).filter((v) => v != null), maxAbs = offs.length ? Math.max(...offs) : null;
      res.push({ band: b + 1, lines_in_band: peaks.length, expected: N + 1, max_off_pct_of_cell: maxAbs == null ? null : +(100 * maxAbs / pitch).toFixed(1), flagged: flags.length > 0 || peaks.length !== N + 1, flags });
    }
    return res;
  }
  const rowScan = scan(ys, xs, true), colScan = scan(xs, ys, false);
  out.row_lines = { tolerance_pct_of_cell: C.LINE_TOL * 100, rows_flagged: rowScan.filter((r) => r.flagged).map((r) => r.band), cols_flagged: colScan.filter((r) => r.flagged).map((r) => r.band), worst_row_off_pct: Math.max(...rowScan.map((r) => r.max_off_pct_of_cell ?? 100)), worst_col_off_pct: Math.max(...colScan.map((r) => r.max_off_pct_of_cell ?? 100)), rows: rowScan.filter((r) => r.flagged), cols: colScan.filter((r) => r.flagged) };

  // ---- 3. 칸마다 글자가 하나인가 (찾은 선대로 자른 칸)
  const cells = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const cw = xs[c + 1] - xs[c], ch = ys[r + 1] - ys[r], pad = padOf(cw, N);
    const left = xs[c] + pad, top = ys[r] + pad, w = cw - 2 * pad, h = ch - 2 * pad, g = Buffer.alloc(Math.max(0, w * h));
    let ink = 0, x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = grey(left + x, top + y); g[y * w + x] = v; if (v < 150) { ink++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    cells.push({ r, c, rc: rcName(r, c, N), cw, ch, pad, w, h, g, ink, box: ink ? { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null });
  }
  const full = cells.filter((c) => c.ink >= EMPTY), medInk = med(full.map((c) => c.ink)), medH = med(full.map((c) => c.box.h)), medW = med(full.map((c) => c.box.w));
  for (const c of cells) {
    c.blank = c.ink < EMPTY;                                          // 빈 칸(0.5.0 의 empty 와 같은 뜻 — 폰트에서 빠진다)
    c.near_empty = !c.blank && medInk != null && c.ink < C.EMPTY_FRAC * medInk; // 거의 빈 칸(옆 글자 조각만 든 칸) — 한글 장에서만 판정에 넣는다
    c.empty = c.blank || (!symbols && c.near_empty);
    c.two_a = false; c.two_b = false; c.cross = [];
    if (c.blank || !c.box) continue;
    // 두 글자: 잉크 상자 안쪽의 빈 열 틈으로 좌우를 나눠 본다
    const { w, h, g, box } = c, colInk = new Int32Array(w);
    for (let x = box.x0; x <= box.x1; x++) { let n = 0; for (let y = 0; y < h; y++) if (g[y * w + x] < 150) n++; colInk[x] = n; }
    const side = (xa, xb) => { let n = 0, t = h, b = -1, l = w, rr = -1; for (let x = xa; x <= xb; x++) for (let y = 0; y < h; y++) if (g[y * w + x] < 150) { n++; if (y < t) t = y; if (y > b) b = y; if (x < l) l = x; if (x > rr) rr = x; } return { ink: n, h: b - t + 1, w: rr - l + 1 }; };
    const minGap = Math.max(C.GAP_PX, C.GAP_FRAC * c.cw);
    let s = -1;
    for (let x = box.x0; x <= box.x1 + 1; x++) {
      const emptyCol = x <= box.x1 && colInk[x] === 0;
      if (emptyCol) { if (s < 0) s = x; }
      else if (s >= 0) {
        const len = x - s;
        if (len > minGap && box.w >= C.TWO_W * medW) {
          const a = side(box.x0, s - 1), b = side(x, box.x1);
          for (const k of ["a", "b"]) {
            const big = (q) => q.h >= TWO[k].SIDE_H * medH && q.w >= C.SIDE_W * medW && q.ink >= C.SIDE_INK * medInk;
            if (big(a) && big(b) && Math.min(a.w, b.w) / Math.max(a.w, b.w) >= TWO[k].SIM) c[`two_${k}`] = true;
          }
        }
        s = -1;
      }
    }
  }
  // 경계 넘음: 자르는 선 자리 ±1px 띠의 어두운 화소(하늘색이 아닌 것) — 양쪽 칸 모두에 표시
  const dark = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return false; const i = (y * W + x) * 3, R = data[i], G = data[i + 1], B = data[i + 2]; return !(B - R > 18) && (R + G + B) / 3 < 150; };
  const cellAt = (r, c) => (r >= 0 && c >= 0 && r < N && c < N ? cells[r * N + c] : null);
  for (let i = 0; i <= N; i++) for (let r = 0; r < N; r++) {
    let n = 0; for (let y = ys[r]; y < ys[r + 1]; y++) if (dark(xs[i] - 1, y) || dark(xs[i], y) || dark(xs[i] + 1, y)) n++;
    if (n >= Math.max(C.CROSS_PX, C.CROSS_FRAC * (ys[r + 1] - ys[r]))) for (const [cc, sd] of [[cellAt(r, i - 1), "right"], [cellAt(r, i), "left"]]) if (cc) cc.cross.push({ side: sd, px: n });
  }
  for (let j = 0; j <= N; j++) for (let c = 0; c < N; c++) {
    let n = 0; for (let x = xs[c]; x < xs[c + 1]; x++) if (dark(x, ys[j] - 1) || dark(x, ys[j]) || dark(x, ys[j] + 1)) n++;
    if (n >= Math.max(C.CROSS_PX, C.CROSS_FRAC * (xs[c + 1] - xs[c]))) for (const [cc, sd] of [[cellAt(j - 1, c), "bottom"], [cellAt(j, c), "top"]]) if (cc) cc.cross.push({ side: sd, px: n });
  }
  // ---- 줄 판정
  const crossRowMin = Math.max(C.CROSS_ROW_MIN, Math.ceil(C.CROSS_ROW_FRAC * N)), bad = new Map(), lineRows = new Set();
  const add = (row, why, byLines = false) => { if (row < 1 || row > N) return; if (!bad.has(row)) bad.set(row, []); if (!bad.get(row).includes(why)) bad.get(row).push(why); if (byLines) lineRows.add(row); };
  for (const r of rowScan) if (r.flagged) add(r.band, r.flags.length ? `세로 선 ${[...new Set(r.flags.map((f) => f.why))].join(" · ")}(${r.flags.map((f) => f.line).join(",")}번 선)` : `세로 선 수 ${r.lines_in_band}/${r.expected}`, true);
  const notes = [];
  for (const c of colScan) { if (!c.flagged) continue; if (!c.flags.length) { notes.push(`${c.band}열: 가로 선 수 ${c.lines_in_band}/${c.expected} — 판정에 넣지 않음`); continue; } for (const f of c.flags) { add(f.line, `${c.band}열의 가로 선 ${f.why}(${f.line}번 선)`, true); add(f.line + 1, `${c.band}열의 가로 선 ${f.why}(${f.line}번 선)`, true); } }
  const two = (c) => !c.blank && c[`two_${twoRule}`];
  for (let r = 0; r < N; r++) {
    const row = cells.slice(r * N, r * N + N), nE = row.filter((c) => c.empty), nT = row.filter(two), nX = row.filter((c) => !c.empty && c.cross.length);
    // 6×6 은 빈 칸(빈 칸 · 거의 빈 칸)을 줄 판정에 넣지 않고 그 칸만 뺀다(지시서 10 — 사용자가 정했다). 8×8 이상은 빈 칸이 있는 줄을 못 쓴다
    if (!symbols && nE.length && N > 6) add(r + 1, `빈 칸 ${nE.length}개(${nE.map((c) => c.rc).join(" ")})`);
    if (!symbols && nT.length) add(r + 1, `두 글자 칸 ${nT.length}개(${nT.map((c) => c.rc).join(" ")})`);
    if (nX.length >= crossRowMin) add(r + 1, `경계 넘음 ${nX.length}칸(기준 ${crossRowMin}칸 이상)`);
  }
  const unusable = [...bad.keys()].sort((a, b) => a - b), frac = unusable.length / N;
  out.cells = cells;
  out.cells_check = {
    empty_px: EMPTY, medians: { ink_px: medInk, height: medH, width: medW }, two_rule: twoRule, crossing_row_threshold: crossRowMin,
    blank: cells.filter((c) => c.blank).map((c) => c.rc), near_empty: cells.filter((c) => c.near_empty).map((c) => c.rc),
    two_a: cells.filter((c) => c.two_a).map((c) => c.rc), two_b: cells.filter((c) => c.two_b).map((c) => c.rc),
    crossing: cells.filter((c) => !c.blank && c.cross.length).map((c) => c.rc),
  };
  out.unusable_rows = unusable; out.unusable_rows_why = Object.fromEntries(unusable.map((r) => [r, bad.get(r)]));
  out.unusable_rows_lines = [...lineRows].sort((a, b) => a - b); // 1 · 2번(선)만으로 못 쓰는 줄
  out.unusable_cells = cells.filter((c) => !unusable.includes(c.r + 1) && !c.blank && c.cross.length).map((c) => c.rc); // 못 쓰는 줄 밖의 경계 넘음 칸 — 그 칸만 못 쓴다
  out.empty_cells = !symbols && N === 6 ? cells.filter((c) => c.empty && !unusable.includes(c.r + 1)).map((c) => c.rc) : []; // 6×6 한글 장: 그 칸만 빠지는 빈 칸 · 거의 빈 칸(못 쓰는 줄 밖)
  out.notes = notes;
  out.verdict = unusable.length === 0 ? "됨" : frac <= C.ROWS_MAX ? "일부" : "안 됨";
  out.reason = unusable.length === 0 ? null : frac <= C.ROWS_MAX ? `못 쓰는 줄 ${unusable.length}/${N}(${(100 * frac).toFixed(1)}% — 20% 이하)` : `못 쓰는 줄 ${unusable.length}/${N}(${(100 * frac).toFixed(1)}% — 20% 초과)`;
  // ---- 5. 값만: 글자 높이 · 획 굵기(잉크 100 이하의 가로 · 세로 연속 길이 중앙값)
  const runs = []; for (const c of cells) { if (c.blank) continue; const { w, h, g } = c; for (let y = 0; y < h; y++) { let run = 0; for (let x = 0; x < w; x++) { if (g[y * w + x] <= 100) run++; else if (run) { runs.push(run); run = 0; } } if (run) runs.push(run); } for (let x = 0; x < w; x++) { let run = 0; for (let y = 0; y < h; y++) { if (g[y * w + x] <= 100) run++; else if (run) { runs.push(run); run = 0; } } if (run) runs.push(run); } }
  const gh = med(cells.filter((c) => !c.blank && c.box).map((c) => c.box.h)), st = med(runs), pitch = (xs[N] - xs[0]) / N;
  out.values = { cell_pitch: +pitch.toFixed(2), pad: cells[0].pad, glyph_height: gh, glyph_height_over_cell: r3(gh / pitch), stroke: st, stroke_over_height: gh ? r3(st / gh) : null };
  return out;
}
