#!/usr/bin/env node
// 모두의 폰트 스킬(modu-font) 명령 하나: node scripts/hf.mjs <명령> <작업 폴더> [옵션]
//   init · style · latin · drafts · pick · grid · plan · jobs · status · estimate · approve · check · spend · openai · cut · retry · review · redo · compare · preview · glyphs · bold
// 돈이 드는 명령은 openai 하나뿐이고, 사용자의 승인 기록(ledger.json — approve)이 있어야 돈다. 금액 한도는 없다(지시서 11). 에이전트가 내장 도구·MCP 로 그릴 때도 check → spend 로 같은 장부에 적는다.
// 격자: 한국어 모드의 본문 장 · 부호 장 · 다시 쓰기 장은 그 폰트의 격자 N×N(font.json grid — 견본을 재서 14 또는 12, 첫 장이 실패하면 낮춘다). 영문 장과 일본어 모드는 6×6 그대로.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  GRIDS, GRID_BOUND, KANA, KINDS, LATIN, LATIN_GUIDE, P, SKILL, kindOf, attemptOf, canSpend, config, die, gridOfFont, gridOfSheet, inboxFile, isKanji, isLatin, isLatinSheet, isMainSheet, jisKanji, jobKey, latinSheets, ledger, ledgerFile, loadSharp,
  orderedHangul, rcParse, rejectedDir, rejectedLog, scriptOf, prompt, readJson, recordSpend, sheetsOf, sheetsUsed, spentUsd, writeJson,
} from "./lib.mjs";
import { measureSample, pickGrid } from "./pickgrid.mjs";
import { checkSheet } from "./sheetcheck.mjs";

const argv = process.argv.slice(2);
const [cmd, dirArg, ...rest] = argv;
const opt = {}, pos = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith("--")) { const k = rest[i].slice(2); opt[k] = rest[i + 1] == null || rest[i + 1].startsWith("--") ? true : rest[++i]; }
  else pos.push(rest[i]);
}
const HELP = () => readFileSync(path.join(SKILL, "references", "commands.md"), "utf8");
const KNOWN = "init style latin drafts pick grid plan jobs status estimate approve check spend openai cut retry review redo compare preview glyphs bold".split(" ");
if (cmd === "help" || cmd === "--help" || cmd === "-h") { console.log(HELP()); process.exit(0); }
if (!cmd) { console.log(HELP()); process.exit(1); }
if (!KNOWN.includes(cmd)) die(`모르는 명령: ${cmd} — 명령 목록은 node scripts/hf.mjs help`);
if (!dirArg || dirArg.startsWith("--")) { console.error(HELP()); die(`${cmd} 다음에 작업 폴더가 필요하다(예: node scripts/hf.mjs ${cmd} ./my-font)`); }
const dir = path.resolve(dirArg);
// init 말고는 모두 init 이 만든 작업 폴더가 있어야 한다 — 없으면 스택 대신 다음 할 일을 말한다
if (cmd !== "init") {
  if (!existsSync(P(dir, "font.json"))) die(`${dir} 는 작업 폴더가 아니다(font.json 없음) — 먼저 init`);
  if (!existsSync(P(dir, "sheets.json"))) die(`${P(dir, "sheets.json")} 가 없다 — init 이 중간에 끊겼다. init <dir> --force 로 다시 만든다`);
}
const num = (v, name) => { const n = Number(v); if (v === true || v == null || v === "" || !Number.isFinite(n) || n < 0) die(`${name} 은 0 이상의 숫자여야 한다(받은 값: ${v === true ? "없음" : v})`); return n; };
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const rowsOf = (cells, N = 6) => chunk(cells, N).map((r) => r.join(""));
const isKo = (cfg) => (cfg.script ?? "ko") === "ko";
const sid = (i) => String(i).padStart(2, "0");

// 빈 N×N 격자(첫 장의 형식 참조 — 기본 6×6). 하늘색 선 — cut 이 이 색으로 격자를 찾는다. 안내선(guides)은 영문 장(6×6)에서만 쓴다.
async function blankGrid(file, size = 1024, cells = null, font = scriptOf(null).font, { guides = false, N = 6 } = {}) {
  const sharp = await loadSharp();
  const m = Math.round(size * 0.03), s = (size - 2 * m) / N;
  let lines = "";
  for (let i = 0; i <= N; i++) {
    const v = (m + i * s).toFixed(1);
    lines += `<line x1="${v}" y1="${m}" x2="${v}" y2="${size - m}"/><line x1="${m}" y1="${v}" x2="${size - m}" y2="${v}"/>`;
  }
  if (guides) {
    // 영문 장: 칸마다 대문자 높이(점선) · x-높이(파선) · 기준선(실선). 칸 폭의 76% 만 — cut 이 격자선으로 착각하지 않게
    const kind = [["cap", "2 7", 1.6], ["x", "9 6", 1.6], ["base", "", 2.2]];
    let g = "";
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) for (const [k, dash, w] of kind) {
      const y = (m + (r + LATIN_GUIDE[k]) * s).toFixed(1), x1 = (m + (c + 0.12) * s).toFixed(1), x2 = (m + (c + 0.88) * s).toFixed(1);
      g += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
    }
    lines += `</g><g stroke="#a9d3f5">${g}`;
  }
  const text = cells ? cells.map((c, k) => `<text x="${(m + (k % N + 0.5) * s).toFixed(1)}" y="${(m + (Math.floor(k / N) + 0.5) * s + s * 0.18).toFixed(1)}" text-anchor="middle" font-size="${Math.round(s * 0.55)}" font-family="${font}" fill="#111">${esc(c)}</text>`).join("") : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#fff"/><g stroke="#8ec5f0" stroke-width="3">${lines}</g>${text}</svg>`;
  mkdirSync(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(file);
}

const DRAFT_STYLES = [
  ["1", "round and bubbly diary handwriting: soft curves, big round ㅇ, chubby short letters, cute and friendly"],
  ["2", "neat upright print like careful class notes: square letters, straight strokes, even spacing, calm"],
  ["3", "a quick scribbled memo: letters lean right, strokes connect, loose and fast but still legible"],
  ["4", "small sharp mechanical-pencil handwriting: thin grey-black strokes, compact angular letters"],
];
const DRAFT_LINES = ["야, 이거 큰일 났다", "ㅋㅋㅋ 진짜?? 다 매진?", "아키바까지 가야 되나…", "진짜 엄청 달렸어!"];
// 활자 시안(지시서 14 — drafts --set print): 명조 둘 · 고딕 둘. 활자를 원하는 사용자는 먼저 명조와 고딕 사이에서 갈리므로 한 장에 두 갈래를 다 보인다.
//   명조 둘은 지휘 세션이 직접 써서 잘 나온 시안(work/jrpg-myeongjo — 고전 책 명조 · 현대 명조)을 바탕으로 했다.
const DRAFT_STYLES_PRINT = [
  ["1", "classic book Myeongjo (Batang) serif type: thin horizontals and thicker verticals, small sharp triangular serifs, like the text of a printed novel"],
  ["2", "modern Myeongjo serif type: lower stroke contrast, crisp and clear, small neat serifs, easy to read in long text"],
  ["3", "clean modern Gothic (Dotum) sans-serif type: even stroke weight, no serifs, open shapes, like screen and interface text"],
  ["4", "bold headline Gothic sans-serif type: heavy even strokes, square solid shapes, no serifs, like a poster or game title"],
];
// 활자 시안 문장 — 받침이 다양하다(ㄺ ㄼ ㅆ ㄹ ㅁ ㅇ …). 지휘 세션의 시안에서 네 칸 모두 틀림 없이 나온 문장
const DRAFT_LINES_PRINT = ["크리스털의 빛이 꺼져 간다", "붉은 달 아래, 늑대가 울었다", "흙과 바람이 남긴 낡은 검", "왕국의 기사여, 일어나라!"];
// drafts --style "<설명>": 그 설명을 네 갈래로 변주한다(hand · print 같은 규칙)
const draftVariants = (desc) => [
  ["1", `${desc} — exactly as described`],
  ["2", `${desc} — a lighter version: thinner strokes, more open shapes`],
  ["3", `${desc} — a heavier version: bolder, thicker strokes`],
  ["4", `${desc} — a narrower version: compact, more angular shapes`],
];
// 일본어 견본 문장 — 한국어 견본과 같은 내용(같은 사람이 같은 말을 일본어로 쓴 것처럼). 한자 大変·全部·売·切·秋葉原·行·本当·走 가 들어 있다
const DRAFT_LINES_JA = ["ねえ、これ大変なことになった", "マジで？？ 全部売り切れ？", "秋葉原まで行かなきゃダメかな…", "本当にめっちゃ走ったよ！"];

async function cmdInit() {
  if (existsSync(P(dir, "font.json")) && !opt.force) die(`${P(dir, "font.json")} 가 이미 있다(--force 로 덮어쓰기)`);
  // 글씨 종류(지시서 14): --kind hand(손글씨, 기본) | print(활자)
  const kind = opt.kind == null ? "hand" : String(opt.kind);
  if (!KINDS.includes(kind)) die(`--kind 는 hand(손글씨) 또는 print(활자) (받은 값: ${opt.kind === true ? "없음" : opt.kind})`);
  const pr = kind === "print";
  await loadSharp(); // sharp 가 없으면 아무것도 쓰기 전에 멈춘다(반쪽 작업 폴더가 남지 않게)
  // 견본을 먼저 확인한다 — 실패하면 아무것도 쓰지 않는다(반쪽 작업 폴더가 남지 않게)
  let sampleMeta = null;
  if (opt.sample) {
    if (opt.sample === true) die("--sample 다음에 견본 그림 경로를 쓴다");
    const src = path.resolve(opt.sample);
    if (!existsSync(src)) die(`견본 그림이 없다: ${src}`);
    const sharp = await loadSharp();
    try { sampleMeta = await sharp(src).metadata(); } catch { die(`견본을 그림으로 읽지 못했다(PNG·JPG·WebP): ${src}`); }
  }
  if (opt.count != null && !(Number(opt.count) >= 1)) die("--count 는 1 이상의 숫자(예: 500, 2350)");
  const script = { korean: "ko", japanese: "ja" }[String(opt.script)] ?? (opt.script && opt.script !== true ? String(opt.script) : "ko");
  if (!["ko", "ja"].includes(script)) die("--script 는 ko·korean(한글, 기본) 또는 ja·japanese(일본어)");
  // --grid <N>: 한국어 모드에서 사용자가 격자를 정한다(안 주면 견본을 재서 정한다). 일본어 모드와 영문 장은 6×6 고정
  let gridUser = null;
  if (opt.grid != null) {
    if (script === "ja") die("--grid 는 한국어 모드에서만 쓴다 — 일본어 모드는 6×6 고정이다(한자 · 가나는 작은 칸으로 재 본 적이 없다)");
    if (opt.base) die("--grid 는 --base 와 같이 쓰지 않는다 — 바탕 글자는 그리지 않고 영문 장은 6×6 고정이다");
    gridUser = Number(opt.grid);
    if (!GRIDS.includes(gridUser)) die(`--grid 는 ${[...GRIDS].reverse().join(" · ")} 가운데 하나(받은 값: ${opt.grid === true ? "없음" : opt.grid})`);
  }
  // 일본어 한자 목록: --chars <파일>(차례 그대로, 한자만) 또는 --set jis1(기본, 2,965자)·jis12(6,355자)
  let kanji = null;
  if (script === "ja") {
    if (opt.chars && opt.chars !== true) {
      const f = path.resolve(opt.chars);
      if (!existsSync(f)) die(`--chars 파일이 없다: ${f}`);
      kanji = [...new Set([...readFileSync(f, "utf8")].filter(isKanji))];
      if (!kanji.length) die(`${f} 에 한자가 없다(UTF-8 텍스트, 한자를 차례대로)`);
    } else {
      const set = opt.set && opt.set !== true ? String(opt.set) : "jis1";
      if (!["jis1", "jis12"].includes(set)) die("--set 은 jis1 또는 jis12 (아니면 --chars <파일>)");
      kanji = jisKanji(set === "jis1" ? 1 : 2);
    }
  } else if (opt.chars || opt.set || opt["family-ja"]) die("--chars·--set·--family-ja 는 --script ja 일 때만");
  // --base: 이미 만든 폰트의 글자 그림(glyphs.json, 다른 폴더)을 바탕으로 쓰고 영문만 그린다(--latin 과 같이)
  let base = null;
  if (opt.base) {
    if (opt.base === true || !opt.latin) die("--base <glyphs.json> 은 --latin 과 같이 쓴다(바탕 글자에 영문을 더한다)");
    const f = path.resolve(opt.base), fb = opt["base-bold"] && opt["base-bold"] !== true ? path.resolve(opt["base-bold"]) : null;
    if (!readJson(f)?.glyphs?.length) die(`--base 가 글자 그림 목록(glyphs.json)이 아니다: ${f}`);
    if (fb && !readJson(fb)?.glyphs?.length) die(`--base-bold 가 굵은 글자 그림 목록(glyphs-bold.json)이 아니다: ${fb}`);
    base = { glyphs: f, ...(fb ? { bold: fb } : {}) };
  }
  const famEn = opt["family-en"] ?? (pr ? "My Type" : "My Hand");
  const cfg = {
    family_en: famEn,
    ...(script === "ja" ? { script, family_ja: opt["family-ja"] ?? (pr ? "わたしの書体" : "わたしの手書き"), kana: opt.kana !== "no", kanji_file: "chars-kanji.txt" } : { family_ko: opt["family-ko"] ?? (pr ? "내 글꼴" : "내 손글씨") }),
    ps: famEn.replace(/[^A-Za-z]/g, "") || (pr ? "MyType" : "MyHand"),
    version: "1.000",
    kind,
    style_text: opt.style ?? (pr ? "a clean modern printed typeface with even strokes" : "everyday handwriting with a thin black 0.5 mm gel pen"),
    count: Number(opt.count ?? (script === "ja" ? kanji.length : 2350)), // 일본어: 한자 수(가나·부호는 따로)
    price_usd: Number(opt.price ?? 0.42),
    openai: { model: "gpt-image-2", size: "2048x2048", quality: "high" },
    bold_units: 14,
    ...(opt.latin ? { latin: true } : {}),
    ...(base ? { base } : {}),
  };
  // 격자(한국어 모드의 새 작업 폴더): 견본이 있으면 재서 정하고, 없으면 6 으로 두었다가 견본이 정해질 때(pick · jobs) 정한다. --grid 면 그 값(잰 값은 적어 둔다)
  if (script === "ko" && !base) {
    const sharp = await loadSharp();
    const measure = opt.sample ? await measureSample(sharp, path.resolve(opt.sample)) : null;
    setGrid(cfg, gridDecision(gridUser, measure));
  }
  writeJson(P(dir, "font.json"), cfg);
  if (kanji) writeFileSync(P(dir, cfg.kanji_file), kanji.join("") + "\n", "utf8");
  for (const d of ["style", "jobs", "inbox", "cells", "review", "out"]) mkdirSync(P(dir, d), { recursive: true });
  await blankGrid(P(dir, "style", "blank-grid.png"), 1024, null, undefined, { N: gridOfFont(cfg) });
  if (opt.sample) {
    // JPG 등으로 받아도 진짜 PNG 로 바꿔 둔다(이름만 .png 인 JPG 를 앱이 거절하지 않게)
    const sharp = await loadSharp();
    await sharp(path.resolve(opt.sample)).png().toFile(P(dir, "style", "sample.png"));
    // 견본은 다시 저장되므로 sha256 이 바뀐다 — 사용자가 준 원래 파일의 sha256 도 적어 둔다(서버에 이미 올린 견본인지 원래 파일로 맞춰 볼 수 있게 — references/backend-agent.md 의 uploaded.json)
    const c2 = readJson(P(dir, "font.json")); c2.sample_source_sha256 = sha256Of(path.resolve(opt.sample)); c2.sample_sha256 = sha256Of(P(dir, "style", "sample.png")); writeJson(P(dir, "font.json"), c2);
    if (Math.max(sampleMeta.width, sampleMeta.height) < 800) console.log(`경고: 견본이 작다(${sampleMeta.width}×${sampleMeta.height}) — 글씨 모양이 덜 전해진다. 더 큰 원본이 있으면 그걸 쓴다`);
  }
  if (!existsSync(P(dir, "errors.json"))) writeJson(P(dir, "errors.json"), {});
  if (!existsSync(ledgerFile(dir))) writeJson(ledgerFile(dir), ledger(dir));
  planSheets(cfg);
  console.log(`ok ${dir}\n- 설정 font.json (${script === "ja" ? "일본어 · " : ""}이름 ${cfg.family_ja ?? cfg.family_ko} / ${cfg.family_en}, 글씨 종류 ${kind === "print" ? "print(활자)" : "hand(손글씨)"}, 글씨 설명 "${cfg.style_text}")`);
  console.log(opt.sample ? "- 견본 style/sample.png" : "- 견본 없음 → drafts 로 시안을 그리거나 style/sample.png 를 넣는다");
  if (cfg.grid) console.log(gridLine(cfg));
}

// ---- 글씨 종류 · 설명 바꾸기(지시서 14): style <dir> [--kind hand|print] [--style "<영어 설명>"]
//   init 을 다시 부르지 않고 font.json 의 kind · style_text 만 바꾼다. 옵션이 없으면 지금 값을 보여 준다.
//   바꾼 뒤 jobs 를 다시 돌리면 아직 안 받은 장의 프롬프트가 새 문구가 된다. 이미 받은 장은 옛 문구로 그려졌다 — 알린다.
async function cmdStyle() {
  const cfg = config(dir), before = { kind: kindOf(cfg), style: cfg.style_text };
  if (opt.kind != null && !KINDS.includes(String(opt.kind))) die(`--kind 는 hand(손글씨) 또는 print(활자) (받은 값: ${opt.kind === true ? "없음" : opt.kind})`);
  if (opt.style === true) die('--style 다음에 영어 설명이 필요하다(예: --style "modern Myeongjo serif type …")');
  if (opt.kind == null && opt.style == null) {
    console.log(`글씨 종류 ${before.kind === "print" ? "print(활자)" : "hand(손글씨)"}${cfg.kind ? "" : " — font.json 에 kind 가 없다(옛 폴더 → hand)"}\n글씨 설명 "${before.style}"\n바꾸려면 style <dir> --kind hand|print [--style "<영어 설명>"]`);
    return;
  }
  if (opt.kind != null) cfg.kind = String(opt.kind);
  if (opt.style != null) cfg.style_text = String(opt.style);
  writeJson(P(dir, "font.json"), cfg);
  const changed = [before.kind !== kindOf(cfg) ? `종류 ${before.kind} → ${kindOf(cfg)}` : null, before.style !== cfg.style_text ? `설명 "${before.style}" → "${cfg.style_text}"` : null].filter(Boolean);
  console.log(`ok font.json · ${changed.length ? changed.join(" · ") : "바뀐 것 없음"}`);
  const got = sheetsOf(dir).filter((x) => existsSync(inboxFile(dir, x.id))).map((x) => x.id);
  if (changed.length) console.log(`- jobs <dir> 를 다시 돌리면 아직 안 받은 장의 프롬프트가 새 문구가 된다${got.length ? ` · 이미 받은 장(${got.slice(0, 8).join(" ")}${got.length > 8 ? " …" : ""})은 옛 문구로 그려졌다 — 섞이면 글씨가 달라질 수 있다` : ""}`);
}

// ---- 격자 고르기(한국어 모드). font.json grid: { n, by(auto 자동 · user 사용자 · down 낮춤 · pending 견본 없음), why, measure(견본에서 잰 값), history(바뀐 이력) }
//   규칙(임시 — 글씨체 다섯 개에서 나왔다): 견본의 획 굵기 ÷ 글자 높이 < 0.09 → 14, 그 밖 → 12, 재지 못하면 12(지시서 10 — 09b 까지 6). 견본이 아직 없으면 6(pending, 재면 바뀐다). 격자 정보가 없는 옛 작업 폴더는 6 이고 건드리지 않는다.
function gridDecision(user, measure) {
  const p = measure ? pickGrid(measure) : null;
  // tilt_deg: 견본에서 찾아 되돌린 기울기(°, 양수 = 시계 방향 · 0 = 되돌리지 않음). stroke_px 는 실수(화소 사이를 이어 잰 값)
  const m = measure ? { ratio: measure.ratio, stroke_px: measure.stroke, glyph_height_px: measure.glyph_height, lines: measure.line_count, tilt_deg: measure.tilt_deg ?? 0, class: p.cls, picked: p.n, size: [measure.width, measure.height], ...(measure.error ? { error: measure.error } : {}) } : null;
  if (user != null) return { n: user, by: "user", why: `사용자가 정했다(${user}×${user})${p ? (p.measured ? ` — 견본을 잰 값으로는 ${p.n}×${p.n}(획 ÷ 높이 ${measure.ratio})` : " — 견본은 재지 못했다") : ""}`, measure: m };
  if (!measure) return { n: 6, by: "pending", why: "견본이 아직 없다 — 6×6 으로 두고, 견본이 정해지면(pick · jobs) 재서 정한다", measure: null };
  return { n: p.n, by: "auto", why: p.why, measure: m };
}
function setGrid(cfg, d) {
  const history = [...(cfg.grid?.history ?? []), { at: new Date().toISOString(), n: d.n, by: d.by, why: d.why }];
  cfg.grid = { n: d.n, by: d.by, why: d.why, ...(d.measure !== undefined ? { measure: d.measure } : cfg.grid?.measure !== undefined ? { measure: cfg.grid.measure } : {}), history };
}
const gridLine = (cfg) => { const g = cfg.grid, N = g.n, down = GRIDS.slice(GRIDS.indexOf(N)); return `- 격자 ${N}×${N} — ${g.why}${g.by === "pending" ? "" : down.length > 1 ? `. 첫 장이 장 검사에 두 번 떨어지면 한 단계 낮춘다(${down.join(" → ")}) — 임시 규칙` : ". 6×6 은 더 낮출 격자가 없다"}`; };
// 본문 장을 하나라도 받았거나(치운 것 포함) 형식 참조가 있으면 격자를 견본으로 다시 정하지 않는다
const koSheets = () => sheetsOf(dir).filter((s) => !isLatinSheet(s));
const gridStarted = () => koSheets().some((s) => existsSync(inboxFile(dir, s.id))) || rejectedLog(dir).rejected.length > 0 || existsSync(P(dir, "style", "format.png"));
// ---- 첫 장 잠금(한국어 모드): 첫 본문 장이 형식 참조(style/format.png)가 되기 전에는 다른 한국어 장(본문 · 부호 · 다시 쓰기)으로 돈이 나가지 않게 — jobs · spend · openai 가 같이 쓴다.
//   잠겨 있으면 { first 첫 본문 장, got 받았는가, todo 먼저 할 일 }, 아니면 null. 영문 장 · drafts · 일본어 모드 · 바탕 글자(--base) 폴더는 잠그지 않는다.
const firstMain = () => sheetsOf(dir).find((s) => isMainSheet(s) && !isRedo(s));
function firstGate(cfg) {
  if (!isKo(cfg) || existsSync(P(dir, "style", "format.png"))) return null;
  const first = firstMain();
  if (!first) return null;
  const got = existsSync(inboxFile(dir, first.id)), cm = got ? readJson(P(dir, "cells", first.id, "cells.json"), null) : null;
  const todo = !got ? `먼저 첫 장(${first.id})을 그려 받고 cut 한다` : !cm ? `먼저 cut <dir> ${first.id} 로 첫 장을 자르고 장 검사를 본다` : cm.next?.text ? `먼저 첫 장의 다음 할 일(cells/${first.id}/cells.json 의 next): ${cm.next.text}` : `먼저 cut <dir> ${first.id} 를 다시 돌려 첫 장의 다음 할 일을 본다`;
  return { first, got, todo };
}
// 첫 본문 장 말고 받은 한국어 장(본문 · 부호 · 다시 쓰기) — 하나라도 있으면 격자를 못 바꾼다(돈 주고 받은 장이 버려지지 않게. 한 폰트는 한 격자)
const otherKoReceived = () => { const first = firstMain(); return koSheets().filter((s) => s.id !== first?.id && existsSync(inboxFile(dir, s.id))); };
// 견본(style/sample.png)을 재서 격자를 정한다 — pick 과 jobs(견본을 손으로 넣은 경우)가 부른다. 사용자가 정한 격자는 그대로 두고 잰 값만 적는다
async function gridFromSample(cfg) {
  if (!isKo(cfg) || cfg.base || !cfg.grid || !existsSync(P(dir, "style", "sample.png"))) return;
  const sharp = await loadSharp();
  const d = gridDecision(cfg.grid.by === "user" ? cfg.grid.n : null, await measureSample(sharp, P(dir, "style", "sample.png")));
  if (cfg.grid.by === "user") { cfg.grid.measure = d.measure; writeJson(P(dir, "font.json"), cfg); console.log(`- 격자 ${cfg.grid.n}×${cfg.grid.n}(사용자가 정함) 그대로 — 견본을 잰 값은 font.json 에 적었다(획 ÷ 높이 ${d.measure.ratio ?? "못 잼"})`); return; }
  if (gridStarted()) { console.log(`- 이미 받은 장이 있어 격자(${cfg.grid.n}×${cfg.grid.n})는 그대로 둔다 — 한 폰트는 한 격자`); return; }
  const before = cfg.grid.n, sheetsBefore = sheetsOf(dir).length;
  setGrid(cfg, d);
  writeJson(P(dir, "font.json"), cfg);
  await applyGrid(cfg, before);
  console.log(gridLine(cfg));
  if (cfg.grid.n !== before) noteGridChange(before, cfg.grid.n, sheetsBefore, sheetsOf(dir).length); // 장 수가 바뀌었다 — 그 전에 받은 승인으로는 check 가 멈춘다
}
// 격자가 정해졌거나 바뀐 뒤: 장 목록 · 빈 격자를 그 격자로 다시 만들고, 안 받은 묶음(jobs/<장>)은 지운다(예전 격자의 프롬프트가 남지 않게)
async function applyGrid(cfg, before) {
  for (const s of koSheets()) if (!existsSync(inboxFile(dir, s.id))) rmSync(P(dir, "jobs", s.id), { recursive: true, force: true });
  if (before !== cfg.grid.n) { const all = readJson(P(dir, "sheets.json")); all.sheets = all.sheets.filter((s) => isLatinSheet(s) || !isRedo(s)); writeJson(P(dir, "sheets.json"), all); } // 예전 격자의 다시 쓰기 장은 버린다
  planSheets(cfg);
  await blankGrid(P(dir, "style", "blank-grid.png"), 1024, null, undefined, { N: gridOfFont(cfg) });
}

function planSheets(cfg) {
  if (cfg.base) planBase(cfg);
  else if ((cfg.script ?? "ko") === "ja") planSheetsJa(cfg);
  else planSheetsKo(cfg);
  if (cfg.latin) addLatin();
}

// 바탕 글자(base): 그 글자들은 그리지 않는다 — 장은 영문(과 다시 쓰기)만
const baseGlyphs = (cfg) => readJson(cfg.base.glyphs) ?? die(`바탕 글자 그림 목록이 없다: ${cfg.base.glyphs}`);
function planBase(cfg) {
  const chars = [...new Set(baseGlyphs(cfg).glyphs.map((g) => g.ch))];
  const old = readJson(P(dir, "sheets.json"), { sheets: [] }).sheets.filter((s) => s.kind === "redo" || s.redo);
  writeJson(P(dir, "sheets.json"), { note: "modu-font 장 목록 — 바탕 글자(font.json base)는 그리지 않는다. redo 장은 redo 명령이 더한다", needed: chars.join(""), sheets: old });
  console.log(`- 바탕 글자 ${chars.length}자(그리지 않음): ${cfg.base.glyphs}`);
}

// 영문 3장(L1~L3)을 다시 쓰기 장 앞에 넣는다. 이미 있으면 그대로
function addLatin() {
  const all = readJson(P(dir, "sheets.json"));
  const L = latinSheets(), ids = new Set(L.map((s) => s.id));
  const rest = all.sheets.filter((s) => !ids.has(s.id));
  const at = rest.findIndex((s) => s.kind === "redo" || s.redo);
  rest.splice(at < 0 ? rest.length : at, 0, ...L);
  all.sheets = rest;
  all.needed = [...new Set([...all.needed, ...LATIN])].join("");
  writeJson(P(dir, "sheets.json"), all);
  console.log(`- 영문 ${L.length}장(L1~L3: 대소문자 52 + 부호 38 · 폰트에 이미 있는 부호는 그쪽을 쓴다)`);
}

function planSheetsKo(cfg) {
  const order = orderedHangul();
  const want = order.slice(0, Math.min(2350, cfg.count));
  const extra = order.slice(want.length); // 마지막 장 빈 칸은 목표 다음 글자로 채운다 — 같은 값에 글자가 더 생긴다
  const N = gridOfFont(cfg), per = N * N; // 한 장 N×N 칸(옛 작업 폴더는 6×6 = 36칸)
  const sheets = chunk(want, per).map((cells, i) => {
    const n = cells.length;
    while (cells.length < per) cells.push(extra.length ? extra.shift() : cells[cells.length % n]); // 남은 글자가 없으면(2,350자) 같은 장 글자를 돌려 쓴다(겹친 칸은 앞 것만 씀)
    // 자모 풀이는 글자 차례 433번째 이후 글자가 든 장부터(드문 글자) — 6×6 이면 0.5.0 과 같은 13번째 장부터
    return { id: `s${String(i + 1).padStart(2, "0")}`, kind: "hangul", rows: rowsOf(cells, N), spell: (i + 1) * per > 432 };
  });
  const SYM = scriptOf(cfg).symbols;
  // 부호 장도 같은 격자: 36자를 N² 칸에 돌려 채운다(같은 부호가 여러 칸 — 쓸 수 있는 첫 칸을 쓴다). 6×6 이면 36자 한 번씩
  sheets.push({ id: "sym", kind: "symbols", rows: rowsOf(Array.from({ length: per }, (_, i) => SYM[i % SYM.length]), N) });
  const old = readJson(P(dir, "sheets.json"), { sheets: [] }).sheets.filter((s) => s.kind === "redo" || s.redo);
  writeJson(P(dir, "sheets.json"), { note: "modu-font 장 목록 — redo 장은 redo 명령이 더한다", needed: want.join("") + SYM.join(""), sheets: [...sheets, ...old] });
  console.log(`- 장 ${sheets.length}개(격자 ${N}×${N} · 한글 ${want.length}자 ${sheets.length - 1}장 + 부호·자모·숫자 1장)`);
}

// 일본어: 가나 장(kNN, 171자 5장) → 한자 장(sNN, 목록 차례 count 자) → 부호 장(sym). 한자가 든 장은 활자 구조 참조(ref-3)를 늘 넣는다.
function planSheetsJa(cfg) {
  const kanjiAll = [...readFileSync(P(dir, cfg.kanji_file ?? "chars-kanji.txt"), "utf8")].filter(isKanji);
  const kanji = kanjiAll.slice(0, cfg.count);
  const extra = kanjiAll.slice(kanji.length);
  const fill = (cells) => { const n = cells.length; while (cells.length < 36) cells.push(extra.length ? extra.shift() : cells[cells.length % n]); return cells; };
  const kana = cfg.kana === false ? [] : chunk([...KANA], 36).map((cells, i) => { const n = cells.length; while (cells.length < 36) cells.push(cells[cells.length % n]); return { id: `k${String(i + 1).padStart(2, "0")}`, kind: "main", rows: rowsOf(cells), print: false }; });
  const han = chunk(kanji, 36).map((cells, i) => ({ id: `s${String(i + 1).padStart(2, "0")}`, kind: "main", rows: rowsOf(fill(cells)), print: true }));
  const SYM = scriptOf(cfg).symbols;
  const sheets = [...kana, ...han, { id: "sym", kind: "symbols", rows: rowsOf(SYM) }];
  const old = readJson(P(dir, "sheets.json"), { sheets: [] }).sheets.filter((s) => s.kind === "redo" || s.redo);
  const needed = (cfg.kana === false ? "" : KANA.join("")) + kanji.join("") + SYM.join("");
  writeJson(P(dir, "sheets.json"), { note: "modu-font 장 목록(일본어) — redo 장은 redo 명령이 더한다", needed, sheets: [...sheets, ...old] });
  console.log(`- 장 ${sheets.length}개(가나 ${kana.length ? KANA.length : 0}자 ${kana.length}장 + 한자 ${kanji.length}자 ${han.length}장 + 부호·숫자 1장)`);
}

// 이미 있는 작업 폴더에 영문을 더한다. --from <다른 작업 폴더>: 같은 글씨(같은 견본)로 받은 영문 장(inbox/L*.png)·검수(errors.json)를 옮겨 온다
async function cmdLatin() {
  const cfg = config(dir);
  if (!cfg.latin) { cfg.latin = true; writeJson(P(dir, "font.json"), cfg); }
  addLatin();
  if (!opt.from) { console.log("→ jobs 로 첫 영문 장(L1) 묶음을 만든다"); return; }
  if (opt.from === true) die("--from 다음에 영문 장을 받은 작업 폴더");
  const src = path.resolve(opt.from);
  const theirs = readJson(P(src, "sheets.json"))?.sheets ?? die(`${src} 는 작업 폴더가 아니다(sheets.json 없음)`);
  const errs = readJson(P(src, "errors.json"), {}), mine = readJson(P(dir, "errors.json"), {});
  const moved = [];
  for (const s of latinSheets()) {
    const t = theirs.find((x) => x.id === s.id);
    if (!t || !existsSync(inboxFile(src, s.id))) continue;
    if (t.rows.join("") !== s.rows.join("")) die(`${src} 의 ${s.id} 칸 배치가 이 폴더와 다르다 — 옮기지 않는다`);
    if (existsSync(inboxFile(dir, s.id)) && !opt.force) { console.log(`- ${s.id} 는 이미 받았다(덮어쓰려면 --force)`); continue; }
    mkdirSync(P(dir, "inbox"), { recursive: true });
    copyFileSync(inboxFile(src, s.id), inboxFile(dir, s.id));
    if (errs[s.id]) mine[s.id] = errs[s.id]; else delete mine[s.id];
    moved.push(s.id);
  }
  writeJson(P(dir, "errors.json"), mine);
  for (const f of ["latin-format.png", "latin-format.json"]) if (existsSync(P(src, "style", f)) && !existsSync(P(dir, "style", f))) copyFileSync(P(src, "style", f), P(dir, "style", f));
  console.log(moved.length ? `ok ${moved.join(" ")} 를 ${src} 에서 옮겼다(검수 결과 포함) → cut ${dir} ${moved.join(" ")}` : `옮길 영문 장이 없다(${src}/inbox/L1.png …)`);
  const redoL = theirs.filter((x) => x.kind === "latin" && x.redo && existsSync(inboxFile(src, x.id)));
  if (redoL.length) console.log(`- 그쪽의 영문 다시 쓰기 장(${redoL.map((x) => x.id).join(" ")})은 옮기지 않는다 — 여기서 redo 로 따로 만든다`);
}

async function cmdDrafts() {
  const d = P(dir, "jobs", "drafts");
  mkdirSync(d, { recursive: true });
  // 묶음 종류(지시서 14): --set hand|print — 기본은 font.json 의 kind
  const cfg0 = config(dir), set = opt.set == null ? kindOf(cfg0) : String(opt.set);
  if (!KINDS.includes(set)) die(`--set 은 hand(손글씨 시안) 또는 print(활자 시안) (받은 값: ${opt.set === true ? "없음" : opt.set})`);
  if (opt.style === true) die('--style 다음에 영어 설명이 필요하다(그 설명을 네 갈래로 변주한다)');
  const pr = set === "print";
  // --base a.png[,b.png]: 이미 있는 견본(다른 글자 체계라도)을 참조로, 같은 글씨로 이 폰트의 글자를 쓴 견본 한 장 — 받은 그림은 pick --whole
  if (opt.base && opt.base !== true) {
    const cfg = cfg0, ja = (cfg.script ?? "ko") === "ja";
    const bases = String(opt.base).split(",").map((f) => path.resolve(f.trim()));
    for (const f of bases) if (!existsSync(f)) die(`--base 그림이 없다: ${f}`);
    const sharp = await loadSharp();
    const refs = [];
    for (const [i, f] of bases.entries()) { await sharp(f).png().toFile(path.join(d, `ref-${i + 1}.png`)); refs.push(`ref-${i + 1}.png`); }
    const lines = ja ? DRAFT_LINES_JA : pr ? DRAFT_LINES_PRINT : DRAFT_LINES;
    const text = pr ? [
      `${refs.length > 1 ? `References 1-${refs.length} are` : "Reference 1 is"} a lettering sample in one printed typeface${ja ? " (in Korean)" : ""}: ${cfg.style_text}.`,
      `Draw a lettering sample page in the SAME typeface: the same stroke weight, contrast, serifs, proportions and slant, as if set from the same font family${ja ? ", now setting Japanese (hiragana, katakana and kanji) in that same typeface" : ""}.`,
      "A square sheet of plain white paper seen flat from directly above like a clean scan. Four lines of text set in this typeface, large, legible and centered, one sentence per line, with generous margins.",
      `Write each sentence exactly as given, every character and punctuation mark unchanged${ja ? " (Japanese kanji forms, every stroke correct)" : ""}:`,
      ...lines.map((l, i) => `${i + 1}. ${l}`),
      "It must look like professionally typeset printed type: perfectly straight baseline, consistent letterforms, the same character identical every time, crisp clean edges.",
      "Black ink only on white paper. No color, no grid, no ruled lines, no drawings, no labels, no text other than the four sentences.",
    ].join("\n") : [
      `${refs.length > 1 ? `References 1-${refs.length} are` : "Reference 1 is"} handwriting by one person${ja ? " (in Korean)" : ""}: ${cfg.style_text}.`,
      `Write a handwriting sample page by the SAME person with the SAME pen: the same stroke weight, roundness, proportions and slant, as if written on the same day${ja ? ", now writing Japanese (hiragana, katakana and kanji) in that same hand" : ""}.`,
      "A square sheet of plain white paper seen flat from directly above like a clean scan. Four lines of handwriting, large, legible and centered, one sentence per line, with generous margins.",
      `Write each sentence exactly as given, every character and punctuation mark unchanged${ja ? " (Japanese kanji forms, every stroke correct)" : ""}:`,
      ...lines.map((l, i) => `${i + 1}. ${l}`),
      "It must look handwritten by a real person, not a typeface: slightly uneven baseline, natural variation in size, the same character never identical twice.",
      "Black ink only on white paper. No color, no grid, no ruled lines, no drawings, no labels, no text other than the four sentences.",
    ].join("\n");
    writeFileSync(path.join(d, "prompt.txt"), text + "\n", "utf8");
    writeJson(path.join(d, "job.json"), { id: "drafts", kind: "sample", set, refs, out: "inbox/drafts.png", lines, size: "정사각, 긴 변 1500px 이상" });
    console.log(`ok jobs/drafts (견본 한 장, 참조 ${refs.length}장) — 그림을 inbox/drafts.png 로 받은 뒤 pick --whole`);
    return;
  }
  const styles = opt.style != null ? draftVariants(String(opt.style)) : pr ? DRAFT_STYLES_PRINT : DRAFT_STYLES;
  const lines = pr ? DRAFT_LINES_PRINT : DRAFT_LINES;
  const text = [
    "A square sheet of plain white paper, seen flat from directly above like a clean scan, divided into four equal quadrants (2x2) by thin light-grey lines.",
    pr ? "Each quadrant is a lettering sample of the SAME four Korean sentences, set in printed type on four lines, large, legible and centered, with generous margins."
      : "Each quadrant is a handwriting sample of the SAME four Korean sentences, written by hand on four lines, large, legible and centered, with generous margins.",
    "Write each sentence exactly as given, every Hangul character and punctuation mark unchanged, one sentence per line:",
    ...lines.map((l, i) => `${i + 1}. ${l}`),
    pr ? "It must look like professionally typeset printed type: perfectly straight baseline, consistent letterforms, the same letter identical every time, crisp clean edges."
      : "It must look handwritten by a real person, not a typeface: slightly uneven baseline, natural variation in letter size and stroke, the same letter never identical twice.",
    pr ? "Black only on white paper. No color, no drawings, no ruled lines, no text other than the sentences and the labels below."
      : "Black or dark grey only on white paper. No color, no drawings, no ruled lines, no text other than the sentences and the labels below.",
    "In the top-left corner of each quadrant, a small grey label with its number. The four quadrants differ only in the letter shapes:",
    ...styles.map(([n, s], i) => `- ${n} (${["top-left", "top-right", "bottom-left", "bottom-right"][i]}): ${s}.`),
  ].join("\n");
  writeFileSync(path.join(d, "prompt.txt"), text + "\n", "utf8");
  // set 은 hand 일 때 적지 않는다(0.6.0 의 job.json 과 같게) — pick --quad 는 없으면 hand 로 읽는다
  writeJson(path.join(d, "job.json"), { id: "drafts", ...(pr ? { set } : {}), refs: [], out: "inbox/drafts.png", styles: Object.fromEntries(styles) });
  console.log(`ok jobs/drafts/prompt.txt (${pr ? "활자" : "손글씨"} 시안 네 가지${opt.style != null ? " — --style 을 네 갈래로" : ""}) — 그림을 inbox/drafts.png 로 받은 뒤 pick --quad 1~4`);
}

async function cmdPick() {
  const sharp = await loadSharp();
  const src = opt.from ? path.resolve(opt.from) : inboxFile(dir, "drafts");
  if (!existsSync(src)) die(`${src} 가 없다 — drafts 묶음으로 그린 시안 그림을 이 이름으로 먼저 둔다`);
  if (opt.whole) { // drafts --base 로 그린 견본 한 장을 통째로
    await sharp(src).png().toFile(P(dir, "style", "sample.png"));
    const cfg = config(dir);
    if (opt.style && opt.style !== true) { cfg.style_text = opt.style; writeJson(P(dir, "font.json"), cfg); }
    console.log(`ok style/sample.png (견본 통째로) · 글씨 설명 "${cfg.style_text}"`);
    await gridFromSample(cfg);
    return;
  }
  const q = Number(opt.quad);
  if (!(q >= 1 && q <= 4)) die("--quad 1~4 (견본 한 장을 통째로 쓰려면 --whole)");
  const { width: W, height: H } = await sharp(src).metadata();
  const left = q % 2 ? 0 : Math.floor(W / 2), top = q <= 2 ? 0 : Math.floor(H / 2);
  await sharp(src).extract({ left, top, width: Math.floor(W / 2), height: Math.floor(H / 2) }).png().toFile(P(dir, "style", "sample.png"));
  const cfg = config(dir);
  // 시안 묶음(jobs/drafts/job.json)이 적은 네 설명과 종류를 따른다(지시서 14 — 활자 시안 · --style 변주). 옛 묶음은 손글씨 네 가지
  const dj = readJson(P(dir, "jobs", "drafts", "job.json"), null), dstyles = dj?.styles ?? Object.fromEntries(DRAFT_STYLES), dset = dj?.set ?? "hand";
  cfg.style_text = opt.style ?? dstyles[String(q)] ?? DRAFT_STYLES[q - 1][1];
  const kindNote = dj?.styles && kindOf(cfg) !== dset ? ` · 글씨 종류 ${kindOf(cfg)} → ${dset}(시안 묶음을 따름)` : "";
  if (kindNote) cfg.kind = dset;
  writeJson(P(dir, "font.json"), cfg);
  console.log(`ok style/sample.png (사분면 ${q}) · 글씨 설명 "${cfg.style_text}"${kindNote}`);
  await gridFromSample(cfg);
}

// 다시 쓰기 장: 본문(kind redo)과 부호(kind symbols + redo: true) 둘 다
const isRedo = (s) => s.kind === "redo" || !!s.redo;
const sha256Of = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const pending = (ids) => sheetsOf(dir).filter((s) => (ids.length ? ids.includes(s.id) : true) && !existsSync(inboxFile(dir, s.id)));

// 다시 쓰기 장(본문 · 부호 다시 쓰기)의 형식 참조: 같은 격자의 받은 본문 장 가운데 장 검사 "됨"이고 errors.json 의 틀린 칸이 가장 적은 장(같으면 앞 장).
//   "*" 로 버린 장은 뺀다. 후보가 없으면 null(→ 지금처럼 style/format.png). --format <장> 이면 그 장(받은 장 · 같은 격자여야 한다).
//   까닭(3단계 — 한 번뿐인 비교): 실수가 있던 첫 장을 형식 참조로 쓴 다시 쓰기 장 둘은 ㅁ 이 모두 둥글었고, 실수 없는 둘째 장을 쓴 장은 상자 꼴이 늘었다.
function redoFormatRef(N) {
  const errors = readJson(P(dir, "errors.json"), {});
  if (opt.format != null) {
    const id = String(opt.format), s = sheetsOf(dir).find((x) => x.id === id);
    if (!s || isLatinSheet(s)) die(`--format ${id}: 그런 한국어 장이 없다`);
    if (!existsSync(inboxFile(dir, id))) die(`--format ${id}: 아직 안 받은 장이다`);
    if (gridOfSheet(s) !== N) die(`--format ${id}: 격자가 다르다(${gridOfSheet(s)}×${gridOfSheet(s)} — 이 장은 ${N}×${N})`);
    return id;
  }
  const bad = (id) => (errors[id] && typeof errors[id] === "object" ? Object.keys(errors[id]).length : 0);
  const cand = sheetsOf(dir).filter((x) => isMainSheet(x) && !isRedo(x) && gridOfSheet(x) === N && errors[x.id] !== "*" && existsSync(inboxFile(dir, x.id)) && readJson(P(dir, "cells", x.id, "cells.json"), null)?.check?.verdict === "됨");
  if (!cand.length) return null;
  return cand.reduce((a, b) => (bad(b.id) < bad(a.id) ? b : a)).id; // 같으면 앞 장(reduce 는 앞 것을 남긴다)
}

async function cmdJobs() {
  const cfg = config(dir);
  if (!existsSync(P(dir, "style", "sample.png"))) die("style/sample.png 가 없다(init --sample, 또는 drafts → pick)");
  if (cfg.grid?.by === "pending") await gridFromSample(cfg); // 견본을 손으로 넣은 경우 — 격자를 아직 못 정했으면 지금 재서 정한다
  const fmt = existsSync(P(dir, "style", "format.png")) ? "sheet" : "blank";
  // 형식 참조가 된 장의 격자(옛 format.json 에는 없다 → 그 장의 줄 수, 그것도 없으면 6)
  const fj = readJson(P(dir, "style", "format.json"), null), fmtN = fmt === "sheet" ? fj?.n ?? (sheetsOf(dir).find((x) => x.id === fj?.sheet)?.rows.length ?? 6) : null;
  // 빈 격자: 폰트의 격자는 style/blank-grid.png, 다른 격자의 장(손으로 고친 장 목록 등)은 style/blank-grid-<N>.png 를 그때 만든다
  const blankFor = async (N) => { const name = N === gridOfFont(cfg) ? "blank-grid.png" : `blank-grid-${N}.png`; if (!existsSync(P(dir, "style", name))) await blankGrid(P(dir, "style", name), 1024, null, undefined, { N }); return name; };
  let list = pending(pos);
  // 첫 장 잠금: 첫 본문 장을 받았는데 형식 참조가 없으면(아직 안 잘랐거나 장 검사를 통과하지 못했다) 다른 한국어 장은 묶지 않고 멈춘다 — 떨어진 격자로 다음 장에 돈이 나가지 않게.
  //   영문 장은 그대로(자기 형식 참조 규칙이 따로 있다) — 다만 옵션 없이 부른 jobs 는 본문 차례라 영문만 따로 묶지 않는다. 받기 전의 jobs --all 은 예전처럼 모두 묶는다(묶음만 생긴다 — spend · openai 가 막는다).
  const gate = firstGate(cfg), held = gate?.got ? list.filter((s) => !isLatinSheet(s)) : [];
  const heldMsg = () => `첫 장(${gate.first.id})이 아직 통과하지 못했다(형식 참조 style/format.png 없음) — 다른 한국어 장(${held.map((s) => s.id).join(" ")})은 묶지 않는다. ${gate.todo}`;
  if (held.length) {
    list = pos.length || opt.all ? list.filter(isLatinSheet) : [];
    if (!list.length) die(heldMsg());
  }
  // 첫 장을 받아 자르고 확인하기 전에는 첫 한글 장 하나만 묶는다 — 나머지는 그 장을 형식 참조로 다시 만든다
  const firstOnly = fmt === "blank" && !pos.length && !opt.all && list.some(isMainSheet);
  if (firstOnly) list = [list.find(isMainSheet)];
  // 영문 장: 처음 받은 영문 장(style/latin-format.png)이 형식 참조 — 그 전에는 안내선 빈 격자, 그리고 첫 영문 장 하나만
  const latFmt = existsSync(P(dir, "style", "latin-format.png")) ? "sheet" : "blank";
  const latFirst = latFmt === "blank" && !pos.length && !opt.all && list.filter(isLatinSheet).length > 1;
  if (latFirst) { const first = list.find(isLatinSheet); list = list.filter((s) => !isLatinSheet(s) || s === first); }
  if (list.some(isLatinSheet) && !existsSync(P(dir, "style", "latin-grid.png"))) await blankGrid(P(dir, "style", "latin-grid.png"), 1024, null, undefined, { guides: true });
  const koRefs = []; // 한국어 장마다 실제로 쓴 형식 참조 — 끝 줄 안내에
  for (const s of list) {
    const d = P(dir, "jobs", s.id);
    mkdirSync(d, { recursive: true });
    copyFileSync(P(dir, "style", "sample.png"), path.join(d, "ref-1.png"));
    // 형식 참조로 받은 첫 장을 쓰는 것은 그 장과 격자가 같은 장만 — 다르면 이 장 격자의 빈 격자
    const lat = isLatinSheet(s), N = gridOfSheet(s);
    // 다시 쓰기 장은 틀린 칸이 가장 적은 "됨" 본문 장을 형식 참조로(--format 으로 고를 수 있다) — 그런 장이 없으면 지금처럼
    const rf = !lat && isRedo(s) && fmt === "sheet" ? redoFormatRef(N) : null;
    const f = lat ? latFmt : rf || (fmt === "sheet" && fmtN === N) ? "sheet" : "blank";
    copyFileSync(rf ? inboxFile(dir, rf) : P(dir, "style", lat ? (f === "sheet" ? "latin-format.png" : "latin-grid.png") : f === "sheet" ? "format.png" : await blankFor(N)), path.join(d, "ref-2.png"));
    const refs = ["ref-1.png", "ref-2.png"];
    if (s.print && !lat) { await blankGrid(path.join(d, "ref-3.png"), 1024, [...s.rows.join("")], scriptOf(cfg).font, { N }); refs.push("ref-3.png"); }
    writeFileSync(path.join(d, "prompt.txt"), prompt(s, cfg, { format: f, print: !!s.print && !lat }) + "\n", "utf8");
    // n 격자 · attempt 시도 번호(치운 그림 수 + 1) · key 보낼 때 쓸 키(spend --job, MCP idempotency_key) — 다시 받는 장은 키가 달라야 새 그림이 온다
    const attempt = attemptOf(dir, s.id, N);
    // ref_sha256: 참조 그림마다 sha256 — 서버에 이미 올린 그림이면(style/uploaded.json, 에이전트가 적는다) 그 주소를 다시 쓴다. format_ref: 다시 쓰기 장이 형식 참조로 쓴 장
    const ref_sha256 = Object.fromEntries(refs.map((r) => [r, sha256Of(path.join(d, r))]));
    writeJson(path.join(d, "job.json"), { id: s.id, kind: s.kind, rows: s.rows, refs, out: `inbox/${s.id}.png`, size: "정사각, 긴 변 1500px 이상(2048 권장)", n: N, attempt, key: jobKey(dir, s.id, N, attempt), ref_sha256, ...(rf ? { format_ref: rf } : {}) });
    if (rf) console.log(`- ${s.id}: 형식 참조 = ${rf}${opt.format != null ? "(--format)" : "(틀린 칸이 가장 적은 '됨' 본문 장)"}`);
    if (!lat) koRefs.push(rf ? `받은 장 ${rf}` : f === "sheet" ? "처음 받은 장" : "빈 격자");
  }
  const refNote = [koRefs.length ? [...new Set(koRefs)].join(" · ") : null,list.some(isLatinSheet) ? `영문 ${latFmt === "sheet" ? "처음 받은 영문 장" : "안내선 빈 격자"}` : null].filter(Boolean).join(" · ");
  const tag = (s) => { const a = attemptOf(dir, s.id, gridOfSheet(s)); return a > 1 ? `${s.id}(시도 ${a})` : s.id; };
  console.log(`ok jobs ${list.length}장${refNote ? `(형식 참조: ${refNote})` : ""}: ${list.map(tag).join(" ") || "없음 — 모두 받음"}`);
  if (firstOnly) console.log(`- 첫 장만 묶었다. 받아서 cut·확인한 뒤 jobs 를 다시 돌리면 나머지 ${pending([]).length - 1}장을 만든다(지금 다 만들려면 --all)`);
  if (latFirst) console.log("- 영문은 첫 장(L1)만 묶었다. 받아서 cut·확인한 뒤 jobs 를 다시 돌리면 나머지 영문 장이 그 장을 형식 참조로 만들어진다");
  if (opt.all && gate && !gate.got && list.some((s) => !isLatinSheet(s) && s.id !== gate.first.id)) console.log(`- --all 은 묶음만 미리 만든 것이다. 첫 장(${gate.first.id})이 통과하기 전에는 첫 장만 그린다(다른 한국어 장은 spend · openai 가 멈춘다)`);
  if (held.length) die(heldMsg()); // 영문 장만 묶었다 — 한국어 장은 첫 장이 통과한 뒤에
}

function cellState() {
  const errors = readJson(P(dir, "errors.json"), {});
  const got = new Map(); // 글자 → { sheet, rc }
  for (const s of sheetsOf(dir)) {
    const cdir = P(dir, "cells", s.id);
    if (!existsSync(cdir)) continue;
    if (errors[s.id] === "*") continue; // errors.json 에 "*" — 그 장을 통째로 버림(지시서 12)
    const meta = readJson(path.join(cdir, "cells.json"), { cells: [] });
    for (const c of meta.cells) {
      if (c.empty || c.skip) continue; // skip: 장 검사가 못 쓴다고 한 칸(못 쓰는 줄 · 안 된 장 · 경계 넘음) — 폰트에 쓰지 않고 redo 가 그 글자를 다시 쓰기 장으로 보낸다
      const mark = errors[s.id]?.[c.rc];
      if (mark === "?" || mark === "") continue;
      const ch = mark ?? c.ch;
      if (!got.has(ch)) got.set(ch, { sheet: s.id, rc: c.rc, file: `cells/${s.id}/${c.rc}.png`, cell: meta.cellH, latin: isLatinSheet(s) });
    }
  }
  // 바탕 글자(base)는 영문 장의 같은 글자보다 앞선다 — 한국어 폰트의 , . ? ! 등을 그대로 둔다
  const cfg = config(dir);
  if (cfg.base) for (const g of baseGlyphs(cfg).glyphs) { const cur = got.get(g.ch); if (!cur || cur.latin) got.set(g.ch, { base: g }); }
  return got;
}

function cmdStatus() {
  const all = readJson(P(dir, "sheets.json"));
  const got = cellState();
  const need = [...all.needed];
  const miss = need.filter((c) => !got.has(c));
  const rows = all.sheets.map((s) => {
    const recv = existsSync(inboxFile(dir, s.id)), cm = readJson(P(dir, "cells", s.id, "cells.json"), null), cut = !!cm;
    const N = gridOfSheet(s), a = attemptOf(dir, s.id, N), ck = cm?.check;
    const verdict = ck ? ` ${ck.verdict}${ck.unusable_rows?.length ? `(못 쓰는 줄 ${ck.unusable_rows.join(",")})` : ck.verdict === "안 됨" && ck.reason ? `(${ck.reason})` : ""}` : "";
    return `${s.id.padEnd(5)} ${s.kind.padEnd(8)} ${recv ? "받음" : "  - "} ${cut ? "자름" : "  - "} ${N}×${N}${verdict}${a > 1 ? ` · 시도 ${a}` : ""}`;
  });
  console.log(rows.join("\n"));
  const l = ledger(dir);
  console.log(`\n글자 ${need.length - miss.length}/${need.length} · 받을 장 ${pending([]).length} · 쓴 돈(장부) ${spentUsd(l)} USD${l.approved_at ? "" : " · 승인 기록 없음"}`);
  if (miss.length && miss.length <= 60) console.log(`없는 글자: ${miss.join("")}`);
  for (const line of gridNotes(config(dir))) console.log(line);
}

// 치운 그림(다시 받은 장)과 그 그림에 든 돈 — 장부에서 --job 이 그 그림의 키와 같은 줄만 센다(다른 이름으로 적은 것은 알 수 없다)
function rejectedSummary() {
  const rej = rejectedLog(dir).rejected, l = ledger(dir);
  const usd = +rej.reduce((s, x) => s + l.spent.filter((r) => r.job === x.key && r.state !== "failed").reduce((a, r) => a + Math.max(0, r.usd || 0), 0), 0).toFixed(4);
  return { rej, usd };
}
// status · estimate 가 같이 보여 주는 줄: 격자와 근거 · 치운 그림 · 격자가 바뀐 뒤 승인이 필요한지
function gridNotes(cfg) {
  const out = [], { rej, usd } = rejectedSummary(), l = ledger(dir);
  if (cfg.grid) out.push(`격자 ${cfg.grid.n}×${cfg.grid.n}(${{ auto: "자동", user: "사용자", down: "낮춤", pending: "견본 전" }[cfg.grid.by] ?? cfg.grid.by}) — ${cfg.grid.why}`);
  if (rej.length) out.push(`치운 그림 ${rej.length}장(${rej.map((x) => `${x.sheet} ${x.grid}×${x.grid} 시도 ${x.attempt}`).join(" · ")}) · 그 그림에 든 돈 ${usd} USD(장부의 --job 이 키와 같은 것만)`);
  const gc = l.grid_changes?.at(-1);
  const rq = l.redo_quotes?.at(-1);
  if (rq && (!l.approved_at || rq.at > l.approved_at)) out.push(`다시 쓰기 장(${rq.sheets.join(" ")})이 생긴 뒤 승인이 없다 — check · spend · openai 가 멈춘다. 새 견적(${rq.usd} USD)을 사용자에게 말하고 approve 를 다시 받는다`);
  if (gc && (!l.approved_at || gc.at > l.approved_at)) out.push(`격자가 바뀐 뒤(${gc.from}×${gc.from} → ${gc.to}×${gc.to}, 장 ${gc.sheets_before} → ${gc.sheets_after}) 승인이 없다 — check 가 멈춘다. 새 견적을 사용자에게 말하고 approve 를 다시 받는다`);
  return out;
}

function cmdEstimate({ newQuote = false } = {}) {
  const cfg = config(dir);
  // --price 로 준 장당 값은 font.json(price_usd)에 적어 둔다 — 그 뒤의 estimate · grid --down · openai 가 모두 그 값을 쓴다(서버 견적이 font.json 과 다를 때 한 번만 주면 된다)
  if (opt.price != null) {
    const p = num(opt.price, "--price");
    if (p !== cfg.price_usd) { console.log(`장당 값 ${cfg.price_usd} → ${p} USD 를 font.json(price_usd)에 적었다 — 이 뒤의 견적(estimate · grid --down)과 openai 의 장부 값이 이 값을 쓴다`); cfg.price_usd = p; writeJson(P(dir, "font.json"), cfg); }
  }
  const price = Number(cfg.price_usd);
  const list = pending(pos);
  const usd = +(list.length * price).toFixed(2);
  const l = ledger(dir);
  console.log(`견적: ${list.length}장 × ${price} USD = ${usd} USD (이미 쓴 돈 ${spentUsd(l)} USD — 장부)`);
  // 견적을 사용자에게 말하고 "예"를 들으면 approve --note 로 적는다. 금액 한도는 없다 — 다시 받기 · 다시 쓰기 · 격자 낮추기는 그때마다 새 견적을 말한다
  if (newQuote) console.log("격자가 바뀌어 새 견적이다 — 이 견적을 사용자에게 말하고 승인을 다시 받아 approve --note 로 적기 전에는 check · spend · openai 가 멈춘다");
  const again = list.filter((s) => attemptOf(dir, s.id, gridOfSheet(s)) > 1);
  if (again.length) console.log(`다시 받는 장(한 번 더): ${again.map((s) => `${s.id}(시도 ${attemptOf(dir, s.id, gridOfSheet(s))})`).join(" ")} — 위 장 수에 들어 있다`);
  for (const line of gridNotes(cfg)) console.log(line);
  console.log("값은 font.json price_usd 기준 어림이다. 실제 값은 쓰는 서비스의 가격표·견적(dry run)으로 확인한다 — 다르면 estimate <dir> --price <그 값> 을 한 번 돌린다(font.json 에 적혀 그 뒤로 그 값을 쓴다).");
}

// 승인: 견적을 들은 사용자가 "예"라고 한 기록. --note 에 사용자가 실제로 한 말을 적는다(장부만으로는 "예"를 들었는지 알 수 없으니 기록이라도 남긴다).
//   금액 한도는 없다(지시서 11). 예전 옵션 --cap · --sheets 를 주면 무시한다고 한 줄 내고 승인만 적는다.
function cmdApprove() {
  if (!opt.note || opt.note === true) die('--note "<사용자가 한 말 그대로, 예: 4장 1.72달러 예>" 가 필요하다');
  if (opt.cap != null || opt.sheets != null) console.log("- --cap · --sheets: 상한은 없어졌다 — 무시한다(승인 기록만 적는다)");
  const l = ledger(dir);
  const at = new Date().toISOString();
  l.approved_at = at; l.note = String(opt.note);
  l.approvals = [...(l.approvals ?? []), { at, note: String(opt.note) }];
  writeJson(ledgerFile(dir), l);
  console.log(`ok 승인 기록(${at}) — 이미 쓴 돈 ${spentUsd(l)} USD · ${sheetsUsed(l)}장(장부)`);
}

// 한 장 그리기 전: 승인 기록이 있는가(격자가 바뀐 뒤라면 그 뒤의 승인이 있는가)만 본다. 금액은 보지 않는다(--usd 를 주어도 쓰지 않는다)
function cmdCheck() {
  const r = canSpend(dir);
  console.log(r.ok ? `ok 승인 기록 있음 — 이미 쓴 돈 ${r.spent} USD · ${r.sheets}장(장부)` : `멈춤: ${r.reason}`);
  process.exit(r.ok ? 0 : 1);
}

// 에이전트(C)가 그리기 직전에 견적 금액으로 적는다. --job 은 그 요청의 idempotency key — 같은 키로 다시 적으면 무시한다(재시도는 한 번만 청구되므로).
function cmdSpend() {
  if (!opt.sheet || opt.sheet === true) die("--sheet <장> --usd <금액> [--backend codex|mcp|agent] [--job <id>]");
  const usd = num(opt.usd, "--usd");
  const ids = new Set([...sheetsOf(dir).map((s) => s.id), "drafts"]);
  if (!ids.has(opt.sheet)) die(`모르는 장: ${opt.sheet} (sheets.json 의 장 또는 drafts)`);
  const backend = opt.backend ?? "agent";
  if (!["agent", "mcp", "codex"].includes(backend)) die("--backend 는 codex · mcp · agent 중 하나");
  // --job 은 묶음(jobs/<장>/job.json)의 key 를 준다 — 도구가 정해 준 키(<작업 폴더 이름>-<장>-g<격자>-<시도>). 다시 받는 장은 시도 번호가 달라 따로 적힌다.
  //   같은 --job 은 한 번만 적는다(0.5.0 과 같다). --job 을 안 주면 0.5.0 처럼 부를 때마다 적는다 — 덜 적히는 쪽이 위험하다. 그 줄에도 묶음의 key 를 남긴다(치운 그림에 든 돈을 세려고).
  const bundle = readJson(P(dir, "jobs", opt.sheet, "job.json"), null);
  const given = opt.job && opt.job !== true ? String(opt.job) : null, job = given ?? bundle?.key ?? null;
  if (given && ledger(dir).spent.some((x) => x.job === given)) { console.log(`이미 기록된 작업 id(${given}) — 다시 적지 않음`); return; }
  // 첫 장 잠금: 형식 참조가 없으면 첫 본문 장이 아닌 한국어 장(본문 · 부호 · 다시 쓰기)은 적지 않고 멈춘다 — 적는다는 것은 곧 그린다는 뜻이다. drafts 와 영문 장은 그대로
  const gate = firstGate(config(dir)), sh = sheetsOf(dir).find((s) => s.id === opt.sheet);
  if (gate && sh && !isLatinSheet(sh) && sh.id !== gate.first.id) die(`첫 장(${gate.first.id})이 통과하기 전이다 — ${opt.sheet} 는 아직 그리지 않는다(장부에 적지 않았다). ${gate.todo}`);
  // 승인 기록이 없거나 격자가 바뀐 뒤 새 승인이 없으면 적지 않는다 — 적는다는 것은 곧 그린다는 뜻이다
  const ok = canSpend(dir);
  if (!ok.ok) die(`${opt.sheet} 는 적지 않았다 — ${ok.reason}`);
  const l = recordSpend(dir, { sheet: opt.sheet, usd, backend, job, ...(bundle?.n ? { grid: bundle.n, attempt: bundle.attempt } : {}) });
  console.log(`ok 기록${job ? `(${job})` : ""} · 쓴 돈 ${spentUsd(l)} USD · ${sheetsUsed(l)}장(장부)`);
}

// B: OpenAI 이미지 편집 API(참조 그림 여러 장 + 프롬프트). 키는 환경 변수 OPENAI_API_KEY 에서만 읽고 출력하지 않는다.
async function cmdOpenai() {
  const cfg = config(dir);
  const o = { ...cfg.openai, ...(opt.model ? { model: opt.model } : {}), ...(opt.size ? { size: opt.size } : {}), ...(opt.quality ? { quality: opt.quality } : {}) };
  const price = Number(opt.price ?? cfg.price_usd);
  let list = pending(pos).filter((s) => existsSync(P(dir, "jobs", s.id, "prompt.txt")));
  if (!list.length) die("그릴 장이 없다(jobs 를 먼저, 이미 받은 장은 건너뜀)");
  // 첫 장 잠금: 형식 참조가 없으면 첫 본문 장이 아닌 한국어 장은 보내지 않는다(받은 첫 장이 장 검사에 떨어진 채로 둘째 장이 나가지 않게). 영문 장은 그대로
  const gate = firstGate(cfg), held = gate ? list.filter((s) => !isLatinSheet(s) && s.id !== gate.first.id) : [];
  if (held.length) {
    list = list.filter((s) => !held.includes(s));
    const msg = `첫 장(${gate.first.id})이 통과하기 전이라 ${held.map((s) => s.id).join(" ")} 는 보내지 않는다 — ${gate.todo}`;
    if (!list.length) die(msg);
    console.log(msg);
  }
  // 첫 장을 자르고 확인하기 전(format.png 없음)에는 승인이 있어도 한 장만 보낸다 — 첫 장이 틀리면 나머지 돈이 다 버려진다
  if (!existsSync(P(dir, "style", "format.png")) && list.length > 1) {
    list = [list.find(isMainSheet) ?? list[0]];
    console.log(`첫 장 확인 전이라 ${list[0].id} 한 장만 보낸다 — cut 으로 자르고 사용자와 본 뒤 jobs → openai 를 다시 돌린다`);
  }
  if (!existsSync(P(dir, "style", "latin-format.png")) && list.filter(isLatinSheet).length > 1) {
    const first = list.find(isLatinSheet);
    list = list.filter((s) => !isLatinSheet(s) || s === first);
    console.log(`영문 첫 장 확인 전이라 영문은 ${first.id} 한 장만 보낸다`);
  }
  if (opt["dry-run"]) {
    for (const s of list) { const j = readJson(P(dir, "jobs", s.id, "job.json")); console.log(`[dry-run] ${s.id}${j.attempt > 1 ? `(시도 ${j.attempt})` : ""} · POST https://api.openai.com/v1/images/edits · model ${o.model} · size ${o.size} · quality ${o.quality} · image[] ${j.refs.join(", ")}${j.key ? ` · 장부 키 ${j.key}` : ""}`); }
    console.log(`[dry-run] ${list.length}장 × ${price} USD ≈ ${(list.length * price).toFixed(2)} USD — 아무것도 보내지 않음`);
    const c = canSpend(dir);
    if (!c.ok) console.log(`[dry-run] 지금 보내면 멈춘다: ${c.reason}`);
    return;
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) die("환경 변수 OPENAI_API_KEY 가 없다 — 사용자가 자기 터미널에서 설정한다(값을 대화에 붙이지 않는다)");
  for (const s of list) {
    const c = canSpend(dir);
    if (!c.ok) die(`${s.id} 전에 멈춤: ${c.reason}. 승인을 적은 뒤 다시 돌리면 받은 장은 건너뛴다`);
    const job = readJson(P(dir, "jobs", s.id, "job.json"));
    const form = new FormData();
    form.append("model", o.model);
    form.append("prompt", readFileSync(P(dir, "jobs", s.id, "prompt.txt"), "utf8"));
    form.append("size", o.size);
    form.append("quality", o.quality);
    form.append("n", "1");
    for (const r of job.refs) form.append("image[]", new Blob([readFileSync(P(dir, "jobs", s.id, r))], { type: "image/png" }), r);
    // 보내기 전에 장부에 "보냄"을 적는다 — 응답 전에 끊기면 다시 돌릴 때 사람에게 확인받게(두 번 결제 방지)
    const tries = ledger(dir).spent.filter((x) => x.sheet === s.id && x.backend === "openai");
    if (tries.some((x) => x.state === "sent") && !opt.retry) die(`${s.id}: 지난번에 보내고 결과를 못 받았다. 서비스 사용 내역을 확인한 뒤 --retry 로 다시`);
    // 보낼 때마다 장부에 한 줄 — 다시 받는 장(retry 명령 뒤)은 시도 번호 · 키가 다른 새 줄이 된다
    recordSpend(dir, { sheet: s.id, usd: price, backend: "openai", state: "sent", model: o.model, ...(job.key ? { job: job.key, grid: job.n, attempt: job.attempt } : {}) });
    const res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
    const body = await res.json().catch(() => ({}));
    const l = ledger(dir);
    const row = l.spent.findLast((x) => x.sheet === s.id && x.state === "sent");
    if (!res.ok || !body.data?.[0]?.b64_json) {
      row.state = "failed"; row.usd = 0; row.error = `${res.status} ${body.error?.message ?? ""}`.trim();
      writeJson(ledgerFile(dir), l);
      die(`${s.id} 실패: ${row.error}`);
    }
    mkdirSync(P(dir, "inbox"), { recursive: true });
    writeFileSync(inboxFile(dir, s.id), Buffer.from(body.data[0].b64_json, "base64"));
    row.state = "done"; row.usage = body.usage ?? null;
    writeJson(ledgerFile(dir), l);
    console.log(`ok ${s.id} → inbox/${s.id}.png · 쓴 돈(어림, 장부) ${spentUsd(l)} USD`);
  }
}

// ---- 자르기: 하늘색 격자선을 찾아 6×6 칸으로, 잉크만 남긴 회색 칸 그림 + 검토 페이지
function linesOf(counts, n = 7) {
  const minGap = counts.length / 10;
  const idx = [...counts.keys()].sort((a, b) => counts[b] - counts[a]);
  const picked = [];
  for (const i of idx) {
    if (picked.every((p) => Math.abs(p - i) > minGap)) picked.push(i);
    if (picked.length === n) break;
  }
  return picked.sort((a, b) => a - b);
}

// ---- 한국어 모드의 영문 아닌 장(본문 · 부호 · 다시 쓰기, 모든 격자): 장 검사 + 찾은 선대로 자르기. 경고(종료 코드 2)가 있었으면 true
//   판정 됨 = 예전의 ok · 일부 = 못 쓰는 줄의 칸만 안 쓴다 · 안 됨 = 그 장의 칸은 안 쓴다(선 수가 틀리면 칸을 만들지 않는다)
//   화면의 첫 낱말과 종료 코드는 다음 할 일(next.action)에 맞춘다: go · redo 면 "ok" / "일부:" + 종료 코드 0, 그 밖(retry · down · ask · stop)이면 "경고:" + 종료 코드 2 — 첫 장의 "일부"도 경고다
async function cutChecked(sharp, s, file) {
  const N = gridOfSheet(s), chars = [...s.rows.join("")];
  if (chars.length !== N * N) die(`${s.id}: 장 목록의 칸이 ${N}×${N} 이 아니다(${chars.length}칸) — sheets.json 의 그 장 줄을 본다`);
  let raw;
  try { raw = await sharp(file).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true }); } catch { die(`${file} 를 그림으로 읽지 못했다 — 원본 PNG(또는 JPG 를 PNG 로 바꾼 것)를 둔다`); }
  const { data, info } = raw, W = info.width, H = info.height;
  if (info.channels !== 3) die(`${file} 의 색 채널이 ${info.channels}개다 — RGB 그림(PNG)을 둔다`);
  const ck = checkSheet({ data, W, H }, N, { symbols: s.kind === "symbols" });
  const cdir = P(dir, "cells", s.id);
  rmSync(cdir, { recursive: true, force: true }); // 예전 그림 · 예전 격자의 칸이 남지 않게
  mkdirSync(cdir, { recursive: true });
  const badRows = new Set(ck.unusable_rows ?? []), lone = new Set(ck.unusable_cells ?? []), sheetBad = ck.verdict === "안 됨";
  const emptyLone = new Set(ck.empty_cells ?? []); // 6×6 한글 장: 그 칸만 빠지는 빈 칸 · 거의 빈 칸(줄 판정에 넣지 않는다 — 지시서 10)
  const cells = [];
  for (const c of ck.cells) {
    await sharp(c.g, { raw: { width: c.w, height: c.h, channels: 1 } }).png().toFile(path.join(cdir, `${c.rc}.png`));
    // skip: 폰트에 쓰지 않는 칸 — "장"(안 된 장) · "줄"(못 쓰는 줄) · "경계"(글자가 선을 넘은 칸)
    const skip = sheetBad ? "장" : badRows.has(c.r + 1) ? "줄" : lone.has(c.rc) ? "경계" : emptyLone.has(c.rc) && !c.blank ? "빈" : null; // "빈": 거의 빈 칸(옆 글자 조각만 든 칸). 아주 빈 칸은 empty 로 빠진다
    cells.push({ rc: c.rc, ch: chars[c.r * N + c.c], empty: c.blank, ...(skip ? { skip } : {}) });
  }
  const why = (ck.unusable_rows ?? []).map((r) => `${r}행: ${ck.unusable_rows_why[r].join(" / ")}`);
  // probs(경고): 장 검사 안 됨 · 정사각 아님 · 작음 (+ 아래에서 첫 장의 "일부"). 그 뒤 장의 "일부"와 부호 장의 빈 칸은 경고가 아니라 알림(notes)
  const probs = [], notes = [];
  if (sheetBad) probs.push(ck.reason === "선 수 틀림" ? `장 검사 안 됨 — 선 수 틀림: ${ck.reason_detail}. 칸을 만들지 않았다` : `장 검사 안 됨 — ${ck.reason}. 이 장의 칸은 폰트에 쓰지 않는다`);
  if (Math.abs(W / H - 1) > 0.02) probs.push(`정사각이 아니다(${W}×${H}) — 잘렸거나 다른 비율로 받았다`);
  if (Math.max(W, H) < 1500) probs.push(`작다(${W}×${H}, 기준 긴 변 1,500px 이상) — 윤곽이 거칠어진다`);
  if (ck.verdict === "일부") notes.push(`장 검사 일부 — ${ck.reason}. 그 줄의 칸은 폰트에 쓰지 않는다`);
  for (const w of why) notes.push(w);
  if (lone.size) notes.push(`글자가 선을 넘은 칸 ${lone.size}개(${[...lone].join(" ")}) — 그 칸은 폰트에 쓰지 않는다(옆 칸 글자가 넘어온 칸일 수도 있다)`);
  const blank = cells.filter((c) => c.empty);
  if (s.kind === "symbols" && blank.length) notes.push(`빈 칸 ${blank.length}개(${blank.map((c) => c.rc).join(" ")}) — 그 칸은 빠진다. 같은 부호의 다른 칸을 쓰고, 한 칸도 없으면 redo 가 다시 쓰기 장으로 보낸다`);
  const sizeProbs = probs.filter((p) => /^(정사각이 아니다|작다)/.test(p));
  const good = ck.verdict === "됨" && !probs.length && !blank.length && !emptyLone.size; // 형식 참조로 써도 되는 그림(빈 칸 0)
  const firstCand = isMainSheet(s) && firstMain()?.id === s.id && (!existsSync(P(dir, "style", "format.png")) || readJson(P(dir, "style", "format.json"), null)?.sheet === s.id);
  if (emptyLone.size) { const list = `빈 칸 ${emptyLone.size}개(${[...emptyLone].join(" ")})`; if (firstCand && ck.verdict === "됨") probs.push(`${list} — 첫 장은 빈 칸이 0 이어야 통과다(형식 참조가 될 수 없다). 6×6 은 그 칸만 빠지고 줄은 쓴다`); else notes.push(`${list} — 6×6 은 그 칸만 빠지고 그 줄의 다른 칸은 쓴다. 그 글자는 redo 가 다시 쓰기 장으로 보낸다`); }
  const attempt = attemptOf(dir, s.id, N);
  // 형식 참조(style/format.png): 판정이 "됨"이고 기준(정사각 · 1,500px · 빈 칸 0)에 맞는 첫 본문 장만
  const fmtPng = P(dir, "style", "format.png"), fmtJson = P(dir, "style", "format.json");
  const fmtSrc = readJson(fmtJson, null)?.sheet;
  if (isMainSheet(s)) {
    if (good && (!existsSync(fmtPng) || fmtSrc === s.id)) { copyFileSync(file, fmtPng); writeJson(fmtJson, { sheet: s.id, at: new Date().toISOString(), n: N }); }
    else if (!good && fmtSrc === s.id) { unlinkSync(fmtPng); unlinkSync(fmtJson); notes.push(`${s.id} 가 형식 참조였는데 이번 그림이 기준에 안 맞아 style/format.png 를 지웠다`); }
  }
  const fmtNow = readJson(fmtJson, null)?.sheet ?? null;
  const next = nextStep(s, N, ck, sizeProbs, fmtNow, emptyLone.size);
  // 종료 코드는 다음 할 일에 맞춘다: go(간다) · redo(그대로 가고 못 쓰는 줄만 다시 쓰기)가 아니면 "경고:" + 종료 코드 2. 첫 장의 "일부"도 통과가 아니라 경고다
  const warn = probs.length > 0 || (next.action !== "go" && next.action !== "redo");
  if (warn && !probs.length) probs.push(`장 검사 ${ck.verdict} — 첫 장은 "일부"도 통과가 아니다(형식 참조가 될 수 없다)`);
  writeJson(path.join(cdir, "cells.json"), {
    sheet: s.id, grid: ck.lines.ok ? "찾음" : "못 찾음(선 수 틀림)", size: [W, H], warnings: probs, cellH: ck.ys ? Math.round((ck.ys[N] - ck.ys[0]) / N) : null, cells,
    n: N, attempt,
    check: {
      rule: "임시 규칙(글씨체 다섯 개 · 장 18개에서 나왔다): 선 N+1 개 · 줄마다 선 자리 15% · 칸마다 글자 하나 · 못 쓰는 줄 20%",
      verdict: ck.verdict, reason: ck.reason, ...(ck.reason_detail ? { reason_detail: ck.reason_detail } : {}), lines: ck.lines,
      unusable_rows: ck.unusable_rows, unusable_rows_why: ck.unusable_rows_why ?? null, unusable_cells: ck.unusable_cells ?? [],
      evenness: ck.evenness ?? null, values: ck.values ?? null, flagged: ck.cells_check ?? null,
      row_lines: ck.row_lines ? { rows_flagged: ck.row_lines.rows_flagged, cols_flagged: ck.row_lines.cols_flagged, worst_row_off_pct: ck.row_lines.worst_row_off_pct, worst_col_off_pct: ck.row_lines.worst_col_off_pct } : null,
      xs: ck.xs, ys: ck.ys, notes: ck.notes ?? [],
    },
    next,
  });
  await reviewPng(sharp, s, cells);
  const head = warn ? "경고:" : ck.verdict === "일부" ? "일부:" : "ok";
  console.log(`${head} ${s.id} · ${N}×${N} · 격자 ${ck.lines.ok ? "찾음" : "못 찾음"}(선 ${ck.lines.vertical}/${ck.lines.horizontal}) · ${W}×${H} · 빈 칸 ${blank.length} · 장 검사 ${ck.verdict}${attempt > 1 ? ` · 시도 ${attempt}` : ""}`);
  for (const p of [...probs, ...notes]) console.log(`  - ${p}`);
  if (next.action !== "go" || fmtNow === s.id) console.log(`  → 다음: ${next.text}`);
  return warn;
}
// 장 검사 뒤의 다음 할 일(cells.json next 에도 적는다). action: go 간다 · retry 같은 격자로 다시 · down 격자를 낮춘다 · redo 못 쓰는 줄은 다시 쓰기로 · ask 멈추고 묻는다 · stop 더 내려갈 곳이 없다
//   첫 본문 장(형식 참조가 아직 없음)이 "됨"이 아니면: 처음 떨어지면 한 번 더, 그 격자에서 두 번째로 떨어지면 한 단계 낮춘다(첫 장의 "일부"도 통과가 아니다 — 형식 참조가 될 수 없다). 임시 규칙이다(근거가 되는 장이 없다).
//   그 뒤의 장: 안 됨 → 다시 받는다, 두 번 안 되면 멈추고 묻는다(격자는 낮추지 않는다). 일부 → 그대로 가고 redo.
//   "두 번"은 그 장 · 그 격자에서 떨어진 그림의 수로 센다(치운 기록 inbox/rejected/log.json 의 판정 + 지금 그림). 사용자가 글씨가 견본과 달라서 통과한 그림을 치운 것은 세지 않는다 —
//   시도 번호(치운 그림 수 + 1)와는 다른 수다. 시도 번호는 그림마다 달라야 하는 키에만 쓴다.
//   첫 본문 장 말고 받은 한국어 장이 있으면(첫 장만 다시 받는 경우) 격자를 낮추라고 하지 않는다 — 떨어지면 다시 받고, 두 번이면 묻는다.
const pastFails = (id, N) => { const r = rejectedLog(dir).rejected.filter((x) => x.sheet === id && x.grid === N); return { some: r.filter((x) => x.verdict === "일부").length, bad: r.filter((x) => x.verdict === "안 됨").length, blank: r.filter((x) => x.verdict === "됨" && (x.warnings ?? []).some((w) => /^빈 칸/.test(w))).length, size: r.filter((x) => (x.warnings ?? []).some((w) => /^(정사각이 아니다|작다)/.test(w))).length }; };
//   6×6 의 빈 칸(emptyN — 그 칸만 빠진다): 첫 장이면 판정이 "됨"이어도 통과가 아니다(떨어진 것으로 센다), 그 뒤의 장이면 redo.
function nextStep(s, N, ck, sizeProbs, fmtNow, emptyN = 0) {
  const lower = GRIDS.find((g) => g < N), again = `retry <dir> ${s.id} → jobs <dir> ${s.id} → 그리기 → cut <dir> ${s.id}`;
  const past = pastFails(s.id, N), isFirst = firstMain()?.id === s.id && !fmtNow; // 형식 참조가 아직 없는 첫 본문 장
  if (ck.verdict === "됨" && !sizeProbs.length && emptyN && !isFirst) return { action: "redo", text: `그대로 간다 — 빈 칸 ${emptyN}개의 글자는 폰트에 쓰지 않고, 장을 다 받은 뒤 redo 가 다시 쓰기 장으로 보낸다` };
  if (ck.verdict === "됨" && !sizeProbs.length && !(isFirst && emptyN)) return fmtNow === s.id ? { action: "go", text: `첫 장 통과 — 이 격자(${N}×${N})로 간다. 글씨가 견본과 같은지 사용자와 본 뒤 jobs <dir> 로 나머지 장을 묶는다(이제 격자는 못 바꾼다). 글씨가 견본과 다르면 retry <dir> ${s.id} 로 같은 격자에서 다시 받는다` } : { action: "go", text: "그대로 간다" };
  if (isFirst && (ck.verdict !== "됨" || emptyN)) { // 첫 장은 "일부"도 · 빈 칸이 있는 6×6 "됨"도 통과가 아니다 — 형식 참조가 될 수 없다
    const fails = past.some + past.bad + past.blank + 1, others = otherKoReceived().map((x) => x.id).join(" ");
    if (others) return fails < 2 ? { action: "retry", text: `첫 장이 장 검사를 통과하지 못했다(${ck.verdict}) — 같은 격자(${N}×${N})로 다시 받는다: ${again}. 이 격자로 이미 받은 장(${others})이 있어 격자는 낮추지 않는다` }
      : { action: "ask", text: `첫 장이 이 격자(${N}×${N})에서 두 번 통과하지 못했다 — 멈추고 사용자에게 묻는다: 한 번 더(retry) / 이미 받은 '됨' 본문 장을 형식 참조로 삼는다(cut <dir> <그 장>) / 다른 격자로 하려면 새 작업 폴더 / 그만. 이 격자로 이미 받은 장(${others})이 있어 격자는 낮추지 않는다(한 폰트는 한 격자)` };
    if (fails < 2) return { action: "retry", text: `첫 장이 장 검사를 통과하지 못했다(${ck.verdict}) — 같은 격자(${N}×${N})로 한 번 더: ${again}. 한 장 값이 더 든다는 것을 사용자에게 한 줄로 알린다` };
    if (lower) return { action: "down", text: `첫 장이 이 격자(${N}×${N})에서 두 번 통과하지 못했다 — 격자를 한 단계 낮춘다(${N} → ${lower}): grid <dir> --down → 화면의 새 견적을 사용자에게 말하고 승인을 다시 받아 approve --note → jobs <dir> ${s.id} → 그리기 → cut <dir> ${s.id}` };
    return { action: "stop", text: "6×6 에서도 첫 장이 두 번 통과하지 못했다 — 더 내려갈 격자가 없다. 멈추고 사용자에게 알린다: 견본이나 글씨 설명(--style)을 바꿔야 한다" };
  }
  if (ck.verdict === "안 됨") return past.bad + 1 < 2 ? { action: "retry", text: `같은 격자로 다시 받는다: ${again}. 한 장 값이 더 든다는 것을 사용자에게 한 줄로 알린다` } : { action: "ask", text: `같은 장이 두 번 안 됐다 — 멈추고 사용자에게 묻는다: 한 번 더(retry) / 그 장 글자를 다시 쓰기 장으로(그대로 두고 redo) / 그만. 격자는 낮추지 않는다` };
  if (sizeProbs.length) return past.size + 1 < 2 ? { action: "retry", text: `그림 크기 · 비율이 기준에 안 맞는다(격자 문제가 아니다) — 다시 받는다: ${again}` } : { action: "ask", text: "두 번 받아도 그림 크기 · 비율이 기준에 안 맞는다 — 멈추고 사용자에게 묻는다(그리는 도구의 크기 설정을 본다). 격자는 낮추지 않는다" };
  return { action: "redo", text: `그대로 간다 — 못 쓰는 줄(${ck.unusable_rows.join(",")}행)의 글자는 폰트에 쓰지 않고, 장을 다 받은 뒤 redo 가 다시 쓰기 장으로 보낸다` };
}

// ---- 다시 받기: 받은 그림을 inbox/rejected/<장>-g<격자>-<시도>.png 로 치우고 그 장의 칸 · 검수 그림 · 묶음 · 검수 표시를 지운다.
//   그 뒤 jobs 가 시도 번호와 키(job.json key)를 올려 다시 묶는다 — 키가 달라야 장부에 따로 적히고 서버가 새 그림을 준다.
//   (openai --retry 는 다른 것이다 — 보내고 응답을 못 받은 요청을 다시 보내는 옵션.)
const reviewFilesOf = (id) => (existsSync(P(dir, "review")) ? readdirSync(P(dir, "review")).filter((f) => f === `${id}.png` || (f.startsWith(`${id}-p`) && /^-p\d+\.png$/.test(f.slice(id.length)))) : []);
function rejectSheet(s, why) {
  const N = gridOfSheet(s), attempt = attemptOf(dir, s.id, N), key = jobKey(dir, s.id, N, attempt), file = `${s.id}-g${N}-${attempt}.png`;
  const cm = readJson(P(dir, "cells", s.id, "cells.json"), null), ck = cm?.check;
  mkdirSync(rejectedDir(dir), { recursive: true });
  renameSync(inboxFile(dir, s.id), path.join(rejectedDir(dir), file));
  const log = rejectedLog(dir);
  // verdict · warnings: 치울 때의 장 검사 판정과 경고(자르지 않고 치웠으면 null) — "두 번 떨어지면"은 이 기록으로 센다(nextStep 의 pastFails)
  log.rejected.push({ sheet: s.id, grid: N, attempt, key, file: `inbox/rejected/${file}`, at: new Date().toISOString(), why, verdict: ck?.verdict ?? null, reason: ck?.reason ?? null, warnings: cm ? cm.warnings ?? [] : null });
  writeJson(path.join(rejectedDir(dir), "log.json"), log);
  rmSync(P(dir, "cells", s.id), { recursive: true, force: true });
  rmSync(P(dir, "jobs", s.id), { recursive: true, force: true });
  for (const f of reviewFilesOf(s.id)) unlinkSync(P(dir, "review", f));
  let wasFormat = false;
  for (const [png, json] of [["format.png", "format.json"], ["latin-format.png", "latin-format.json"]]) if (readJson(P(dir, "style", json), null)?.sheet === s.id) { rmSync(P(dir, "style", png), { force: true }); rmSync(P(dir, "style", json), { force: true }); wasFormat = true; } // 형식 참조였으면 같이 치운다
  const errors = readJson(P(dir, "errors.json"), {});
  if (errors[s.id]) { delete errors[s.id]; writeJson(P(dir, "errors.json"), errors); } // 치운 그림에 대한 검수 표시
  return { N, attempt, file, wasFormat, verdict: ck?.verdict ?? null };
}
function cmdRetry() {
  if (!pos.length) die("retry <dir> <장> … — 치우고 다시 받을 장(예: retry ./my-font s01)");
  const all = sheetsOf(dir);
  for (const id of pos) {
    if (!all.some((x) => x.id === id)) die(`모르는 장: ${id} (sheets.json 의 장)`);
    if (!existsSync(inboxFile(dir, id))) die(`${id}: 받은 그림(inbox/${id}.png)이 없다 — 치울 것이 없다. 아직 안 받은 장은 jobs 로 묶어 그린다`);
  }
  for (const id of pos) {
    const r = rejectSheet(all.find((x) => x.id === id), "retry");
    console.log(`ok ${id} 의 그림을 inbox/rejected/${r.file} 로 치웠다(${r.N}×${r.N} · 시도 ${r.attempt}${r.verdict ? ` · 장 검사 ${r.verdict}` : ""}) — 다음은 시도 ${r.attempt + 1}`);
    if (r.wasFormat) console.log(`  - ${id} 가 형식 참조였다 — style/${isLatinSheet(all.find((x) => x.id === id)) ? "latin-format.png" : "format.png"} 도 같이 치웠다. 이 장이 다시 통과하기 전에는 그 형식 참조를 쓰는 다른 장을 묶거나 그리지 않는다`);
  }
  reviewHtml();
  console.log(`→ jobs <dir> ${pos.join(" ")} 로 다시 묶는다(jobs/<장>/job.json 의 key 가 새 시도 번호로 바뀐다 — 그 키로 spend 하고 그린다). 한 장 값이 더 든다는 것을 사용자에게 한 줄로 알린다(장부에는 그 키로 따로 적힌다)`);
}

// ---- 격자(한국어 모드): 보기 · 한 단계 낮추기 · 첫 장을 받기 전에 정하기
//   grid <dir>            지금 격자 · 근거 · 첫 장의 시도 · 치운 그림 · 내려갈 차례
//   grid <dir> --down     한 단계 낮춘다(14 → 12 → 10 → 8 → 6). 받은 그림을 치우고, 장 목록 · 빈 격자를 새 격자로 다시 만들고, 시도 번호는 새 격자에서 1 부터.
//                         장 수(값)가 바뀌므로 장부에 적는다 — 새 견적을 말하고 다시 승인(approve --note)받기 전에는 check · spend · openai 가 멈춘다.
//                         첫 장이 통과한 뒤(형식 참조가 생긴 뒤)와, 첫 본문 장 말고 받은 한국어 장이 있을 때는 못 바꾼다(--set · --auto 도).
//   grid <dir> --set <N>  첫 장을 받기 전에만: 사용자가 정한다      grid <dir> --auto  첫 장을 받기 전에만: 견본을 다시 재서 정한다
async function cmdGrid() {
  const cfg = config(dir);
  if (!isKo(cfg)) die("grid 는 한국어 모드에서만 쓴다 — 일본어 모드는 6×6 고정이다(한자 · 가나는 작은 칸으로 재 본 적이 없다)");
  if (cfg.base) die("grid 는 본문을 그리는 작업 폴더에서만 쓴다 — 바탕 글자(--base) 폴더는 영문 장(6×6)만 그린다");
  const N = gridOfFont(cfg), locked = existsSync(P(dir, "style", "format.png")), first = sheetsOf(dir).find((s) => isMainSheet(s) && !isRedo(s));
  const nSheets = () => sheetsOf(dir).length;
  if (!opt.down && opt.set == null && !opt.auto) {
    const g = cfg.grid, m = g?.measure, rej = rejectedLog(dir).rejected, down = GRIDS.slice(GRIDS.indexOf(N));
    console.log(`격자 ${N}×${N}${g ? `(${{ auto: "자동", user: "사용자", down: "낮춤", pending: "견본 전" }[g.by] ?? g.by})` : "(격자 정보가 없는 옛 작업 폴더 — 6×6)"}`);
    if (g) console.log(`- 근거: ${g.why}`);
    if (m) console.log(`- 견본에서 잰 값: 획 ${m.stroke_px ?? "-"}px ÷ 글자 높이 ${m.glyph_height_px ?? "-"}px = ${m.ratio ?? "못 잼"}${m.class ? ` → ${m.class}` : ""}${m.tilt_deg ? ` · 견본이 ${Math.abs(m.tilt_deg)}° 기울어 있어 되돌려서 쟀다` : ""}${m.error ? ` (${m.error})` : ""} · 경계 ${GRID_BOUND}(임시 규칙 — 글씨체 다섯 개에서 나왔다)`);
    console.log(`- 장: ${nSheets()}개(본문 ${sheetsOf(dir).filter((s) => isMainSheet(s) && !isRedo(s)).length} · 부호 ${sheetsOf(dir).filter((s) => s.kind === "symbols" && !s.redo).length} · 영문 ${sheetsOf(dir).filter(isLatinSheet).length} · 다시 쓰기 ${sheetsOf(dir).filter(isRedo).length})`);
    if (first) console.log(`- 첫 장(${first.id}): ${existsSync(inboxFile(dir, first.id)) ? "받음" : "안 받음"} · 지금 시도 ${attemptOf(dir, first.id, gridOfSheet(first))}번째`);
    if (rej.length) console.log(`- 치운 그림 ${rej.length}장: ${rej.map((x) => `${x.sheet} ${x.grid}×${x.grid} 시도 ${x.attempt}${x.verdict ? `(${x.verdict}${x.reason ? ` — ${x.reason}` : ""})` : ""}`).join(" · ")}`);
    console.log(`- 내려갈 차례: ${down.length > 1 ? down.join(" → ") : "없음(6×6 이 마지막)"}`);
    const others = otherKoReceived();
    console.log(locked ? "- 첫 장이 통과했다(형식 참조 style/format.png) — 격자는 이제 못 바꾼다(한 폰트 한 격자)"
      : others.length ? `- 첫 장 통과 전이지만 이 격자로 이미 받은 장이 있다(${others.map((s) => s.id).join(" ")}) — 격자는 못 바꾼다(한 폰트 한 격자). 첫 장은 같은 격자로 다시 받는다`
        : `- 첫 장 통과 전 — 같은 격자에서 장 검사에 두 번 떨어지면 grid <dir> --down${gridStarted() ? "" : " · 받기 전이라 grid <dir> --set <N> 도 된다"}`);
    if (g?.history?.length > 1) console.log(`- 이력: ${g.history.map((h) => `${h.n}×${h.n}(${h.by})`).join(" → ")}`);
    for (const line of gridNotes(cfg).filter((x) => !x.startsWith("격자 ") && !x.startsWith("치운 그림"))) console.log(`- ${line}`);
    return;
  }
  if (locked) die(`격자를 바꿀 수 없다 — 첫 장이 이미 통과했다(형식 참조 style/format.png, ${N}×${N}). 한 폰트는 한 격자다`);
  // 첫 본문 장 말고 받은 한국어 장이 있으면 거절한다 — 통과한 첫 장만 retry 로 치운 뒤(형식 참조가 사라져 위 잠금이 풀린다) --down 을 부르면 돈 주고 받은 장이 모두 치워지기 때문이다
  const kept = otherKoReceived();
  if (kept.length) die(`격자를 바꿀 수 없다 — 이 격자(${N}×${N})로 이미 받은 장이 있다(${kept.map((s) => s.id).join(" ")}). 한 폰트는 한 격자다 — 첫 장은 같은 격자로 다시 받는다(retry). 다른 격자로 하려면 새 작업 폴더에서 시작한다`);
  let d;
  if (opt.down) {
    const to = GRIDS[GRIDS.indexOf(N) + 1];
    if (to == null) die("더 내려갈 격자가 없다(6×6 이 마지막) — 멈추고 사용자에게 알린다: 견본이나 글씨 설명(--style)을 바꿔야 한다");
    const tries = first ? attemptOf(dir, first.id, N) - (existsSync(inboxFile(dir, first.id)) ? 0 : 1) : 0;
    d = { n: to, by: "down", why: `${N}×${N} 에서 첫 장이 통과하지 못해(받은 그림 ${tries}장) 한 단계 낮췄다` };
  } else {
    if (gridStarted()) die(`${opt.auto ? "--auto" : "--set"} 은 첫 장을 받기 전에만 쓴다 — 받은 뒤에는 grid <dir> --down 으로 한 단계씩 낮춘다`);
    if (opt.auto) {
      if (!existsSync(P(dir, "style", "sample.png"))) die("style/sample.png 가 없다 — 견본이 있어야 잰다(init --sample, 또는 drafts → pick)");
      d = gridDecision(null, await measureSample(await loadSharp(), P(dir, "style", "sample.png")));
    } else {
      const to = Number(opt.set);
      if (!GRIDS.includes(to)) die(`--set 은 ${[...GRIDS].reverse().join(" · ")} 가운데 하나(받은 값: ${opt.set === true ? "없음" : opt.set})`);
      d = { n: to, by: "user", why: `사용자가 정했다(${to}×${to})` };
    }
  }
  const before = nSheets(), moved = [];
  for (const s of koSheets()) if (existsSync(inboxFile(dir, s.id))) moved.push(rejectSheet(s, "grid").file); // 받은 그림(첫 장)을 치운다 — 새 격자의 형식 참조로 쓰이지 않게
  setGrid(cfg, d);
  writeJson(P(dir, "font.json"), cfg);
  console.log(`ok 격자 ${N}×${N} → ${d.n}×${d.n}${d.by === "down" ? "(한 단계 낮춤)" : d.by === "user" ? "(사용자)" : "(견본을 다시 잼)"}${moved.length ? ` · 치운 그림 ${moved.map((f) => `inbox/rejected/${f}`).join(" ")}` : ""}`);
  if (d.by === "auto") console.log(gridLine(cfg));
  await applyGrid(cfg, N);
  if (d.n !== N) noteGridChange(N, d.n, before, nSheets());
  reviewHtml();
  cmdEstimate({ newQuote: d.n !== N });
  if (d.n !== N) console.log(`→ 위 새 견적을 사용자에게 말하고 "예"를 받아 approve <dir> --note "<사용자가 한 말>" 로 적은 뒤 jobs <dir>${first ? ` ${first.id}` : ""} → 그리기 → cut`);
}
// 장부에 격자 바뀜을 적는다 — 그 뒤의 승인이 없으면 check · spend · openai 가 멈춘다(lib.mjs canSpend)
function noteGridChange(from, to, sheetsBefore, sheetsAfter) {
  const l = ledger(dir);
  l.grid_changes = [...(l.grid_changes ?? []), { at: new Date().toISOString(), from, to, sheets_before: sheetsBefore, sheets_after: sheetsAfter }];
  writeJson(ledgerFile(dir), l);
}

async function cmdCut() {
  const sharp = await loadSharp();
  const cfg0 = config(dir);
  const sheets = sheetsOf(dir).filter((s) => existsSync(inboxFile(dir, s.id)) && (pos.length ? pos.includes(s.id) : opt.all || !existsSync(P(dir, "cells", s.id, "cells.json"))));
  const warned = [];
  for (const s of sheets) {
    const file = inboxFile(dir, s.id);
    // 한국어 모드의 영문 아닌 장은 장 검사 길로(모든 격자). 영문 장 · 일본어 모드는 아래 예전 길(선 7개 · 1.3 · 6등분) 그대로 — 영문 장은 칸 안에 하늘색 안내선이 있어 선 세기가 달라진다
    if (isKo(cfg0) && !isLatinSheet(s)) { if (await cutChecked(sharp, s, file)) warned.push(s.id); continue; }
    let raw;
    try { raw = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true }); } catch { die(`${file} 를 그림으로 읽지 못했다 — 원본 PNG(또는 JPG 를 PNG 로 바꾼 것)를 둔다`); }
    const { data, info } = raw;
    const { width: W, height: H } = info;
    const cols = new Array(W).fill(0), rws = new Array(H).fill(0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; if (data[i + 2] - data[i] > 25 && data[i + 2] > 120) { cols[x]++; rws[y]++; } }
    let xs = linesOf(cols), ys = linesOf(rws);
    const even = (a) => { const d = a.slice(1).map((v, i) => v - a[i]); return Math.max(...d) / Math.min(...d); };
    const ok = xs.length === 7 && ys.length === 7 && even(xs) < 1.3 && even(ys) < 1.3;
    if (!ok) { xs = [0, 1, 2, 3, 4, 5, 6].map((i) => Math.round((W * i) / 6)); ys = [0, 1, 2, 3, 4, 5, 6].map((i) => Math.round((H * i) / 6)); }
    const cdir = P(dir, "cells", s.id);
    mkdirSync(cdir, { recursive: true });
    const cells = [], chars = [...s.rows.join("")];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
      const pad = Math.max(6, Math.round((xs[c + 1] - xs[c]) * 0.02));
      const box = { left: xs[c] + pad, top: ys[r] + pad, width: xs[c + 1] - xs[c] - 2 * pad, height: ys[r + 1] - ys[r] - 2 * pad };
      const cell = await sharp(file).removeAlpha().extract(box).raw().toBuffer({ resolveWithObject: true });
      const w = cell.info.width, h = cell.info.height, g = Buffer.alloc(w * h);
      let ink = 0;
      for (let p = 0, i = 0; p < w * h; p++, i += 3) {
        const R = cell.data[i], G = cell.data[i + 1], B = cell.data[i + 2];
        const v = B - R > 18 ? 255 : Math.round((R + G + B) / 3);
        g[p] = v; if (v < 150) ink++;
      }
      const rc = `${r}${c}`;
      await sharp(g, { raw: { width: w, height: h, channels: 1 } }).png().toFile(path.join(cdir, `${rc}.png`));
      cells.push({ rc, ch: chars[r * 6 + c], empty: ink < 30 });
    }
    // 받은 그림이 기준(정사각·긴 변 1,500px 이상·격자 찾음)에 맞는지 — 안 맞으면 "경고:"로 알리고 종료 코드 2
    const probs = [];
    if (!ok) probs.push("격자를 못 찾아 6등분으로 잘랐다(칸이 어긋났을 수 있다)");
    if (Math.abs(W / H - 1) > 0.02) probs.push(`정사각이 아니다(${W}×${H}) — 잘렸거나 다른 비율로 받았다`);
    if (Math.max(W, H) < 1500) probs.push(`작다(${W}×${H}, 기준 긴 변 1,500px 이상) — 윤곽이 거칠어진다`);
    const nEmpty = cells.filter((c) => c.empty).length;
    if (nEmpty) probs.push(`빈 칸 ${nEmpty}개(${cells.filter((c) => c.empty).map((c) => c.rc).join(" ")}) — 폰트에서 빠진다. 흐리거나 옅게 받았으면 다시 받는다`);
    const good = probs.length === 0; // 형식 참조로 써도 되는 그림 — 빈 칸도 흐린 그림의 신호라 깨끗한 장만 쓴다
    writeJson(path.join(cdir, "cells.json"), { sheet: s.id, grid: ok ? "찾음" : "못 찾음(6등분)", size: [W, H], warnings: probs, cellH: Math.round((ys[6] - ys[0]) / 6), cells });
    // 형식 참조(style/format.png): 기준에 맞는 첫 한글 장만. 그 장을 다시 받아 자르면 새 그림으로 바꾸고, 다시 받은 게 나쁘면 지운다(빈 격자로 돌아감)
    const fmtPng = P(dir, "style", "format.png"), fmtJson = P(dir, "style", "format.json");
    const fmtSrc = readJson(fmtJson, null)?.sheet;
    if (isMainSheet(s)) {
      if (good && (!existsSync(fmtPng) || fmtSrc === s.id)) { copyFileSync(file, fmtPng); writeJson(fmtJson, { sheet: s.id, at: new Date().toISOString() }); }
      else if (!good && fmtSrc === s.id) { unlinkSync(fmtPng); unlinkSync(fmtJson); console.log(`- ${s.id} 가 형식 참조였는데 이번 그림이 기준에 안 맞아 style/format.png 를 지웠다`); }
    }
    if (isLatinSheet(s) && !s.redo) { // 영문 형식 참조(style/latin-format.png): 기준에 맞는 첫 영문 장
      const lp = P(dir, "style", "latin-format.png"), lj = P(dir, "style", "latin-format.json"), lsrc = readJson(lj, null)?.sheet;
      if (good && (!existsSync(lp) || lsrc === s.id)) { copyFileSync(file, lp); writeJson(lj, { sheet: s.id, at: new Date().toISOString() }); }
      else if (!good && lsrc === s.id) { unlinkSync(lp); unlinkSync(lj); console.log(`- ${s.id} 가 영문 형식 참조였는데 이번 그림이 기준에 안 맞아 style/latin-format.png 를 지웠다`); }
    }
    await reviewPng(sharp, s, cells);
    console.log(`${probs.length ? "경고:" : "ok"} ${s.id} · 격자 ${ok ? "찾음" : "못 찾음"} · ${W}×${H} · 빈 칸 ${nEmpty}`);
    for (const p of probs) console.log(`  - ${p}`);
    if (probs.length) warned.push(s.id);
  }
  reviewHtml();
  if (!sheets.length) console.log("자를 장 없음 — inbox/<장>.png 를 넣는다. 이미 자른 장을 새 그림으로 바꿨으면 cut <dir> <장>");
  if (warned.length) { console.log(`경고 ${warned.length}장(${warned.join(" ")}) — 위의 "다음:" 을 따른다(없으면 review/<장>.png 로 보고, 칸이 어긋났거나 흐리면 그 장을 다시 받는다 — retry <dir> <장>)`); process.exitCode = 2; }
}

// 에이전트가 눈으로 보는 검토 그림: 칸 그림 옆에 써야 할 글자를 활자로
//   6×6 장은 한 장(review/<장>.png, 칸 200px — 0.5.0 과 같은 그림). 격자가 더 크면 6×6 칸씩 쪽을 나눈다(review/<장>-p01.png …, 칸 300px — 작은 칸의 글자를 크게 본다).
//   장 검사가 못 쓴다고 한 칸(cells.json skip)은 주황 바탕 + 까닭("못 쓰는 줄" · "안 된 장" · "경계 넘음").
const SKIP_LABEL = { 줄: "못 쓰는 줄(안 씀)", 장: "안 된 장(안 씀)", 경계: "경계 넘음(안 씀)", 빈: "거의 빈 칸(안 씀)" };
async function reviewPng(sharp, s, cells) {
  const font = scriptOf(config(dir)).font, N = gridOfSheet(s);
  mkdirSync(P(dir, "review"), { recursive: true });
  for (const f of reviewFilesOf(s.id)) unlinkSync(P(dir, "review", f)); // 예전 그림(쪽 수가 달랐을 수 있다)
  if (!cells.length) return;
  // 한 쪽 그리기: list = [{ c(칸), col, row }](쪽 안의 자리), S 칸 그림 크기
  const draw = async (list, S, title, out) => {
    const G = 6, cw = S + G, comp = [];
    for (const { c, col, row } of list) {
      const img = await sharp(P(dir, "cells", s.id, `${c.rc}.png`)).resize(S, S, { fit: "contain", background: "#fff" }).png().toBuffer();
      comp.push({ input: img, left: col * cw + G, top: row * cw + G + 40 });
    }
    // 빈 칸(잉크가 너무 적어 폰트에서 빠지는 칸)은 빨간 테두리 + "빈 칸" — 흐린 그림에서는 멀쩡해 보여도 빠진다
    const emptyMarks = list.map(({ c, col, row }) => c.empty ? `<rect x="${col * cw + G + 2}" y="${row * cw + G + 42}" width="${S - 4}" height="${S - 4}" fill="none" stroke="#d0301f" stroke-width="5"/><text x="${col * cw + G + S / 2}" y="${row * cw + G + 40 + S - 10}" text-anchor="middle" font-size="22" fill="#d0301f" font-family="Malgun Gothic, Apple SD Gothic Neo, Noto Sans CJK KR, sans-serif">빈 칸(빠짐)</text>` : "").join("");
    const skipMarks = list.map(({ c, col, row }) => c.skip && !c.empty ? `<rect x="${col * cw + G + 2}" y="${row * cw + G + 42}" width="${S - 4}" height="${S - 4}" fill="#f59e0b" fill-opacity="0.16" stroke="#d97706" stroke-width="5"/><text x="${col * cw + G + S / 2}" y="${row * cw + G + 40 + S - 10}" text-anchor="middle" font-size="22" fill="#b45309" font-family="Malgun Gothic, Apple SD Gothic Neo, Noto Sans CJK KR, sans-serif">${SKIP_LABEL[c.skip] ?? "안 씀"}</text>` : "").join("");
    const labels = emptyMarks + skipMarks + list.map(({ c, col, row }) => `<text x="${col * cw + G + S - 6}" y="${row * cw + G + 40 + 38}" text-anchor="end" font-size="34" fill="#1f5fd0" font-family="${font}">${esc(c.ch)}</text><text x="${col * cw + G + 6}" y="${row * cw + G + 40 + S - 8}" font-size="14" fill="#999" font-family="sans-serif">${c.rc}</text>`).join("");
    const Wt = 6 * cw + G, Ht = 6 * cw + G + 40;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wt}" height="${Ht}"><text x="10" y="28" font-size="22" font-family="sans-serif">${esc(title)}</text>${labels}</svg>`;
    await sharp({ create: { width: Wt, height: Ht, channels: 3, background: "#fff" } }).composite([...comp, { input: Buffer.from(svg), left: 0, top: 0 }]).png().toFile(P(dir, "review", out));
  };
  if (N <= 6) { await draw(cells.map((c, k) => ({ c, col: k % 6, row: Math.floor(k / 6) })), 200, `${s.id} — 파란 글자가 그 칸에 써야 할 글자`, `${s.id}.png`); return; }
  const per = 6, np = Math.ceil(N / per);
  for (let pr = 0; pr < np; pr++) for (let pc = 0; pc < np; pc++) {
    const list = [];
    for (let r = pr * per; r < Math.min(N, pr * per + per); r++) for (let c = pc * per; c < Math.min(N, pc * per + per); c++) list.push({ c: cells[r * N + c], col: c - pc * per, row: r - pr * per });
    const p = pr * np + pc + 1;
    await draw(list, 300, `${s.id} ${p}/${np * np}쪽 · ${pr * per + 1}~${Math.min(N, pr * per + per)}행 · ${pc * per + 1}~${Math.min(N, pc * per + per)}열 — 파란 글자가 그 칸에 써야 할 글자 · 주황 = 장 검사가 안 쓴다고 한 칸`, `${s.id}-p${sid(p)}.png`);
  }
}

// 사람이 보는 검토 페이지: 칸을 누르면 "버림", 다른 글자로 쓰였으면 그 글자를 적고, 아래 JSON 을 errors.json 에 붙인다
function reviewHtml() {
  const errors = readJson(P(dir, "errors.json"), {});
  // n 격자(열 수) · note 장 검사 판정(있으면) — 못 쓰는 칸(skip)은 주황 점선으로 보인다
  const data = sheetsOf(dir).filter((s) => existsSync(P(dir, "cells", s.id, "cells.json"))).map((s) => { const m = readJson(P(dir, "cells", s.id, "cells.json")), ck = m.check; return { id: s.id, n: m.n ?? gridOfSheet(s), note: ck ? `${m.n}×${m.n} · 장 검사 ${ck.verdict}${ck.unusable_rows?.length ? ` — 못 쓰는 줄 ${ck.unusable_rows.join(", ")}행(주황, 폰트에 안 쓴다)` : ck.verdict === "안 됨" ? ` — ${ck.reason}(이 장은 안 쓴다)` : ""}` : "", cells: m.cells }; });
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>칸 검토</title>
<style>:root{color-scheme:light dark;--bg:#f4f5f7;--card:#fff;--ink:#1b2030;--line:#d8dce4;--blue:#2b67b8;--bad:#c93a2f}
@media (prefers-color-scheme:dark){:root{--bg:#13161c;--card:#1a1e26;--ink:#e6e8ee;--line:#2e3440;--blue:#86b4ff;--bad:#ff8a80}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 'Malgun Gothic',sans-serif}main{max-width:1320px;margin:0 auto;padding:20px 16px 200px}
h2{margin:18px 0 6px}h2 small{font-weight:400;font-size:13px;opacity:.75}.g{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;overflow-x:auto}
.g.big{gap:4px}.g.big .c b{font-size:17px;right:3px;top:0}.g.big .c i{font-size:9px;left:3px;bottom:0}.g.big .c em{font-size:14px;left:3px;top:0}
.c.skip{border-color:#d97706;border-style:dashed;background:#fdf0d9}.c.skip:after{content:attr(data-skip);position:absolute;left:0;right:0;bottom:12px;text-align:center;color:#b45309;font-size:11px}
.c{position:relative;background:#fff;border:2px solid var(--line);border-radius:8px;cursor:pointer;aspect-ratio:1}.c img{width:100%;height:100%;object-fit:contain}
.c b{position:absolute;right:6px;top:2px;font-size:26px;color:#1f5fd0;font-weight:400}.c i{position:absolute;left:6px;bottom:2px;font-size:11px;color:#999;font-style:normal}
.c.empty{border-color:var(--bad);border-style:dashed}.c.empty:after{content:"빈 칸(빠짐)";position:absolute;left:0;right:0;bottom:16px;text-align:center;color:#d0301f;font-size:12px}.c.bad{border-color:var(--bad);opacity:.45}.c.alt{border-color:#e0a000}.c em{position:absolute;left:6px;top:2px;font-size:20px;color:#b07000;font-style:normal}
.bar{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--line);padding:10px 16px}textarea{width:100%;height:90px;font:12px Consolas,monospace}</style>
<main><h1>칸 검토</h1><p>칸을 한 번 누르면 <b>버림</b>(틀림), 두 번 누르면 <b>다른 글자로 씀</b>(실제로 쓴 글자를 입력), 세 번이면 되돌림. 끝나면 아래 JSON 을 작업 폴더의 errors.json(font.json 과 같은 폴더)에 그대로 저장한다 — 직접 저장하거나, 복사해서 에이전트에게 붙여 주면 에이전트가 저장한다. 주황 점선 칸은 장 검사가 못 쓴다고 한 칸(못 쓰는 줄 · 안 된 장 · 경계 넘음)이라 표시하지 않아도 폰트에 쓰지 않는다.</p><div id="app"></div></main>
<div class="bar"><textarea id="out" readonly></textarea></div>
<script>const D=${JSON.stringify(data)};const E=${JSON.stringify(errors)};
const app=document.getElementById("app"),out=document.getElementById("out");
function sync(){out.value=JSON.stringify(E,null,1)}
const SK={"줄":"못 쓰는 줄(안 씀)","장":"안 된 장(안 씀)","경계":"경계 넘음(안 씀)","빈":"거의 빈 칸(안 씀)"};
for(const s of D){const h=document.createElement("h2");h.textContent=s.id+(E[s.id]==="*"?" — 장 전체 버림(errors.json 에 *)":"");if(s.note){const sm=document.createElement("small");sm.textContent=" "+s.note;h.append(sm)}app.append(h);const g=document.createElement("div");g.className=s.n>6?"g big":"g";if(s.n!==6)g.style.gridTemplateColumns="repeat("+s.n+",minmax("+(s.n>6?"84px":"0")+",1fr))";app.append(g);
for(const c of s.cells){const d=document.createElement("div");d.className=c.empty?"c empty":c.skip?"c skip":"c";if(c.skip)d.dataset.skip=SK[c.skip]||"안 씀";d.innerHTML='<img loading="lazy" src="../cells/'+s.id+'/'+c.rc+'.png" alt=""><b></b><i>'+c.rc+'</i><em></em>';d.querySelector("b").textContent=c.ch;
const paint=()=>{const m=E[s.id]==="*"?"?":(E[s.id]||{})[c.rc];d.classList.toggle("bad",m==="?");d.classList.toggle("alt",!!m&&m!=="?");d.querySelector("em").textContent=m&&m!=="?"?m:""};
d.onclick=()=>{if(E[s.id]==="*")return;E[s.id]=E[s.id]||{};const m=E[s.id][c.rc];if(m===undefined)E[s.id][c.rc]="?";else if(m==="?"){const a=prompt("이 칸에 실제로 쓰인 글자(한 글자):","");if(a&&[...a.trim()].length===1)E[s.id][c.rc]=a.trim();else delete E[s.id][c.rc]}else delete E[s.id][c.rc];if(!Object.keys(E[s.id]).length)delete E[s.id];paint();sync()};paint();g.append(d)}}sync();</script></html>`;
  writeFileSync(P(dir, "review", "index.html"), html, "utf8");
  console.log(`검토 페이지 review/index.html (장 ${data.length}개) · 에이전트용 그림 review/<장>.png${data.some((s) => s.n > 6) ? "(6×6 보다 큰 격자는 쪽마다 review/<장>-p01.png …)" : ""}`);
}

function cmdRedo() {
  const all = readJson(P(dir, "sheets.json"));
  const got = cellState();
  const sc = scriptOf(config(dir));
  const miss = [...all.needed].filter((c) => !got.has(c) && sc.isMain(c));
  // 부호 장에서 빠진 글자(예: ★ 를 ☆ 로 그림)는 부호 장 형식의 다시 쓰기 장으로 — 본문 장 프롬프트로는 크기·자리가 틀어진다
  const symSet = new Set(sc.symbols);
  const missSym = [...all.needed].filter((c) => !got.has(c) && !sc.isMain(c) && (symSet.has(c) || !isLatin(c)));
  const missLat = [...all.needed].filter((c) => !got.has(c) && isLatin(c) && !symSet.has(c));
  const unsent = all.sheets.filter((s) => !isRedo(s) && !existsSync(inboxFile(dir, s.id)));
  if (unsent.length) die(`아직 안 받은 장이 있다(${unsent.map((s) => s.id).join(" ")}) — 다 받고 검토한 뒤 redo`);
  // 안 받은 다시 쓰기 장이 있는데 또 만들면 같은 글자에 두 번 돈을 낸다 — 먼저 받거나, --replace 로 그 장을 버리고 새로 만든다
  const unsentRedo = all.sheets.filter((s) => isRedo(s) && !existsSync(inboxFile(dir, s.id)));
  if (unsentRedo.length && !opt.replace) die(`아직 안 받은 다시 쓰기 장이 있다(${unsentRedo.map((s) => s.id).join(" ")}) — 그 장을 먼저 받아 cut 한다. 버리고 지금 없는 글자로 새로 만들려면 redo --replace`);
  if (unsentRedo.length) {
    all.sheets = all.sheets.filter((s) => !unsentRedo.includes(s));
    for (const s of unsentRedo) rmSync(P(dir, "jobs", s.id), { recursive: true, force: true });
    console.log(`- 안 받은 다시 쓰기 장 ${unsentRedo.map((s) => s.id).join(" ")} 를 버렸다`);
  }
  const n0 = all.sheets.filter(isRedo).length;
  let n = n0;
  // 다시 쓰기 장(본문 · 부호)은 그 폰트의 본문 격자로(한 폰트 한 격자) — 본문 장의 줄 수, 본문 장이 없으면 font.json 의 격자. 영문 다시 쓰기 장은 6×6
  const N = all.sheets.find((s) => !isLatinSheet(s) && !isRedo(s))?.rows.length ?? gridOfFont(config(dir)), PER = N * N;
  if (missSym.length) {
    // 빠진 부호를 N² 칸(6×6 이면 36칸)에 돌려 채운다(같은 부호를 여러 번 — 가장 나은 칸을 쓴다)
    const cells = Array.from({ length: PER }, (_, i) => missSym[i % missSym.length]);
    all.sheets.push({ id: `r${String(++n).padStart(2, "0")}`, kind: "symbols", redo: true, rows: rowsOf(cells, N) });
    console.log(`- 부호 다시 쓰기 1장(r${String(n).padStart(2, "0")}) · 없는 부호 ${missSym.join(" ")}`);
  }
  if (missLat.length) {
    // 빠진 영문을 30칸에 돌려 채우고, 끝 6칸은 기준선을 잴 글자(H x n o E u — 이 칸들은 폰트에 쓰지 않는다)
    const cells = [...Array.from({ length: 30 }, (_, i) => missLat[i % missLat.length]), ..."HxnoEu"];
    all.sheets.push({ id: `r${String(++n).padStart(2, "0")}`, kind: "latin", redo: true, rows: rowsOf(cells) });
    console.log(`- 영문 다시 쓰기 1장(r${String(n).padStart(2, "0")}) · 없는 글자 ${missLat.join(" ")}`);
  }
  // 다시 쓰기 장도 한 장 값씩 든다 — 그리기 전에 장 수와 값을 사용자에게 말하게 한다
  // 다시 쓰기 장도 한 장 값씩 든다 — 새 견적으로 장부에 적는다(격자 바뀜처럼, 새 approve 전에는 check · spend · openai 가 멈춘다)
  const costNote = (k) => {
    const ids = readJson(P(dir, "sheets.json")).sheets.filter(isRedo).slice(-k).map((s) => s.id), price = Number(config(dir).price_usd), usd = +(k * price).toFixed(2);
    const l = ledger(dir); l.redo_quotes = [...(l.redo_quotes ?? []), { at: new Date().toISOString(), sheets: ids, price, usd }]; writeJson(ledgerFile(dir), l);
    console.log(`- 새 견적: 다시 쓰기 ${k}장 × ${price} USD = ${usd} USD — 사용자에게 말하고 승인을 다시 받아 approve --note 로 적기 전에는 check · spend · openai 가 멈춘다`);
  };
  if (!miss.length) { writeJson(P(dir, "sheets.json"), all); console.log(n > n0 ? "→ jobs 로 묶음을 만든다" : `없는 ${sc.label}·부호가 없다 — redo 필요 없음`); if (n > n0) costNote(n - n0); return; }
  // 한 글자를 두 번 이상: N² 칸(6×6 이면 36칸)을 없는 글자로 돌려 채우고, 장마다 섞는다
  let seed = 11 + n;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const shuf = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const per = Math.max(2, Math.floor(PER / Math.min(PER, miss.length)));
  const pool = shuf(miss.flatMap((c) => Array(Math.min(per, 4)).fill(c)));
  const made = chunk(pool, PER).map((cells, i) => {
    while (cells.length < PER) cells.push(miss[cells.length % miss.length]);
    const rows = rowsOf(shuf(cells), N);
    // 일본어는 한자가 있으면 활자 구조 참조를 늘 넣는다(자모 풀이 같은 철자 목록이 없어서)
    return { id: `r${String(n + i + 1).padStart(2, "0")}`, kind: "redo", rows, spell: sc.id === "ko", print: !!opt.print || (sc.id === "ja" && [...rows.join("")].some(isKanji)) };
  });
  all.sheets.push(...made);
  writeJson(P(dir, "sheets.json"), all);
  console.log(`ok 다시 쓰기 ${made.length}장(${made.map((s) => s.id).join(" ")}${N !== 6 ? ` · ${N}×${N}` : ""}) · 없는 ${sc.label} ${miss.length}자${made.some((s) => s.print) ? " · 활자 참조(ref-3) 넣음" : ""} → jobs 로 묶음을 만든다`);
  costNote(n - n0 + made.length);
}

// ---- 확대 대조: 칸 그림(300px) 아래에 그 장의 활자 참조(ref-3) 칸 — 에이전트 검수에서 획 하나 차이를 볼 때
//   compare <dir> s12:01 s14:34 …   → review/compare.png (활자 참조가 없는 장은 칸 그림만)
async function cmdCompare() {
  const sharp = await loadSharp();
  const items = pos.filter((x) => /^[A-Za-z0-9]+:(\d\d|\d{4})$/.test(x)); // 칸 이름: 격자 10 까지 행열 두 자리("34"), 11 부터 네 자리("0213")
  if (!items.length) die("compare <dir> <장>:<칸> … (예: compare ./my-font s12:01 s14:34 · 격자 11 이상은 s02:0213)");
  const S = 300, m = Math.round(1024 * 0.03), comp = [];
  for (const [k, it] of items.entries()) {
    const [sheet, rc] = it.split(":");
    const s = (1024 - 2 * m) / (sheetsOf(dir).find((x) => x.id === sheet)?.rows.length ?? 6); // 그 장의 격자(활자 참조 ref-3 의 칸 크기)
    const cellPng = P(dir, "cells", sheet, `${rc}.png`);
    if (!existsSync(cellPng)) die(`${cellPng} 가 없다 — 그 장을 cut 했는지, 칸 자리(행열 — 격자 10 까지 두 자리, 11 부터 네 자리)가 맞는지 본다`);
    const x = (k % 6) * (S + 20), y = Math.floor(k / 6) * (S + 190);
    comp.push({ input: await sharp(cellPng).resize(S, S, { fit: "contain", background: "#fff" }).png().toBuffer(), left: x, top: y });
    const ref3 = P(dir, "jobs", sheet, "ref-3.png");
    if (existsSync(ref3)) {
      const [r, c] = rcParse(rc);
      comp.push({ input: await sharp(ref3).extract({ left: Math.round(m + c * s) + 3, top: Math.round(m + r * s) + 3, width: Math.round(s) - 6, height: Math.round(s) - 6 }).resize(150, 150).png().toBuffer(), left: x + 75, top: y + S + 10 });
    }
  }
  const W = Math.min(6, items.length) * (S + 20), H = Math.ceil(items.length / 6) * (S + 190);
  await sharp({ create: { width: W, height: H, channels: 3, background: "#fff" } }).composite(comp).png().toFile(P(dir, "review", "compare.png"));
  console.log(`ok review/compare.png · 칸 ${items.length}개(위 칸 그림, 아래 활자 참조)`);
}

// ---- 조립한 폰트 미리 보기: out/preview.html — 설치 없이 브라우저로 가로·세로(일본어) 조판을 본다
//   preview <dir> [--text "줄1|줄2"]   세로쓰기는 브라우저가 폰트의 vert 기능으로 세로용 모양을 고른다(writing-mode: vertical-rl)
function cmdPreview() {
  const cfg = config(dir), ja = (cfg.script ?? "ko") === "ja";
  const files = existsSync(P(dir, "out")) ? readdirSync(P(dir, "out")).filter((f) => /-(Regular|Bold)\.ttf$/.test(f)) : [];
  const reg = files.find((f) => f.endsWith("-Regular.ttf")), bold = files.find((f) => f.endsWith("-Bold.ttf"));
  if (!reg) die("out/<이름>-Regular.ttf 가 없다 — glyphs → build_font.py 를 먼저");
  const SAMPLE_JA = ["「ねえ、これ大変なことになった！」", "「マジで？？全部売り切れ…」", "「ちょっと待って、本当に？」", "「コーヒー、飲みに行こうよ〜」", "「えっ……今、なんて？」", "「ありがとう♡また明日ね。」"];
  const SAMPLE_KO = ["야, 이거 큰일 났다!", "ㅋㅋㅋ 진짜?? 다 매진?", "아키바까지 가야 되나…", "「진짜 엄청 달렸어!」"];
  const SAMPLE_EN = ["The quick brown fox jumps over the lazy dog.", "Hello! Coffee & cake @ 3:30? “Yes,” she said — (really).", "AVATAR Toyota WAVE · fjord Ty, Yo, P.S. #42 $9.99 50% [ok] {x} a/b"];
  const lines = opt.text && opt.text !== true ? String(opt.text).split("|") : [...(ja ? SAMPLE_JA : SAMPLE_KO), ...(cfg.latin ? SAMPLE_EN : [])];
  const body = lines.map(esc).join("<br>");
  const vlines = opt.text && opt.text !== true ? lines : ja ? SAMPLE_JA : lines; // 세로쓰기는 일본어 줄만(긴 영문 줄은 가로로)
  const vbody = vlines.map(esc).join("<br>");
  const face = (f, w) => `@font-face{font-family:P;src:url("${encodeURI(f)}");font-weight:${w}}`;
  const html = `<!doctype html><html lang="${ja ? "ja" : "ko"}"><meta charset="utf-8"><title>${esc(cfg.family_ja ?? cfg.family_ko ?? cfg.family_en)} 미리 보기</title>
<style>${face(reg, 400)}${bold ? face(bold, 700) : ""}
body{margin:0;padding:24px;background:#fff;color:#111;font:14px sans-serif}h2{font-size:14px;color:#666;margin:24px 0 8px}
.t{font-family:P;font-size:44px;line-height:1.6}.v{writing-mode:vertical-rl;height:${Math.max(...vlines.map((l) => [...l].length)) * 48 + 40}px}.b{font-weight:700}
.row{display:flex;gap:48px;flex-wrap:wrap}</style>
<h2>가로 · 보통</h2><div class="t">${body}</div>${bold ? `<h2>가로 · 굵게</h2><div class="t b">${body}</div>` : ""}
${ja ? `<h2>세로 (writing-mode: vertical-rl — 폰트의 vert 기능으로 세로용 모양)</h2><div class="row"><div class="t v">${vbody}</div>${bold ? `<div class="t v b">${vbody}</div>` : ""}</div>` : ""}</html>`;
  writeFileSync(P(dir, "out", "preview.html"), html, "utf8");
  console.log(`ok out/preview.html — 브라우저로 연다(설치 필요 없음)${ja ? " · 세로쓰기 포함" : ""}`);
}

// 잉크를 거리 변환으로 r 화소 둥글게 키운다(그림 크기는 그대로 — 칸 가장자리 밖으로는 안 자란다)
function growInk(data, w, h, r) {
  const INF = 1e20, gg = new Float64Array(w * h).fill(INF);
  for (let i = 0; i < w * h; i++) if (data[i] < 128) gg[i] = 0;
  const dt1 = (f, n, d, v, z) => {
    let q, s, j = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (q = 1; q < n; q++) { for (;;) { const p = v[j]; s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p); if (s > z[j]) break; j--; } j++; v[j] = q; z[j] = s; z[j + 1] = INF; }
    j = 0; for (q = 0; q < n; q++) { while (z[j + 1] < q) j++; d[q] = (q - v[j]) * (q - v[j]) + f[v[j]]; }
  };
  const n = Math.max(w, h), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = gg[y * w + x]; dt1(f, h, d, v, z); for (let y = 0; y < h; y++) gg[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = gg[y * w + x]; dt1(f, w, d, v, z); for (let x = 0; x < w; x++) gg[y * w + x] = d[x]; }
  const px = Buffer.alloc(w * h, 255);
  for (let i = 0; i < w * h; i++) if (gg[i] <= r * r) px[i] = 0;
  return px;
}
// 획 굵기 어림(글꼴 단위): 2 × 잉크 넓이 ÷ 둘레 — 가는 획이면 획 폭에 가깝다
async function strokeUnits(sharp, file, scale) {
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, ink = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] < 128;
  let A = 0, E = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink(x, y)) { A++; E += !ink(x - 1, y) + !ink(x + 1, y) + !ink(x, y - 1) + !ink(x, y + 1); }
  return E ? (2 * A / E) * scale : 0;
}

// ---- 글자 그림: 받은 칸을 2배로 키워 문턱값 → glyphs/ + glyphs.json(build_font.py 입력)
async function cmdGlyphs() {
  const sharp = await loadSharp();
  const cfg = config(dir);
  const got = cellState();
  if (!got.size) die("쓸 칸이 없다 — 받은 장을 inbox/ 에 두고 cut 을 먼저 돌린다");
  const UP = 2, INK = 150;
  const gdir = P(dir, "glyphs");
  mkdirSync(gdir, { recursive: true });
  const glyphs = [], fromBase = [];
  for (const [ch, g] of got) {
    if (g.base) { fromBase.push(g.base); continue; }
    const src = P(dir, g.file);
    const { data, info } = await sharp(src).greyscale().raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;
    let minX = w, maxX = -1, minY = h, maxY = -1;
    for (let p = 0; p < w * h; p++) if (data[p] < INK) { const x = p % w, y = (p / w) | 0; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    if (maxX < 0) continue;
    const name = `u${[...ch].map((x) => x.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join("_")}`;
    const out = path.join(gdir, `${name}.png`);
    await sharp(data, { raw: { width: w, height: h, channels: 1 } }).resize(w * UP, h * UP, { kernel: "lanczos3" }).threshold(INK).png().toFile(out);
    glyphs.push({ ch, name, sheet: g.sheet, file: `glyphs/${name}.png`, cell: { w: w * UP, h: h * UP }, ink: { x0: minX * UP, x1: (maxX + 1) * UP, y0: minY * UP, y1: (maxY + 1) * UP }, ...(g.latin ? { latin: true } : {}) });
  }
  const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
  // 크기 기준 글자: 한글은 한글, 일본어는 한자(한자가 적으면 가나까지)
  const sc = scriptOf(config(dir));
  let han = glyphs.filter((g) => sc.isSizeRef(g.ch));
  if (han.length < 20) han = glyphs.filter((g) => sc.isMain(g.ch));
  if (!han.length && !cfg.base) die(`${sc.label} 글자가 하나도 없다 — 본문 장(s01 …)을 받아 cut 한다(부호 장만으로는 크기 기준을 못 잡는다)`);
  const cellH = med(glyphs.map((g) => g.cell.h));
  const sheetScale = {};
  for (const s of new Set(glyphs.map((g) => g.sheet))) sheetScale[s] = +(cellH / med(glyphs.filter((g) => g.sheet === s).map((g) => g.cell.h))).toFixed(4);
  // 장마다의 격자(sheetGrid) — build_font.py 가 작은 칸에서 온 글자의 버리는 넓이(MIN_AREA)를 그 격자에 맞춰 줄인다(6×6 은 그대로)
  const allSheets = sheetsOf(dir), latinIds = new Set(allSheets.filter(isLatinSheet).map((s) => s.id));
  const sheetGrid = Object.fromEntries(Object.keys(sheetScale).map((s) => [s, allSheets.find((x) => x.id === s)?.rows.length ?? 6]));
  // 영문이 아닌 장들의 격자가 섞였을 때만(한 폰트 한 격자라 보통은 없다): 칸 그림은 선에서 pad 만큼 안쪽이라 그 몫이 격자마다 다르다 →
  //   글자가 가장 많은 격자를 기준으로, 다른 격자의 장은 칸 그림 높이가 아니라 선 간격으로 맞춘다. 격자가 하나뿐이면 값은 0.5.0 과 같다.
  //   (영문 장은 대문자 높이로 따로 맞추므로 본문 14 + 영문 6 은 여기에 들지 않는다.)
  const bodyIds = Object.keys(sheetScale).filter((s) => !latinIds.has(s)), gridsUsed = [...new Set(bodyIds.map((s) => sheetGrid[s]))];
  if (gridsUsed.length > 1) {
    const count = (N) => glyphs.filter((g) => !latinIds.has(g.sheet) && sheetGrid[g.sheet] === N).length, major = [...gridsUsed].sort((a, b) => count(b) - count(a))[0];
    const pitch = (s) => readJson(P(dir, "cells", s, "cells.json")).cellH * UP, img = (s) => med(glyphs.filter((g) => g.sheet === s).map((g) => g.cell.h));
    const frac = med(bodyIds.filter((s) => sheetGrid[s] === major).map((s) => img(s) / pitch(s)));
    for (const s of bodyIds) if (sheetGrid[s] !== major) sheetScale[s] = +(cellH / frac / pitch(s)).toFixed(4);
    console.log(`경고: 영문이 아닌 장의 격자가 섞여 있다(${gridsUsed.join(" · ")}) — 한 폰트는 한 격자가 원칙이다. 장 배율을 선 간격으로 맞췄지만, 작은 칸일수록 글씨가 상대적으로 굵고 크게 나와 섞으면 티가 난다`);
  }
  let meta;
  if (cfg.base) {
    // 바탕 글자: 그 폰트의 크기 기준·장 배율을 그대로(장 이름 앞에 base: — 이 폴더의 장 이름과 안 겹치게)
    const b = baseGlyphs(cfg), bdir = path.dirname(cfg.base.glyphs);
    for (const [k, v] of Object.entries(b.sheetScale)) { sheetScale[`base:${k}`] = v; sheetGrid[`base:${k}`] = b.sheetGrid?.[k] ?? 6; }
    const bg = fromBase.map((g) => ({ ...g, file: path.resolve(bdir, g.file), sheet: `base:${g.sheet}`, base: true }));
    meta = { up: b.up ?? UP, ink: b.ink ?? INK, hangulInkHeightMedian: b.hangulInkHeightMedian, hangulCenterMedian: b.hangulCenterMedian, sheetScale, sheetGrid, glyphs: [...bg, ...glyphs] };
  } else {
    // 글자 크기 기준: 한글이 적으면(받침 없는 글자만 많은 장 등) 잉크 높이 중앙값이 한쪽으로 쏠린다 → 칸 높이 × 0.69(모두의 둥글펜 2,338자 실측 비율)
    const inkMed = med(han.map((g) => g.ink.y1 - g.ink.y0));
    meta = { up: UP, ink: INK, hangulInkHeightMedian: han.length >= 300 ? inkMed : Math.round(cellH * 0.69), hangulCenterMedian: +med(han.map((g) => (g.ink.y0 + g.ink.y1) / 2 / g.cell.h)).toFixed(4), sheetScale, sheetGrid, glyphs };
  }
  // 영문: 대문자 잉크 높이 중앙값 → 640, 장마다 기준선(그 장 모든 칸의 기준선 글자 아래 끝 중앙값 — 폰트에 안 쓰는 칸도 잰다)
  const lat = glyphs.filter((g) => g.latin);
  if (lat.length) {
    const CAP = 640;
    const caps = lat.filter((g) => "ABDEFHIKLMNPRTUVWXYZ".includes(g.ch)).map((g) => (g.ink.y1 - g.ink.y0) * sheetScale[g.sheet]);
    const kL = caps.length >= 5 ? CAP / med(caps) : (780 / meta.hangulInkHeightMedian) * 0.8;
    if (caps.length < 5) console.log("경고: 쓸 수 있는 영문 대문자가 5개 미만이라 영문 크기를 어림했다(한글 크기의 80%)");
    const errors = readJson(P(dir, "errors.json"), {}), baseline = {};
    for (const sid of new Set(lat.map((g) => g.sheet))) {
      const cm = readJson(P(dir, "cells", sid, "cells.json"));
      const ys = [];
      for (const c of cm.cells) {
        if (c.empty || errors[sid] === "*" || errors[sid]?.[c.rc] !== undefined || !LATIN_BASELINE.includes(c.ch)) continue;
        const { data, info } = await sharp(P(dir, "cells", sid, `${c.rc}.png`)).greyscale().raw().toBuffer({ resolveWithObject: true });
        let maxY = -1;
        for (let p = 0; p < info.width * info.height; p++) if (data[p] < INK) maxY = Math.max(maxY, (p / info.width) | 0);
        if (maxY >= 0) ys.push((maxY + 1) * UP);
      }
      const h = med(lat.filter((g) => g.sheet === sid).map((g) => g.cell.h)), pad = Math.max(6, Math.round(h / UP * 0.02));
      baseline[sid] = ys.length >= 3 ? med(ys) : Math.round((LATIN_GUIDE.base * (h / UP + 2 * pad) - pad) * UP); // 잴 글자가 모자라면 안내선 자리
    }
    meta.latin = { cap: CAP, k: +kL.toFixed(5), baseline };
    // 획 굵기 맞추기: 영문은 본문보다 작게 써서 같은 펜이라도 획이 가늘어 보인다 → 본문 획 굵기(중앙값)에 맞춰 영문 잉크를 키운다
    const kMain = 780 / meta.hangulInkHeightMedian, mains = meta.glyphs.filter((g) => sc.isSizeRef(g.ch));
    const step = Math.max(1, Math.floor(mains.length / 240));
    const wMain = med(await Promise.all(mains.filter((_, i) => i % step === 0).map((g) => strokeUnits(sharp, path.resolve(dir, g.file), kMain * meta.sheetScale[g.sheet]))));
    const letters = lat.filter((g) => /^[A-Za-z]$/.test(g.ch));
    const wLat = letters.length ? med(await Promise.all(letters.map((g) => strokeUnits(sharp, P(dir, g.file), kL * sheetScale[g.sheet])))) : 0;
    const grow = wLat && wMain > wLat * 1.06 ? +((wMain - wLat) / 2).toFixed(1) : 0;
    meta.latin.stroke = { main: +wMain.toFixed(1), latin: +wLat.toFixed(1), grow };
    if (grow) {
      for (const g of lat) {
        const r = grow / (kL * sheetScale[g.sheet]);
        const { data, info } = await sharp(P(dir, g.file)).greyscale().raw().toBuffer({ resolveWithObject: true });
        const w = info.width, h = info.height, px = growInk(data, w, h, r);
        let x0 = w, x1 = -1, y0 = h, y1 = -1;
        for (let i = 0; i < w * h; i++) if (px[i] < 128) { const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        await sharp(px, { raw: { width: w, height: h, channels: 1 } }).png().toFile(P(dir, g.file));
        g.ink = { x0, x1: x1 + 1, y0, y1: y1 + 1 };
      }
      console.log(`- 영문 획 굵기 ${meta.latin.stroke.latin} → 본문 ${meta.latin.stroke.main} 에 맞춰 한쪽 ${grow} 단위 키움`);
    }
  }
  writeJson(P(dir, "glyphs.json"), meta);
  const need = [...readJson(P(dir, "sheets.json")).needed];
  console.log(`ok glyphs.json · 글자 ${meta.glyphs.length}개(${cfg.base ? `바탕 ${fromBase.length} · ` : `${sc.label} ${han.length} · `}영문 ${lat.length}) · 목표 중 없는 것 ${need.filter((c) => !got.has(c)).length}자`);
}
const LATIN_BASELINE = "ABCDEFGHIKLMNOPRSTUVWXYZabcdefhiklmnorstuvwxz";

// ---- 굵은 판 글자 그림: 잉크를 유클리드 거리 변환으로 한쪽 N 단위(1em=1000) 둥글게 키운다
async function cmdBold() {
  const sharp = await loadSharp();
  const cfg = config(dir);
  const UNITS = Number(opt.units ?? cfg.bold_units ?? 14);
  const meta = readJson(P(dir, "glyphs.json")) ?? die("glyphs 를 먼저");
  const k = 780 / meta.hangulInkHeightMedian;
  const INF = 1e20;
  const dt1 = (f, n, d, v, z) => {
    let q, s, j = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (q = 1; q < n; q++) { for (;;) { const p = v[j]; s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p); if (s > z[j]) break; j--; } j++; v[j] = q; z[j] = s; z[j + 1] = INF; }
    j = 0; for (q = 0; q < n; q++) { while (z[j + 1] < q) j++; d[q] = (q - v[j]) * (q - v[j]) + f[v[j]]; }
  };
  const bdir = P(dir, "glyphs-bold");
  mkdirSync(bdir, { recursive: true });
  const out = { ...meta, bold: { units: UNITS }, glyphs: [] };
  // 바탕 글자의 굵은 그림(font.json base.bold)이 있으면 그대로 쓴다 — 바탕 폰트의 굵게와 같은 모양
  const bb = cfg.base?.bold ? readJson(cfg.base.bold) : null, bbDir = bb ? path.dirname(cfg.base.bold) : null;
  const bbOf = new Map((bb?.glyphs ?? []).map((g) => [g.ch, g]));
  if (bb?.bold?.units != null && bb.bold.units !== UNITS) console.log(`경고: 바탕 굵은 그림은 ${bb.bold.units}단위, 이번은 ${UNITS}단위 — 굵기가 다를 수 있다`);
  let reused = 0;
  for (const g of meta.glyphs) {
    if (g.base && bbOf.has(g.ch)) { const b = bbOf.get(g.ch); out.glyphs.push({ ...g, file: path.resolve(bbDir, b.file), pad: b.pad }); reused++; continue; }
    const r = UNITS / ((g.latin ? meta.latin.k : k) * meta.sheetScale[g.sheet]), pad = Math.ceil(r) + 2;
    const { data, info } = await sharp(path.resolve(dir, g.file)).greyscale().raw().toBuffer({ resolveWithObject: true });
    const w0 = info.width, h0 = info.height, w = w0 + 2 * pad, h = h0 + 2 * pad;
    const gg = new Float64Array(w * h).fill(INF);
    for (let y = 0; y < h0; y++) for (let x = 0; x < w0; x++) if (data[y * w0 + x] < 128) gg[(y + pad) * w + x + pad] = 0;
    const n = Math.max(w, h), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = gg[y * w + x]; dt1(f, h, d, v, z); for (let y = 0; y < h; y++) gg[y * w + x] = d[y]; }
    for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = gg[y * w + x]; dt1(f, w, d, v, z); for (let x = 0; x < w; x++) gg[y * w + x] = d[x]; }
    const px = Buffer.alloc(w * h, 255);
    for (let i = 0; i < w * h; i++) if (gg[i] <= r * r) px[i] = 0;
    const file = path.join(bdir, path.basename(g.file));
    await sharp(px, { raw: { width: w, height: h, channels: 1 } }).png().toFile(file);
    out.glyphs.push({ ...g, file: `glyphs-bold/${path.basename(g.file)}`, pad });
  }
  writeJson(P(dir, "glyphs-bold.json"), out);
  console.log(`ok glyphs-bold.json · 한쪽 ${UNITS}단위 · 글자 ${out.glyphs.length}개${reused ? `(바탕 굵은 그림 ${reused}개 그대로)` : ""}`);
}

// KNOWN(맨 위 명령 이름 검사)과 같은 목록이어야 한다
const CMDS = { init: cmdInit, style: cmdStyle, latin: cmdLatin, drafts: cmdDrafts, pick: cmdPick, grid: cmdGrid, plan: () => planSheets(config(dir)), jobs: cmdJobs, status: cmdStatus, estimate: cmdEstimate, approve: cmdApprove, check: cmdCheck, spend: cmdSpend, openai: cmdOpenai, cut: cmdCut, retry: cmdRetry, review: reviewHtml, redo: cmdRedo, compare: cmdCompare, preview: cmdPreview, glyphs: cmdGlyphs, bold: cmdBold };
if (!CMDS[cmd]) die(`모르는 명령: ${cmd} (help)`);
await CMDS[cmd]();
