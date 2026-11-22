// 견본 그림 한 장 → 획 굵기 ÷ 글자 높이 → 시작 격자. hf.mjs 의 init --sample · pick · jobs · grid --auto 가 부른다.
// 재는 법(격자 실험에서 견본 다섯 장을 잰 잣대 그대로 — 기울기 되돌리기와 획 굵기를 화소보다 잘게 재는 것만 더했다):
//   밝기 = round(0.299R + 0.587G + 0.114B), 잉크 = 밝기 <= 100
//   기울기: 글줄이 수평이 되는 각도를 ±12° 안에서 찾아(0.5° 씩, 그 둘레를 0.1° 씩) 0.5° 이상이면 밝기 그림을 그만큼 되돌린 뒤에 잰다.
//           되돌린 그림은 재는 데만 쓴다 — style/sample.png 는 그대로다. 찾은 각도는 tilt_deg 로 돌려준다(0 = 되돌리지 않음).
//   줄 = 잉크가 있는 행의 띠(틈 < 가장 높은 띠 × 0.25 면 합치고, 높이 < 가장 높은 띠 × 0.3 인 띠는 버림)
//   글자 높이 = 줄 안에서 열 틈(3px 이상)으로 나눈 덩어리 가운데 높이 >= 줄 높이 × 0.6 인 것('큰 덩어리')의 높이, 1~6째 줄의 중앙값
//   획 굵기 = 그림 전체에서 잉크의 가로 · 세로 연속 길이의 중앙값. 연속 길이는 실수로 잰다:
//           (화소 수 − 1) + 양 끝의 몫, 끝의 몫 = (100 − 끝 화소 밝기) ÷ (바깥 이웃 화소 밝기 − 끝 화소 밝기) — 밝기가 100 을 넘는 자리를 두 화소 사이에서 곧게 이어 찾는다.
//           (화소 수의 중앙값은 정수라 작은 견본에서 한 화소가 값의 20 ~ 30% 였다 — 절반으로 줄인 견본의 값이 31% 달라졌다.)
// 규칙(임시 — 글씨체 다섯 개에서 나왔다): 획 ÷ 높이 < 0.09 → 가는 글씨 → 14×14, 그 밖 → 굵은 글씨 → 12×12. 재지 못하면 12×12(지시서 10 — 09b 까지는 6×6).
// 화소 문턱값이 고정이라 깨끗한 흰 바탕의 그림에서 잰 것이다 — 어두운 사진에서는 틀릴 수 있고, 그때는 init --grid 로 정한다. 진짜 사진 견본으로는 재 보지 않았다(돌리고 줄이고 흐리게 한 견본으로만).
import { GRID_BOUND } from "./lib.mjs";

const INK = 100;
const TILT = { RANGE: 12, COARSE: 0.5, FINE: 0.1, MIN: 0.5, GRID: 800 }; // 찾는 범위(°) · 굵게 · 잘게 찾는 간격 · 이보다 작으면 되돌리지 않음 · 기울기를 찾을 때 줄인 그림의 긴 변(칸)
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const r4 = (v) => (v == null || !Number.isFinite(v) ? null : +v.toFixed(4));

// 기울기 찾기: 잉크 화소를 굵은 칸(한 변 q 화소)에 모으고, 각도마다 "그 각도만큼 되돌렸을 때의 행별 잉크 합"의 제곱합을 견준다 — 글줄이 수평일 때 가장 크다.
//   돌려주는 각도 = 그림이 시계 방향으로 돈 각도(양수 = 글줄이 오른쪽으로 갈수록 내려간다)
function findTilt(g, W, H) {
  const q = Math.max(1, Math.ceil(Math.max(W, H) / TILT.GRID)), cw = Math.ceil(W / q), ch = Math.ceil(H / q), d = new Float64Array(cw * ch);
  for (let y = 0; y < H; y++) { const o = y * W, j = Math.floor(y / q) * cw; for (let x = 0; x < W; x++) if (g[o + x] <= INK) d[j + Math.floor(x / q)]++; }
  const pts = [];
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { const v = d[j * cw + i]; if (v) pts.push(i - (cw - 1) / 2, j - (ch - 1) / 2, v); }
  if (!pts.length) return 0;
  const R = Math.ceil(Math.hypot(cw, ch) / 2) + 2, hist = new Float64Array(2 * R + 3);
  const score = (deg) => {
    const a = (deg * Math.PI) / 180, s = Math.sin(a), c = Math.cos(a);
    hist.fill(0);
    for (let k = 0; k < pts.length; k += 3) { const yy = pts[k + 1] * c - pts[k] * s + R, b = Math.floor(yy), f = yy - b; hist[b] += pts[k + 2] * (1 - f); hist[b + 1] += pts[k + 2] * f; }
    let t = 0; for (let b = 0; b < hist.length; b++) t += hist[b] * hist[b];
    return t;
  };
  // 가장 큰 값의 각도 — 같은 값이면 0 에 가까운 쪽
  const best = (list) => { let bd = null, bs = -1; for (const deg of list) { const sc = score(deg); if (sc > bs * (1 + 1e-12) || (Math.abs(sc - bs) <= bs * 1e-12 && Math.abs(deg) < Math.abs(bd))) { bs = sc; bd = deg; } } return bd; };
  const nc = Math.round(TILT.RANGE / TILT.COARSE), coarseList = [];
  for (let i = -nc; i <= nc; i++) coarseList.push(+(i * TILT.COARSE).toFixed(2));
  const coarse = best(coarseList), nf = Math.round(TILT.COARSE / TILT.FINE), fineList = [];
  for (let i = -nf; i <= nf; i++) fineList.push(+(coarse + i * TILT.FINE).toFixed(2));
  return best(fineList);
}
// 밝기 그림을 deg 만큼 시계 방향으로 돌린다(가운데가 축, 이웃 네 화소를 곧게 섞음, 빈 곳은 흰색). 되돌릴 때는 −기울기
function rotateGray(g, W, H, deg) {
  const a = (deg * Math.PI) / 180, s = Math.sin(a), c = Math.cos(a);
  const W2 = Math.ceil(Math.abs(W * c) + Math.abs(H * s)), H2 = Math.ceil(Math.abs(W * s) + Math.abs(H * c)), out = new Uint8Array(W2 * H2);
  const cx = (W - 1) / 2, cy = (H - 1) / 2, cx2 = (W2 - 1) / 2, cy2 = (H2 - 1) / 2;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 255 : g[y * W + x]);
  for (let Y = 0; Y < H2; Y++) for (let X = 0; X < W2; X++) {
    const u = X - cx2, v = Y - cy2, x = u * c + v * s + cx, y = -u * s + v * c + cy;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    if (x0 < -1 || y0 < -1 || x0 >= W || y0 >= H) { out[Y * W2 + X] = 255; continue; }
    out[Y * W2 + X] = Math.round(at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy);
  }
  return { g: out, W: W2, H: H2 };
}
// 잉크의 가로 · 세로 연속 길이(실수). 그림 가장자리에 닿은 끝의 몫은 0.5
function runLengths(g, W, H) {
  const runs = [], end = (vin, vout) => (INK - vin) / (vout - vin);
  for (let y = 0; y < H; y++) {
    const o = y * W; let n = 0;
    for (let x = 0; x <= W; x++) {
      if (x < W && g[o + x] <= INK) { n++; continue; }
      if (!n) continue;
      const a = x - n, b = x - 1;
      runs.push(n - 1 + (a === 0 ? 0.5 : end(g[o + a], g[o + a - 1])) + (b === W - 1 ? 0.5 : end(g[o + b], g[o + b + 1])));
      n = 0;
    }
  }
  for (let x = 0; x < W; x++) {
    let n = 0;
    for (let y = 0; y <= H; y++) {
      if (y < H && g[y * W + x] <= INK) { n++; continue; }
      if (!n) continue;
      const a = y - n, b = y - 1;
      runs.push(n - 1 + (a === 0 ? 0.5 : end(g[a * W + x], g[(a - 1) * W + x])) + (b === H - 1 ? 0.5 : end(g[b * W + x], g[(b + 1) * W + x])));
      n = 0;
    }
  }
  return runs;
}

export async function measureSample(sharp, src) {
  const { data: rgb, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let W = info.width, H = info.height; const C = info.channels, size = [W, H];
  let g = new Uint8Array(W * H);
  if (C >= 3) for (let i = 0; i < W * H; i++) g[i] = Math.round(0.299 * rgb[i * C] + 0.587 * rgb[i * C + 1] + 0.114 * rgb[i * C + 2]);
  else for (let i = 0; i < W * H; i++) g[i] = rgb[i * C]; // 회색 그림은 그 값이 밝기
  // 기울기: 0.5° 이상이면 되돌린 그림에서 잰다(아래의 W · H · g 는 그 그림이다. width · height 는 받은 그림의 크기 그대로 돌려준다)
  const found = findTilt(g, W, H), tilt = Math.abs(found) >= TILT.MIN ? found : 0;
  if (tilt) ({ g, W, H } = rotateGray(g, W, H, -tilt));
  const rowInk = new Array(H).fill(0);
  for (let y = 0; y < H; y++) { let n = 0; for (let x = 0; x < W; x++) if (g[y * W + x] <= INK) n++; rowInk[y] = n; }
  const bands = []; { let s = -1; for (let y = 0; y < H; y++) { if (rowInk[y] > 0) { if (s < 0) s = y; } else if (s >= 0) { bands.push([s, y - 1]); s = -1; } } if (s >= 0) bands.push([s, H - 1]); }
  const base = { width: size[0], height: size[1], line_count: 0, big_chunks: 0, glyph_height: null, stroke: null, ratio: null, tilt_deg: tilt };
  if (!bands.length) return { ...base, error: "잉크가 없다(밝기 100 이하인 화소가 없다)" };
  const maxH = Math.max(...bands.map((b) => b[1] - b[0] + 1));
  const merged = []; for (const b of bands) { const last = merged[merged.length - 1]; if (last && b[0] - last[1] - 1 < maxH * 0.25) last[1] = b[1]; else merged.push([...b]); }
  const lines = merged.filter((b) => b[1] - b[0] + 1 >= maxH * 0.3);
  const heights = [];
  for (let li = 0; li < Math.min(6, lines.length); li++) {
    const [y0, y1] = lines[li], colInk = new Array(W).fill(0);
    for (let x = 0; x < W; x++) { let n = 0; for (let y = y0; y <= y1; y++) if (g[y * W + x] <= INK) n++; colInk[x] = n; }
    let x0 = W, x1 = -1; for (let x = 0; x < W; x++) if (colInk[x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    const segs = []; { let s = -1, gap = 0; for (let x = x0; x <= x1 + 1; x++) { const on = x <= x1 && colInk[x] > 0; if (on) { if (s < 0) s = x; gap = 0; } else if (s >= 0) { gap++; if (gap >= 3 || x > x1) { segs.push([s, x - gap]); s = -1; gap = 0; } } } }
    const lineH = y1 - y0 + 1;
    for (const [a, b] of segs) { let t = y1, bt = y0; for (let x = a; x <= b; x++) for (let y = y0; y <= y1; y++) if (g[y * W + x] <= INK) { if (y < t) t = y; if (y > bt) bt = y; } const h = bt - t + 1; if (h >= lineH * 0.6) heights.push(h); }
  }
  // stroke 는 소수 둘째 자리까지 보여 주고, ratio 는 반올림하기 전의 값으로 셈한다
  const strokeRaw = pct(runLengths(g, W, H), 0.5), stroke = strokeRaw == null ? null : +strokeRaw.toFixed(2);
  const hMed = pct(heights, 0.5), ratio = hMed && strokeRaw ? r4(strokeRaw / hMed) : null;
  const m = { ...base, line_count: lines.length, big_chunks: heights.length, glyph_height: hMed, stroke, ratio };
  // 재지 못한 것으로 치는 경우 — 값은 그대로 두고 까닭만 적는다
  if (!lines.length) m.error = "줄을 못 찾았다";
  else if (heights.length < 4) m.error = `글자를 못 찾았다(1~6째 줄의 큰 덩어리 ${heights.length}개 — 4개는 있어야 한다)`;
  else if (ratio == null) m.error = "글자 높이나 획 굵기가 안 나왔다";
  else if (ratio < 0.005 || ratio > 0.4) m.error = `획 ÷ 높이가 ${ratio} — 글씨로 볼 수 없는 값이다(0.005 ~ 0.40 밖). 어두운 사진이거나 글자가 아닌 그림일 수 있다`;
  return m;
}

// 잰 값 → 격자. 재지 못했으면 12(지시서 10 — 사용자가 정했다: 굵은 글씨면 첫 장 검사가 10 으로 낮추고, 가는 글씨는 12 에서 대개 된다. 6 은 값이 가장 비싸다).
export function pickGrid(m) {
  if (!m || m.error || m.ratio == null) return { n: 12, cls: null, measured: false, why: `견본을 재지 못했다(${m?.error ?? "값 없음"}) → 12×12 로 둔다. 굵은 글씨면 첫 장 검사가 10 으로 낮춘다. 정하려면 init --grid <N> 또는 grid <dir> --set <N>` };
  const thin = m.ratio < GRID_BOUND, n = thin ? 14 : 12, cls = thin ? "가는 글씨" : "굵은 글씨";
  const tilt = m.tilt_deg ? ` · 견본이 ${Math.abs(m.tilt_deg)}° 기울어 있어 되돌려서 쟀다` : "";
  return { n, cls, measured: true, why: `견본의 획 굵기 ÷ 글자 높이 ${m.ratio}(획 ${m.stroke}px ÷ 높이 ${m.glyph_height}px${tilt}) ${thin ? "<" : ">="} ${GRID_BOUND} → ${cls} → ${n}×${n}` };
}
