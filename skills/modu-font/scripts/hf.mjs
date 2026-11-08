#!/usr/bin/env node
// 모두의 폰트 스킬(modu-font) 명령 하나: node scripts/hf.mjs <명령> <작업 폴더> [옵션]
//   init · latin · drafts · pick · plan · jobs · status · estimate · approve · check · spend · openai · cut · redo · glyphs · bold
// 돈이 드는 명령은 openai 하나뿐이고, 장부(ledger.json)의 상한 안에서만 돈다. 에이전트가 내장 도구·MCP 로 그릴 때도 check → spend 로 같은 장부를 쓴다.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  KANA, LATIN, LATIN_GUIDE, P, SKILL, canSpend, config, die, inboxFile, isKanji, isLatin, isLatinSheet, isMainSheet, jisKanji, latinSheets, ledger, ledgerFile, loadSharp,
  orderedHangul, scriptOf, prompt, readJson, recordSpend, sheetsOf, sheetsUsed, spentUsd, writeJson,
} from "./lib.mjs";

const argv = process.argv.slice(2);
const [cmd, dirArg, ...rest] = argv;
const opt = {}, pos = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith("--")) { const k = rest[i].slice(2); opt[k] = rest[i + 1] == null || rest[i + 1].startsWith("--") ? true : rest[++i]; }
  else pos.push(rest[i]);
}
const HELP = () => readFileSync(path.join(SKILL, "references", "commands.md"), "utf8");
const KNOWN = "init latin drafts pick plan jobs status estimate approve check spend openai cut review redo compare preview glyphs bold".split(" ");
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
const rowsOf = (cells) => chunk(cells, 6).map((r) => r.join(""));

// 빈 6×6 격자(첫 장의 형식 참조). 하늘색 선 — cut 이 이 색으로 격자를 찾는다.
async function blankGrid(file, size = 1024, cells = null, font = scriptOf(null).font, { guides = false } = {}) {
  const sharp = await loadSharp();
  const m = Math.round(size * 0.03), s = (size - 2 * m) / 6;
  let lines = "";
  for (let i = 0; i <= 6; i++) {
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
  const text = cells ? cells.map((c, k) => `<text x="${(m + (k % 6 + 0.5) * s).toFixed(1)}" y="${(m + (Math.floor(k / 6) + 0.5) * s + s * 0.18).toFixed(1)}" text-anchor="middle" font-size="${Math.round(s * 0.55)}" font-family="${font}" fill="#111">${esc(c)}</text>`).join("") : "";
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
// 일본어 견본 문장 — 한국어 견본과 같은 내용(같은 사람이 같은 말을 일본어로 쓴 것처럼). 한자 大変·全部·売·切·秋葉原·行·本当·走 가 들어 있다
const DRAFT_LINES_JA = ["ねえ、これ大変なことになった", "マジで？？ 全部売り切れ？", "秋葉原まで行かなきゃダメかな…", "本当にめっちゃ走ったよ！"];

async function cmdInit() {
  if (existsSync(P(dir, "font.json")) && !opt.force) die(`${P(dir, "font.json")} 가 이미 있다(--force 로 덮어쓰기)`);
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
  const cfg = {
    family_en: opt["family-en"] ?? "My Hand",
    ...(script === "ja" ? { script, family_ja: opt["family-ja"] ?? "わたしの手書き", kana: opt.kana !== "no", kanji_file: "chars-kanji.txt" } : { family_ko: opt["family-ko"] ?? "내 손글씨" }),
    ps: (opt["family-en"] ?? "My Hand").replace(/[^A-Za-z]/g, "") || "MyHand",
    version: "1.000",
    style_text: opt.style ?? "everyday handwriting with a thin black 0.5 mm gel pen",
    count: Number(opt.count ?? (script === "ja" ? kanji.length : 2350)), // 일본어: 한자 수(가나·부호는 따로)
    price_usd: Number(opt.price ?? 0.42),
    openai: { model: "gpt-image-2", size: "2048x2048", quality: "high" },
    bold_units: 14,
    ...(opt.latin ? { latin: true } : {}),
    ...(base ? { base } : {}),
  };
  writeJson(P(dir, "font.json"), cfg);
  if (kanji) writeFileSync(P(dir, cfg.kanji_file), kanji.join("") + "\n", "utf8");
  for (const d of ["style", "jobs", "inbox", "cells", "review", "out"]) mkdirSync(P(dir, d), { recursive: true });
  await blankGrid(P(dir, "style", "blank-grid.png"));
  if (opt.sample) {
    // JPG 등으로 받아도 진짜 PNG 로 바꿔 둔다(이름만 .png 인 JPG 를 앱이 거절하지 않게)
    const sharp = await loadSharp();
    await sharp(path.resolve(opt.sample)).png().toFile(P(dir, "style", "sample.png"));
    if (Math.max(sampleMeta.width, sampleMeta.height) < 800) console.log(`경고: 견본이 작다(${sampleMeta.width}×${sampleMeta.height}) — 글씨 모양이 덜 전해진다. 더 큰 원본이 있으면 그걸 쓴다`);
  }
  if (!existsSync(P(dir, "errors.json"))) writeJson(P(dir, "errors.json"), {});
  if (!existsSync(ledgerFile(dir))) writeJson(ledgerFile(dir), ledger(dir));
  planSheets(cfg);
  console.log(`ok ${dir}\n- 설정 font.json (${script === "ja" ? "일본어 · " : ""}이름 ${cfg.family_ja ?? cfg.family_ko} / ${cfg.family_en}, 글씨 설명 "${cfg.style_text}")`);
  console.log(opt.sample ? "- 손글씨 견본 style/sample.png" : "- 손글씨 견본 없음 → drafts 로 시안을 그리거나 style/sample.png 를 넣는다");
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
  const sheets = chunk(want, 36).map((cells, i) => {
    const n = cells.length;
    while (cells.length < 36) cells.push(extra.length ? extra.shift() : cells[cells.length % n]); // 남은 글자가 없으면(2,350자) 같은 장 글자를 돌려 쓴다(겹친 칸은 앞 것만 씀)
    return { id: `s${String(i + 1).padStart(2, "0")}`, kind: "hangul", rows: rowsOf(cells), spell: i >= 12 };
  });
  const SYM = scriptOf(cfg).symbols;
  sheets.push({ id: "sym", kind: "symbols", rows: rowsOf(SYM) });
  const old = readJson(P(dir, "sheets.json"), { sheets: [] }).sheets.filter((s) => s.kind === "redo" || s.redo);
  writeJson(P(dir, "sheets.json"), { note: "modu-font 장 목록 — redo 장은 redo 명령이 더한다", needed: want.join("") + SYM.join(""), sheets: [...sheets, ...old] });
  console.log(`- 장 ${sheets.length}개(한글 ${want.length}자 ${sheets.length - 1}장 + 부호·자모·숫자 1장)`);
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

// 이미 있는 작업 폴더에 영문을 더한다. --from <다른 작업 폴더>: 같은 손글씨로 받은 영문 장(inbox/L*.png)·검수(errors.json)를 옮겨 온다
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
  // --base a.png[,b.png]: 이미 있는 손글씨(다른 글자 체계라도)를 참조로, 같은 사람이 이 폰트의 글자로 쓴 견본 한 장 — 받은 그림은 pick --whole
  if (opt.base && opt.base !== true) {
    const cfg = config(dir), ja = (cfg.script ?? "ko") === "ja";
    const bases = String(opt.base).split(",").map((f) => path.resolve(f.trim()));
    for (const f of bases) if (!existsSync(f)) die(`--base 그림이 없다: ${f}`);
    const sharp = await loadSharp();
    const refs = [];
    for (const [i, f] of bases.entries()) { await sharp(f).png().toFile(path.join(d, `ref-${i + 1}.png`)); refs.push(`ref-${i + 1}.png`); }
    const lines = ja ? DRAFT_LINES_JA : DRAFT_LINES;
    const text = [
      `${refs.length > 1 ? `References 1-${refs.length} are` : "Reference 1 is"} handwriting by one person${ja ? " (in Korean)" : ""}: ${cfg.style_text}.`,
      `Write a handwriting sample page by the SAME person with the SAME pen: the same stroke weight, roundness, proportions and slant, as if written on the same day${ja ? ", now writing Japanese (hiragana, katakana and kanji) in that same hand" : ""}.`,
      "A square sheet of plain white paper seen flat from directly above like a clean scan. Four lines of handwriting, large, legible and centered, one sentence per line, with generous margins.",
      `Write each sentence exactly as given, every character and punctuation mark unchanged${ja ? " (Japanese kanji forms, every stroke correct)" : ""}:`,
      ...lines.map((l, i) => `${i + 1}. ${l}`),
      "It must look handwritten by a real person, not a typeface: slightly uneven baseline, natural variation in size, the same character never identical twice.",
      "Black ink only on white paper. No color, no grid, no ruled lines, no drawings, no labels, no text other than the four sentences.",
    ].join("\n");
    writeFileSync(path.join(d, "prompt.txt"), text + "\n", "utf8");
    writeJson(path.join(d, "job.json"), { id: "drafts", kind: "sample", refs, out: "inbox/drafts.png", lines, size: "정사각, 긴 변 1500px 이상" });
    console.log(`ok jobs/drafts (견본 한 장, 참조 ${refs.length}장) — 그림을 inbox/drafts.png 로 받은 뒤 pick --whole`);
    return;
  }
  const text = [
    "A square sheet of plain white paper, seen flat from directly above like a clean scan, divided into four equal quadrants (2x2) by thin light-grey lines.",
    "Each quadrant is a handwriting sample of the SAME four Korean sentences, written by hand on four lines, large, legible and centered, with generous margins.",
    "Write each sentence exactly as given, every Hangul character and punctuation mark unchanged, one sentence per line:",
    ...DRAFT_LINES.map((l, i) => `${i + 1}. ${l}`),
    "It must look handwritten by a real person, not a typeface: slightly uneven baseline, natural variation in letter size and stroke, the same letter never identical twice.",
    "Black or dark grey only on white paper. No color, no drawings, no ruled lines, no text other than the sentences and the labels below.",
    "In the top-left corner of each quadrant, a small grey label with its number. The four quadrants differ only in the letter shapes:",
    ...DRAFT_STYLES.map(([n, s], i) => `- ${n} (${["top-left", "top-right", "bottom-left", "bottom-right"][i]}): ${s}.`),
  ].join("\n");
  writeFileSync(path.join(d, "prompt.txt"), text + "\n", "utf8");
  writeJson(path.join(d, "job.json"), { id: "drafts", refs: [], out: "inbox/drafts.png", styles: Object.fromEntries(DRAFT_STYLES) });
  console.log(`ok jobs/drafts/prompt.txt — 그림을 inbox/drafts.png 로 받은 뒤 pick --quad 1~4`);
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
    return;
  }
  const q = Number(opt.quad);
  if (!(q >= 1 && q <= 4)) die("--quad 1~4 (견본 한 장을 통째로 쓰려면 --whole)");
  const { width: W, height: H } = await sharp(src).metadata();
  const left = q % 2 ? 0 : Math.floor(W / 2), top = q <= 2 ? 0 : Math.floor(H / 2);
  await sharp(src).extract({ left, top, width: Math.floor(W / 2), height: Math.floor(H / 2) }).png().toFile(P(dir, "style", "sample.png"));
  const cfg = config(dir);
  cfg.style_text = opt.style ?? DRAFT_STYLES[q - 1][1];
  writeJson(P(dir, "font.json"), cfg);
  console.log(`ok style/sample.png (사분면 ${q}) · 글씨 설명 "${cfg.style_text}"`);
}

// 다시 쓰기 장: 본문(kind redo)과 부호(kind symbols + redo: true) 둘 다
const isRedo = (s) => s.kind === "redo" || !!s.redo;
const pending = (ids) => sheetsOf(dir).filter((s) => (ids.length ? ids.includes(s.id) : true) && !existsSync(inboxFile(dir, s.id)));

async function cmdJobs() {
  const cfg = config(dir);
  if (!existsSync(P(dir, "style", "sample.png"))) die("style/sample.png 가 없다(init --sample, 또는 drafts → pick)");
  const fmt = existsSync(P(dir, "style", "format.png")) ? "sheet" : "blank";
  let list = pending(pos);
  // 첫 장을 받아 자르고 확인하기 전에는 첫 한글 장 하나만 묶는다 — 나머지는 그 장을 형식 참조로 다시 만든다
  const firstOnly = fmt === "blank" && !pos.length && !opt.all && list.some(isMainSheet);
  if (firstOnly) list = [list.find(isMainSheet)];
  // 영문 장: 처음 받은 영문 장(style/latin-format.png)이 형식 참조 — 그 전에는 안내선 빈 격자, 그리고 첫 영문 장 하나만
  const latFmt = existsSync(P(dir, "style", "latin-format.png")) ? "sheet" : "blank";
  const latFirst = latFmt === "blank" && !pos.length && !opt.all && list.filter(isLatinSheet).length > 1;
  if (latFirst) { const first = list.find(isLatinSheet); list = list.filter((s) => !isLatinSheet(s) || s === first); }
  if (list.some(isLatinSheet) && !existsSync(P(dir, "style", "latin-grid.png"))) await blankGrid(P(dir, "style", "latin-grid.png"), 1024, null, undefined, { guides: true });
  for (const s of list) {
    const d = P(dir, "jobs", s.id);
    mkdirSync(d, { recursive: true });
    copyFileSync(P(dir, "style", "sample.png"), path.join(d, "ref-1.png"));
    const lat = isLatinSheet(s), f = lat ? latFmt : fmt;
    copyFileSync(P(dir, "style", lat ? (f === "sheet" ? "latin-format.png" : "latin-grid.png") : f === "sheet" ? "format.png" : "blank-grid.png"), path.join(d, "ref-2.png"));
    const refs = ["ref-1.png", "ref-2.png"];
    if (s.print && !lat) { await blankGrid(path.join(d, "ref-3.png"), 1024, [...s.rows.join("")], scriptOf(cfg).font); refs.push("ref-3.png"); }
    writeFileSync(path.join(d, "prompt.txt"), prompt(s, cfg, { format: f, print: !!s.print && !lat }) + "\n", "utf8");
    writeJson(path.join(d, "job.json"), { id: s.id, kind: s.kind, rows: s.rows, refs, out: `inbox/${s.id}.png`, size: "정사각, 긴 변 1500px 이상(2048 권장)" });
  }
  const refNote = [list.some((s) => !isLatinSheet(s)) ? (fmt === "sheet" ? "처음 받은 장" : "빈 격자") : null, list.some(isLatinSheet) ? `영문 ${latFmt === "sheet" ? "처음 받은 영문 장" : "안내선 빈 격자"}` : null].filter(Boolean).join(" · ");
  console.log(`ok jobs ${list.length}장${refNote ? `(형식 참조: ${refNote})` : ""}: ${list.map((s) => s.id).join(" ") || "없음 — 모두 받음"}`);
  if (firstOnly) console.log(`- 첫 장만 묶었다. 받아서 cut·확인한 뒤 jobs 를 다시 돌리면 나머지 ${pending([]).length - 1}장을 만든다(지금 다 만들려면 --all)`);
  if (latFirst) console.log("- 영문은 첫 장(L1)만 묶었다. 받아서 cut·확인한 뒤 jobs 를 다시 돌리면 나머지 영문 장이 그 장을 형식 참조로 만들어진다");
}

function cellState() {
  const errors = readJson(P(dir, "errors.json"), {});
  const got = new Map(); // 글자 → { sheet, rc }
  for (const s of sheetsOf(dir)) {
    const cdir = P(dir, "cells", s.id);
    if (!existsSync(cdir)) continue;
    const meta = readJson(path.join(cdir, "cells.json"), { cells: [] });
    for (const c of meta.cells) {
      if (c.empty) continue;
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
    const recv = existsSync(inboxFile(dir, s.id)), cut = existsSync(P(dir, "cells", s.id, "cells.json"));
    return `${s.id.padEnd(5)} ${s.kind.padEnd(8)} ${recv ? "받음" : "  - "} ${cut ? "자름" : "  - "}`;
  });
  console.log(rows.join("\n"));
  const l = ledger(dir);
  console.log(`\n글자 ${need.length - miss.length}/${need.length} · 받을 장 ${pending([]).length} · 돈 ${spentUsd(l)}/${l.cap_usd} USD`);
  if (miss.length && miss.length <= 60) console.log(`없는 글자: ${miss.join("")}`);
}

function cmdEstimate() {
  const cfg = config(dir);
  const price = Number(opt.price ?? cfg.price_usd);
  const list = pending(pos);
  const usd = +(list.length * price).toFixed(2);
  const l = ledger(dir);
  console.log(`견적: ${list.length}장 × ${price} USD = ${usd} USD (이미 쓴 돈 ${spentUsd(l)}, 승인 상한 ${l.cap_usd})`);
  console.log("값은 font.json price_usd(또는 --price) 기준 어림이다. 실제 값은 쓰는 서비스의 가격표·견적(dry run)으로 확인한다.");
}

// 승인: 금액 상한(--cap, 누적 USD)과/또는 장 수 상한(--sheets, 누적 장 — 장당 0원으로 적는 Codex 내장 도구용).
// --note 에 사용자가 실제로 한 말을 적는다(장부만으로는 "예"를 들었는지 알 수 없으니 기록이라도 남긴다).
function cmdApprove() {
  if (opt.cap == null && opt.sheets == null) die('--cap <USD> 또는 --sheets <장 수> — 사용자가 직접 말한 금액·장 수만 넣는다');
  const cap = opt.cap == null ? null : Number(opt.cap);
  if (cap != null && !(cap > 0 && Number.isFinite(cap))) die("--cap 은 0 보다 큰 USD 숫자 — 사용자가 직접 말한 금액만 넣는다");
  const sheets = opt.sheets == null ? null : Number(opt.sheets);
  if (sheets != null && !(Number.isInteger(sheets) && sheets > 0)) die("--sheets 는 1 이상의 정수(사용자가 승인한 누적 장 수)");
  if (!opt.note || opt.note === true) die('--note "<사용자가 한 말 그대로, 예: 6.3달러까지 예>" 가 필요하다');
  const l = ledger(dir);
  const at = new Date().toISOString();
  if (cap != null) l.cap_usd = cap;
  if (sheets != null) l.cap_sheets = sheets;
  l.approved_at = at; l.note = String(opt.note);
  l.approvals = [...(l.approvals ?? []), { at, cap_usd: cap, cap_sheets: sheets, note: String(opt.note) }];
  writeJson(ledgerFile(dir), l);
  console.log(`ok 상한 ${l.cap_usd} USD${l.cap_sheets != null ? ` · ${l.cap_sheets}장` : ""} (이미 쓴 돈 ${spentUsd(l)}, 쓴 장 ${sheetsUsed(l)}) — 사용자가 승인한 것으로 기록함`);
}

function cmdCheck() {
  const usd = opt.usd == null ? config(dir).price_usd : num(opt.usd, "--usd");
  const r = canSpend(dir, usd);
  console.log(r.ok ? `ok 남은 돈 ${r.left} USD${r.sheetsLeft != null ? ` · 남은 장 ${r.sheetsLeft}` : ""}` : `멈춤: ${r.reason}. 사용자에게 묻고 approve 로 올린다`);
  process.exit(r.ok ? 0 : 1);
}

// 에이전트(C)가 그리기 직전에 견적 금액으로 적는다. --job 은 그 요청의 idempotency key — 같은 키로 다시 적으면 무시한다(재시도는 한 번만 청구되므로).
function cmdSpend() {
  if (!opt.sheet || opt.sheet === true) die("--sheet <장> --usd <금액> [--backend agent|mcp|codex] [--job <id>]");
  const usd = num(opt.usd, "--usd");
  const ids = new Set([...sheetsOf(dir).map((s) => s.id), "drafts"]);
  if (!ids.has(opt.sheet)) die(`모르는 장: ${opt.sheet} (sheets.json 의 장 또는 drafts)`);
  const backend = opt.backend ?? "agent";
  if (!["agent", "mcp", "codex"].includes(backend)) die("--backend 는 agent · mcp · codex 중 하나");
  const job = opt.job && opt.job !== true ? String(opt.job) : null;
  if (job && ledger(dir).spent.some((x) => x.job === job)) { console.log(`이미 기록된 작업 id(${job}) — 다시 적지 않음`); return; }
  const l = recordSpend(dir, { sheet: opt.sheet, usd, backend, job });
  console.log(`ok 기록 · 쓴 돈 ${spentUsd(l)}/${l.cap_usd} USD${l.cap_sheets != null ? ` · 쓴 장 ${sheetsUsed(l)}/${l.cap_sheets}` : ""}`);
}

// B: OpenAI 이미지 편집 API(참조 그림 여러 장 + 프롬프트). 키는 환경 변수 OPENAI_API_KEY 에서만 읽고 출력하지 않는다.
async function cmdOpenai() {
  const cfg = config(dir);
  const o = { ...cfg.openai, ...(opt.model ? { model: opt.model } : {}), ...(opt.size ? { size: opt.size } : {}), ...(opt.quality ? { quality: opt.quality } : {}) };
  const price = Number(opt.price ?? cfg.price_usd);
  let list = pending(pos).filter((s) => existsSync(P(dir, "jobs", s.id, "prompt.txt")));
  if (!list.length) die("그릴 장이 없다(jobs 를 먼저, 이미 받은 장은 건너뜀)");
  // 첫 장을 자르고 확인하기 전(format.png 없음)에는 상한이 넉넉해도 한 장만 보낸다 — 첫 장이 틀리면 나머지 돈이 다 버려진다
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
    for (const s of list) console.log(`[dry-run] ${s.id} · POST https://api.openai.com/v1/images/edits · model ${o.model} · size ${o.size} · quality ${o.quality} · image[] ${readJson(P(dir, "jobs", s.id, "job.json")).refs.join(", ")}`);
    console.log(`[dry-run] ${list.length}장 × ${price} USD ≈ ${(list.length * price).toFixed(2)} USD — 아무것도 보내지 않음`);
    return;
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) die("환경 변수 OPENAI_API_KEY 가 없다 — 사용자가 자기 터미널에서 설정한다(값을 대화에 붙이지 않는다)");
  for (const s of list) {
    const c = canSpend(dir, price);
    if (!c.ok) die(`${s.id} 전에 멈춤: ${c.reason}. 사용자 승인으로 approve --cap 을 올린 뒤 다시 돌리면 받은 장은 건너뛴다`);
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
    recordSpend(dir, { sheet: s.id, usd: price, backend: "openai", state: "sent", model: o.model });
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
    console.log(`ok ${s.id} → inbox/${s.id}.png · 쓴 돈(어림) ${spentUsd(l)}/${l.cap_usd} USD`);
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

async function cmdCut() {
  const sharp = await loadSharp();
  const sheets = sheetsOf(dir).filter((s) => existsSync(inboxFile(dir, s.id)) && (pos.length ? pos.includes(s.id) : opt.all || !existsSync(P(dir, "cells", s.id, "cells.json"))));
  const warned = [];
  for (const s of sheets) {
    const file = inboxFile(dir, s.id);
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
  if (warned.length) { console.log(`경고 ${warned.length}장(${warned.join(" ")}) — review/<장>.png 로 보고, 칸이 어긋났거나 흐리면 그 장을 다시 받는다`); process.exitCode = 2; }
}

// 에이전트가 눈으로 보는 검토 그림: 칸 손글씨 옆에 써야 할 글자를 활자로
async function reviewPng(sharp, s, cells) {
  const font = scriptOf(config(dir)).font;
  const S = 200, G = 6, cw = S + G, comp = [];
  for (const [k, c] of cells.entries()) {
    const img = await sharp(P(dir, "cells", s.id, `${c.rc}.png`)).resize(S, S, { fit: "contain", background: "#fff" }).png().toBuffer();
    comp.push({ input: img, left: (k % 6) * cw + G, top: Math.floor(k / 6) * cw + G + 40 });
  }
  // 빈 칸(잉크가 너무 적어 폰트에서 빠지는 칸)은 빨간 테두리 + "빈 칸" — 흐린 그림에서는 멀쩡해 보여도 빠진다
  const emptyMarks = cells.map((c, k) => c.empty ? `<rect x="${(k % 6) * cw + G + 2}" y="${Math.floor(k / 6) * cw + G + 42}" width="${S - 4}" height="${S - 4}" fill="none" stroke="#d0301f" stroke-width="5"/><text x="${(k % 6) * cw + G + S / 2}" y="${Math.floor(k / 6) * cw + G + 40 + S - 10}" text-anchor="middle" font-size="22" fill="#d0301f" font-family="Malgun Gothic, Apple SD Gothic Neo, Noto Sans CJK KR, sans-serif">빈 칸(빠짐)</text>` : "").join("");
  const labels = emptyMarks + cells.map((c, k) => `<text x="${(k % 6) * cw + G + S - 6}" y="${Math.floor(k / 6) * cw + G + 40 + 38}" text-anchor="end" font-size="34" fill="#1f5fd0" font-family="${font}">${esc(c.ch)}</text><text x="${(k % 6) * cw + G + 6}" y="${Math.floor(k / 6) * cw + G + 40 + S - 8}" font-size="14" fill="#999" font-family="sans-serif">${c.rc}</text>`).join("");
  const Wt = 6 * cw + G, Ht = 6 * cw + G + 40;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wt}" height="${Ht}"><text x="10" y="28" font-size="22" font-family="sans-serif">${esc(s.id)} — 파란 글자가 그 칸에 써야 할 글자</text>${labels}</svg>`;
  await sharp({ create: { width: Wt, height: Ht, channels: 3, background: "#fff" } }).composite([...comp, { input: Buffer.from(svg), left: 0, top: 0 }]).png().toFile(P(dir, "review", `${s.id}.png`));
}

// 사람이 보는 검토 페이지: 칸을 누르면 "버림", 다른 글자로 쓰였으면 그 글자를 적고, 아래 JSON 을 errors.json 에 붙인다
function reviewHtml() {
  const errors = readJson(P(dir, "errors.json"), {});
  const data = sheetsOf(dir).filter((s) => existsSync(P(dir, "cells", s.id, "cells.json"))).map((s) => ({ id: s.id, cells: readJson(P(dir, "cells", s.id, "cells.json")).cells }));
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>칸 검토</title>
<style>:root{color-scheme:light dark;--bg:#f4f5f7;--card:#fff;--ink:#1b2030;--line:#d8dce4;--blue:#2b67b8;--bad:#c93a2f}
@media (prefers-color-scheme:dark){:root{--bg:#13161c;--card:#1a1e26;--ink:#e6e8ee;--line:#2e3440;--blue:#86b4ff;--bad:#ff8a80}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 'Malgun Gothic',sans-serif}main{max-width:1320px;margin:0 auto;padding:20px 16px 200px}
h2{margin:18px 0 6px}.g{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}
.c{position:relative;background:#fff;border:2px solid var(--line);border-radius:8px;cursor:pointer;aspect-ratio:1}.c img{width:100%;height:100%;object-fit:contain}
.c b{position:absolute;right:6px;top:2px;font-size:26px;color:#1f5fd0;font-weight:400}.c i{position:absolute;left:6px;bottom:2px;font-size:11px;color:#999;font-style:normal}
.c.empty{border-color:var(--bad);border-style:dashed}.c.empty:after{content:"빈 칸(빠짐)";position:absolute;left:0;right:0;bottom:16px;text-align:center;color:#d0301f;font-size:12px}.c.bad{border-color:var(--bad);opacity:.45}.c.alt{border-color:#e0a000}.c em{position:absolute;left:6px;top:2px;font-size:20px;color:#b07000;font-style:normal}
.bar{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--line);padding:10px 16px}textarea{width:100%;height:90px;font:12px Consolas,monospace}</style>
<main><h1>칸 검토</h1><p>칸을 한 번 누르면 <b>버림</b>(틀림), 두 번 누르면 <b>다른 글자로 씀</b>(실제로 쓴 글자를 입력), 세 번이면 되돌림. 끝나면 아래 JSON 을 작업 폴더 errors.json 에 그대로 저장한다.</p><div id="app"></div></main>
<div class="bar"><textarea id="out" readonly></textarea></div>
<script>const D=${JSON.stringify(data)};const E=${JSON.stringify(errors)};
const app=document.getElementById("app"),out=document.getElementById("out");
function sync(){out.value=JSON.stringify(E,null,1)}
for(const s of D){const h=document.createElement("h2");h.textContent=s.id;app.append(h);const g=document.createElement("div");g.className="g";app.append(g);
for(const c of s.cells){const d=document.createElement("div");d.className=c.empty?"c empty":"c";d.innerHTML='<img loading="lazy" src="../cells/'+s.id+'/'+c.rc+'.png" alt=""><b></b><i>'+c.rc+'</i><em></em>';d.querySelector("b").textContent=c.ch;
const paint=()=>{const m=(E[s.id]||{})[c.rc];d.classList.toggle("bad",m==="?");d.classList.toggle("alt",!!m&&m!=="?");d.querySelector("em").textContent=m&&m!=="?"?m:""};
d.onclick=()=>{E[s.id]=E[s.id]||{};const m=E[s.id][c.rc];if(m===undefined)E[s.id][c.rc]="?";else if(m==="?"){const a=prompt("이 칸에 실제로 쓰인 글자(한 글자):","");if(a&&[...a.trim()].length===1)E[s.id][c.rc]=a.trim();else delete E[s.id][c.rc]}else delete E[s.id][c.rc];if(!Object.keys(E[s.id]).length)delete E[s.id];paint();sync()};paint();g.append(d)}}sync();</script></html>`;
  writeFileSync(P(dir, "review", "index.html"), html, "utf8");
  console.log(`검토 페이지 review/index.html (장 ${data.length}개) · 에이전트용 그림 review/<장>.png`);
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
  if (missSym.length) {
    // 빠진 부호를 36칸에 돌려 채운다(같은 부호를 여러 번 — 가장 나은 칸을 쓴다)
    const cells = Array.from({ length: 36 }, (_, i) => missSym[i % missSym.length]);
    all.sheets.push({ id: `r${String(++n).padStart(2, "0")}`, kind: "symbols", redo: true, rows: rowsOf(cells) });
    console.log(`- 부호 다시 쓰기 1장(r${String(n).padStart(2, "0")}) · 없는 부호 ${missSym.join(" ")}`);
  }
  if (missLat.length) {
    // 빠진 영문을 30칸에 돌려 채우고, 끝 6칸은 기준선을 잴 글자(H x n o E u — 이 칸들은 폰트에 쓰지 않는다)
    const cells = [...Array.from({ length: 30 }, (_, i) => missLat[i % missLat.length]), ..."HxnoEu"];
    all.sheets.push({ id: `r${String(++n).padStart(2, "0")}`, kind: "latin", redo: true, rows: rowsOf(cells) });
    console.log(`- 영문 다시 쓰기 1장(r${String(n).padStart(2, "0")}) · 없는 글자 ${missLat.join(" ")}`);
  }
  if (!miss.length) { writeJson(P(dir, "sheets.json"), all); console.log(n > n0 ? "→ jobs 로 묶음을 만든다" : `없는 ${sc.label}·부호가 없다 — redo 필요 없음`); return; }
  // 한 글자를 두 번 이상: 36칸을 없는 글자로 돌려 채우고, 장마다 섞는다
  let seed = 11 + n;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const shuf = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const per = Math.max(2, Math.floor(36 / Math.min(36, miss.length)));
  const pool = shuf(miss.flatMap((c) => Array(Math.min(per, 4)).fill(c)));
  const made = chunk(pool, 36).map((cells, i) => {
    while (cells.length < 36) cells.push(miss[cells.length % miss.length]);
    const rows = rowsOf(shuf(cells));
    // 일본어는 한자가 있으면 활자 구조 참조를 늘 넣는다(자모 풀이 같은 철자 목록이 없어서)
    return { id: `r${String(n + i + 1).padStart(2, "0")}`, kind: "redo", rows, spell: sc.id === "ko", print: !!opt.print || (sc.id === "ja" && [...rows.join("")].some(isKanji)) };
  });
  all.sheets.push(...made);
  writeJson(P(dir, "sheets.json"), all);
  console.log(`ok 다시 쓰기 ${made.length}장(${made.map((s) => s.id).join(" ")}) · 없는 ${sc.label} ${miss.length}자${made.some((s) => s.print) ? " · 활자 참조(ref-3) 넣음" : ""} → jobs 로 묶음을 만든다`);
}

// ---- 확대 대조: 칸 손글씨(300px) 아래에 그 장의 활자 참조(ref-3) 칸 — 에이전트 검수에서 획 하나 차이를 볼 때
//   compare <dir> s12:01 s14:34 …   → review/compare.png (활자 참조가 없는 장은 손글씨만)
async function cmdCompare() {
  const sharp = await loadSharp();
  const items = pos.filter((x) => /^[A-Za-z0-9]+:\d\d$/.test(x));
  if (!items.length) die("compare <dir> <장>:<칸> … (예: compare ./my-font s12:01 s14:34)");
  const S = 300, m = Math.round(1024 * 0.03), s = (1024 - 2 * m) / 6, comp = [];
  for (const [k, it] of items.entries()) {
    const [sheet, rc] = it.split(":");
    const cellPng = P(dir, "cells", sheet, `${rc}.png`);
    if (!existsSync(cellPng)) die(`${cellPng} 가 없다 — 그 장을 cut 했는지, 칸 자리(행열 두 자리)가 맞는지 본다`);
    const x = (k % 6) * (S + 20), y = Math.floor(k / 6) * (S + 190);
    comp.push({ input: await sharp(cellPng).resize(S, S, { fit: "contain", background: "#fff" }).png().toBuffer(), left: x, top: y });
    const ref3 = P(dir, "jobs", sheet, "ref-3.png");
    if (existsSync(ref3)) {
      const r = +rc[0], c = +rc[1];
      comp.push({ input: await sharp(ref3).extract({ left: Math.round(m + c * s) + 3, top: Math.round(m + r * s) + 3, width: Math.round(s) - 6, height: Math.round(s) - 6 }).resize(150, 150).png().toBuffer(), left: x + 75, top: y + S + 10 });
    }
  }
  const W = Math.min(6, items.length) * (S + 20), H = Math.ceil(items.length / 6) * (S + 190);
  await sharp({ create: { width: W, height: H, channels: 3, background: "#fff" } }).composite(comp).png().toFile(P(dir, "review", "compare.png"));
  console.log(`ok review/compare.png · 칸 ${items.length}개(위 손글씨, 아래 활자 참조)`);
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
  let meta;
  if (cfg.base) {
    // 바탕 글자: 그 폰트의 크기 기준·장 배율을 그대로(장 이름 앞에 base: — 이 폴더의 장 이름과 안 겹치게)
    const b = baseGlyphs(cfg), bdir = path.dirname(cfg.base.glyphs);
    for (const [k, v] of Object.entries(b.sheetScale)) sheetScale[`base:${k}`] = v;
    const bg = fromBase.map((g) => ({ ...g, file: path.resolve(bdir, g.file), sheet: `base:${g.sheet}`, base: true }));
    meta = { up: b.up ?? UP, ink: b.ink ?? INK, hangulInkHeightMedian: b.hangulInkHeightMedian, hangulCenterMedian: b.hangulCenterMedian, sheetScale, glyphs: [...bg, ...glyphs] };
  } else {
    // 글자 크기 기준: 한글이 적으면(받침 없는 글자만 많은 장 등) 잉크 높이 중앙값이 한쪽으로 쏠린다 → 칸 높이 × 0.69(모두의 둥글펜 2,338자 실측 비율)
    const inkMed = med(han.map((g) => g.ink.y1 - g.ink.y0));
    meta = { up: UP, ink: INK, hangulInkHeightMedian: han.length >= 300 ? inkMed : Math.round(cellH * 0.69), hangulCenterMedian: +med(han.map((g) => (g.ink.y0 + g.ink.y1) / 2 / g.cell.h)).toFixed(4), sheetScale, glyphs };
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
        if (c.empty || errors[sid]?.[c.rc] !== undefined || !LATIN_BASELINE.includes(c.ch)) continue;
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
const CMDS = { init: cmdInit, latin: cmdLatin, drafts: cmdDrafts, pick: cmdPick, plan: () => planSheets(config(dir)), jobs: cmdJobs, status: cmdStatus, estimate: cmdEstimate, approve: cmdApprove, check: cmdCheck, spend: cmdSpend, openai: cmdOpenai, cut: cmdCut, review: reviewHtml, redo: cmdRedo, compare: cmdCompare, preview: cmdPreview, glyphs: cmdGlyphs, bold: cmdBold };
if (!CMDS[cmd]) die(`모르는 명령: ${cmd} (help)`);
await CMDS[cmd]();
