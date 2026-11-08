// 모두의 폰트 스킬(modu-font) 공통: 작업 폴더(프로젝트) 구조, 설정, 글자 집합, 자모 풀이, 프롬프트, 돈 장부.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const P = (dir, ...a) => path.join(path.resolve(dir), ...a);
export const readJson = (f, d = undefined) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d);
export const writeJson = (f, v) => { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(v, null, 2) + "\n", "utf8"); };
export const die = (msg) => { console.error(`멈춤: ${msg}`); process.exit(1); };

export async function loadSharp() {
  try { return (await import("sharp")).default; } catch { die("sharp 가 없다 — 스킬 폴더에서 `npm install` 을 먼저 돌린다."); }
}

export const config = (dir) => readJson(P(dir, "font.json")) ?? die(`${P(dir, "font.json")} 가 없다 — 먼저 init`);
export const sheetsOf = (dir) => readJson(P(dir, "sheets.json"), { sheets: [] }).sheets;

// KS X 1001 한글 2,350자(EUC-KR B0A1~C8FE). 차례는 assets/ks2350-order.txt(자주 쓰는 글자 먼저).
export function ks2350() {
  const d = new TextDecoder("euc-kr"), out = [];
  for (let a = 0xb0; a <= 0xc8; a++) for (let b = 0xa1; b <= 0xfe; b++) out.push(d.decode(Uint8Array.from([a, b])));
  return out;
}
export function orderedHangul() {
  const f = path.join(SKILL, "assets", "ks2350-order.txt");
  const order = existsSync(f) ? [...readFileSync(f, "utf8").trim()] : ks2350();
  if (order.length !== 2350) die(`ks2350-order.txt 가 2,350자가 아니다(${order.length})`);
  return order;
}
// 말풍선에 필요한 부호·채팅 낱자모·숫자 36자(한 장)
export const SYMBOLS = [",", ".", "?", "!", "…", "~", "「", "」", "“", "”", "‘", "’", "ㅋ", "ㅎ", "ㅠ", "ㅜ", "ㄷ", "ㅇ", "♡", "♪", "(", ")", "-", ":", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "%", "/"];
export const isHangul = (c) => /^[가-힣]$/.test(c);

const I = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ", M = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const F = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
export const jamo = (c) => { const n = c.charCodeAt(0) - 0xac00; return [I[Math.floor(n / 588)], M[Math.floor((n % 588) / 28)], F[n % 28]].filter(Boolean).join(" + "); };

// ---- 일본어 모드(font.json script: "ja") — 가나 + 한자(목록은 작업 폴더 chars-kanji.txt) + 일본어 부호 장
// 가나 171자: 히라가나 ぁ~ん(83) · 가타카나 ァ~ヴ ヵ ヶ(86) · 장음 ー · 반복 기호 々
export const KANA = [
  ...Array.from({ length: 0x3093 - 0x3041 + 1 }, (_, i) => String.fromCodePoint(0x3041 + i)),
  ...Array.from({ length: 0x30f6 - 0x30a1 + 1 }, (_, i) => String.fromCodePoint(0x30a1 + i)),
  "ー", "々",
];
// 만화 대사에 필요한 일본어 부호·숫자 36자(한 장). ！？（）：％／ 는 전각.
export const SYMBOLS_JA = ["、", "。", "・", "！", "？", "…", "〜", "「", "」", "『", "』", "（", "）", "【", "】", "♪", "♡", "♥", "★", "※", "→", "：", "％", "／", "＋", "＝", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
export const isKanji = (c) => /^[㐀-䶿一-鿿]$/.test(c);
export const isKana = (c) => /^[ぁ-ゖァ-ヺー々]$/.test(c);
// JIS X 0208 한자 — Node 내장 EUC-JP 디코더로 오프라인에서 만든다(1수준 2,965자 · 2수준 3,390자, 읽는 소리 순 — 빈도순 아님)
export function jisKanji(level = 1) {
  const d = new TextDecoder("euc-jp"), out = [];
  const [a0, a1] = level === 1 ? [0xb0, 0xcf] : [0xb0, 0xf4];
  for (let a = a0; a <= a1; a++) for (let b = 0xa1; b <= 0xfe; b++) { const c = d.decode(Uint8Array.from([a, b])); if (isKanji(c)) out.push(c); }
  return out;
}
// ---- 영문 더하기(font.json latin: true) — 한국어·일본어 폰트 모두 같은 90자, 같은 3장(L1~L3).
//   대소문자 52 + ASCII 부호 32 + “ ” ‘ ’ – —. 숫자는 본문 부호 장(sym)에 이미 있다.
//   폰트에 이미 있는 부호(한국어 sym 의 , . ? ! 등)는 그쪽이 이긴다 — 영문 장의 같은 부호는 쓰지 않는다.
//   3장이 폰트마다 같으니, 같은 손글씨의 다른 폰트 폴더에서 받은 그림을 그대로 옮겨 쓸 수 있다(latin --from).
export const LATIN_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", LATIN_LOWER = "abcdefghijklmnopqrstuvwxyz";
export const LATIN_PUNCT = [..."!?.,:;'\"()[]{}-_/\\|&@#$%*+=<>^`~", "“", "”", "‘", "’", "–", "—"];
export const LATIN = [...LATIN_UPPER, ...LATIN_LOWER, ...LATIN_PUNCT];
export const isLatin = (c) => LATIN.includes(c);
// 크기로만 갈리는 짝(c/C …)을 L3 빈자리에 한 번 더 — 첫 칸이 틀려(errors.json "?") 버려지면 이 칸이 쓰인다
const LATIN_SPARE = [..."CcOoSsVvWwXxZzPpKk"];
export function latinSheets() {
  const pairs = [...LATIN_UPPER].flatMap((c, i) => [c, LATIN_LOWER[i]]); // A a B b … — 대문자 옆에 소문자를 두어 크기 차이가 한 장 안에서 보이게
  const rest = [...pairs.slice(36), ...LATIN_PUNCT];
  const cells = [pairs.slice(0, 36), rest.slice(0, 36), [...rest.slice(36), ...LATIN_SPARE]];
  return cells.map((c, i) => ({ id: `L${i + 1}`, kind: "latin", rows: Array.from({ length: 6 }, (_, r) => c.slice(r * 6, r * 6 + 6).join("")) }));
}
// 칸 안 안내선(칸 높이에 대한 비율, 위에서부터) — 하늘색이라 cut 이 잉크로 보지 않는다. build 는 받은 장의 실제 기준선을 글자로 다시 잰다.
export const LATIN_GUIDE = { cap: 0.24, x: 0.45, base: 0.70 };

function promptLatin(sheet, cfg, { format = "sheet" } = {}) {
  const ref2 = format === "blank"
    ? "Reference 2 is an EMPTY grid with guide lines: it only shows the exact target format (paper, 6x6 light-blue grid, three light-blue guide lines inside every cell, margins)."
    : "Reference 2 is an earlier sheet of Latin letters by the same hand: the exact target format, and how this hand writes Latin letters on the guide lines.";
  const rows = sheet.rows.map((r, i) => `Row ${i + 1}: ${[...r].join("   ")}`);
  const body = [
    `Reference 1 is a handwriting sample (it may be in another script, such as Korean). ${ref2}`,
    `Write a new sheet of English letters in EXACTLY the same handwriting: ${cfg.style_text}. Same pen, stroke weight, roundness, proportions and slant, as if the same person wrote these Latin letters on the same day.`,
    "Simple print letters, each one written on its own: no cursive, no joining strokes, no serifs or flourishes the hand would not make. It must look handwritten, not like a typeface.",
    "Layout exactly like reference 2: a square sheet of plain white paper seen flat from directly above like a clean scan, a 6x6 grid of equal square cells drawn with thin light-blue lines, filling the sheet with a small even margin.",
    "Inside every cell keep the three faint light-blue guide lines of reference 2: a dotted top line (capital height), a dashed middle line (lowercase x-height) and a solid lower line (the baseline). Guide lines stay light blue; black ink only for the characters.",
    "No other text: no labels, no titles, no numbers. No drawings, no shadows, no decorations. Do NOT copy the characters of reference 2; write only the characters listed below.",
    "Each cell holds ONE character standing on the solid baseline of its cell, the way it would sit in a line of English handwriting:",
    "- Capital letters, and the tall strokes of b d f h k l t, reach the dotted top line. Lowercase letters (a c e m n o r s u v w x z and the bodies of the others) reach only the dashed middle line.",
    "- The tails of g j p q y go clearly below the baseline. The dots of i and j sit just above the dashed middle line.",
    "- Capital and lowercase pairs that share a shape (C c, K k, O o, P p, S s, U u, V v, W w, X x, Z z) differ in size: the capital reaches the top line, the lowercase only the middle line. Never write a capital where a lowercase letter is listed, or the other way round.",
    "- a and g as simple round handwritten forms; I is a plain upright stroke, l a plain tall stroke.",
    "- Punctuation at its usual place on the lines: . , : ; on the baseline (the tails of , and ; dip just below it); ' \" ‘ ’ “ ” ` ^ small, near the top line; - – — short to long horizontal strokes at the middle of the x-height (– about twice -, — about twice –); _ a line just under the baseline; ( ) [ ] { } | from the top line down to below the baseline; / \\ from the top line to the baseline; ~ = + * < > around the middle line; ! ? & @ # $ % about capital height, on the baseline.",
    "Cells row by row from the top, left to right within each row. Write exactly these characters (letters are case-sensitive):", ...rows,
  ];
  if (sheet.redo) body.push("This is a correction sheet: each character above was miswritten before (often the wrong case, or a letter not standing on the baseline). Look at every character twice before writing it.");
  return body.join("\n");
}

// 문자 체계별로 다른 것: 본문 글자 판별, 크기 기준 글자, 부호 장, 활자 그림 글꼴
const FONT_KO = "Malgun Gothic, Apple SD Gothic Neo, Noto Sans CJK KR, Noto Sans KR, sans-serif";
const FONT_JA = "Yu Gothic, YuGothic, Meiryo, MS Gothic, Hiragino Sans, Noto Sans CJK JP, Noto Sans JP, sans-serif"; // 한중일 통합 한자는 일본어 글꼴로 그려야 일본식 자형이 나온다
export const SCRIPTS = {
  ko: { id: "ko", label: "한글", isMain: isHangul, isSizeRef: isHangul, symbols: SYMBOLS, font: FONT_KO },
  ja: { id: "ja", label: "가나·한자", isMain: (c) => isKana(c) || isKanji(c), isSizeRef: isKanji, symbols: SYMBOLS_JA, font: FONT_JA },
};
export const scriptOf = (cfg) => SCRIPTS[cfg?.script ?? "ko"] ?? die(`font.json script 는 ko 또는 ja (받은 값: ${cfg.script})`);
export const isMainSheet = (s) => s.kind === "hangul" || s.kind === "main";
export const isLatinSheet = (s) => s.kind === "latin";

function promptJa(sheet, cfg, { format = "sheet", print = false } = {}) {
  const style = cfg.style_text;
  const ref2 = format === "blank"
    ? "Reference 2 is an EMPTY grid: it only shows the exact target format (paper, 6x6 light-blue grid, margins)."
    : "Reference 2 is an earlier sheet by the same hand (it may be in another script): the exact target format, and how this hand writes single characters in cells.";
  const head = [
    `Reference 1 is a handwriting sample. ${ref2}`,
    `Write a new sheet in EXACTLY the same handwriting: ${style}. Same stroke weight, letter proportions, roundness and slant, as if the same person wrote it with the same pen on the same day.`,
    "Layout exactly like reference 2: a square sheet of plain white paper seen flat from directly above like a clean scan, a 6x6 grid of equal square cells drawn with thin light-blue lines, filling the sheet with a small even margin. Black ink; only the grid lines are light blue.",
    "No other text: no labels, no numbers outside the listed ones, no titles. No drawings, no shadows, no decorations. Do NOT copy the characters of reference 2; write only the characters listed below.",
  ];
  if (print) head.push("Reference 3 is NOT handwriting: it shows the very same 36 characters printed in a standard Japanese typeface, cell for cell in the same grid. Use it only to get every character's structure exactly right (the components of each kanji, where each one sits, and how many strokes it has), but draw every stroke in the handwriting of references 1 and 2 — never copy the printed letter shapes.");
  const rows = sheet.rows.map((r, i) => `Row ${i + 1}: ${[...r].join(sheet.kind === "symbols" ? "   " : " ")}`);
  if (sheet.kind === "symbols") return [...head,
    "Each cell is ONE character box the size of one kanji. Write each mark at the size and position it would have in a line of horizontal Japanese handwriting — do NOT enlarge small marks to fill the cell:",
    "- 、 and 。: small, at the bottom-left of the box; ！ and ？: full height; …: three small dots in the middle; 〜: medium, in the middle; ・: a small dot in the centre.",
    "- brackets 「 」 『 』 【 】 （ ）: 「 『 open at the top-left, 」 』 close at the bottom-right; 【 】 and （ ） are full height.",
    "- ♪ ♡ ♥ ★ ※ →: small hand-drawn marks, centered (♥ and ★ filled in solid black, ♡ outline only — ★ is a solid star, not ☆); ： ％ ／ ＋ ＝: normal text size.",
    "- digits 0-9: about the height of a kanji, simple handwritten digits.",
    "Cells row by row from the top, left to right within each row. Write exactly these characters:", ...rows].join("\n");
  const chars = [...sheet.rows.join("")];
  const hasKanji = chars.some(isKanji), hasKana = chars.some(isKana);
  const body = [...head,
    "Each cell holds ONE Japanese character, centered and upright. Kanji fill about 70% of the cell height; hiragana and katakana are a little smaller (about 60%). Small kana (ぁ ぃ ぅ ぇ ぉ っ ゃ ゅ ょ ゎ ァ ィ ゥ ェ ォ ッ ャ ュ ョ ヮ ヵ ヶ) are about half size, at the bottom-left of their cell as in horizontal Japanese writing.",
    "Cells row by row from the top, left to right within each row. Write exactly these characters, every stroke correct:", ...rows];
  if (hasKanji) body.push("Kanji: every component (radical) in its right place with the right number of strokes. These are Japanese kanji: write exactly the form shown in reference 3 (JIS forms — some rare ones are old-style forms on purpose); never substitute a simplified Chinese form, another variant or a similar-looking character, and never invent, merge or simplify a character. If a kanji is complex, keep all its strokes even if they are close together.");
  if (hasKana) body.push("Kana: keep dakuten ゛ and handakuten ゜ clearly visible; tell apart シ/ツ, ソ/ン, ク/ケ/タ, ぬ/め, ね/れ/わ, る/ろ, さ/ち, は/ほ.");
  if (sheet.kind === "redo") body.push(
    "This is a correction sheet: each character above was miswritten before. Look at every character twice before writing it.",
    "Common mistakes to avoid: a missing or extra stroke, a component replaced by a similar one, a lookalike kanji written instead (未/末, 土/士, 己/已/巳, 人/入, 大/犬/太), a Chinese simplified form, a missing dakuten or handakuten, a small kana written full size.");
  return body.join("\n");
}

// 프롬프트(모두의 둥글펜 때 그대로 — 400자 360/360, 2,350자 1,809/1,872 칸 정확). 일본어는 promptJa.
export function prompt(sheet, cfg, { format = "sheet", print = false } = {}) {
  if (sheet.kind === "latin") return promptLatin(sheet, cfg, { format });
  if ((cfg.script ?? "ko") === "ja") return promptJa(sheet, cfg, { format, print });
  const style = cfg.style_text;
  const ref2 = format === "blank"
    ? "Reference 2 is an EMPTY grid: it only shows the exact target format (paper, 6x6 light-blue grid, margins)."
    : "Reference 2 is an earlier sheet by the same hand: the exact target format, and how this hand writes single characters in cells.";
  const head = [
    `Reference 1 is a handwriting sample. ${ref2}`,
    `Write a new sheet in EXACTLY the same handwriting: ${style}. Same stroke weight, letter proportions, roundness and slant, as if the same person wrote it with the same pen on the same day.`,
    "Layout exactly like reference 2: a square sheet of plain white paper seen flat from directly above like a clean scan, a 6x6 grid of equal square cells drawn with thin light-blue lines, filling the sheet with a small even margin. Black ink; only the grid lines are light blue.",
    "No other text: no labels, no numbers outside the listed ones, no titles. No drawings, no shadows, no decorations. Do NOT copy the characters of reference 2; write only the characters listed below.",
  ];
  if (print) head.push("Reference 3 is NOT handwriting: it shows the very same 36 characters printed in a standard typeface, cell for cell in the same grid. Use it only to get every syllable's jamo structure exactly right (count the strokes of each vowel and each final consonant there), but draw every stroke in the handwriting of references 1 and 2 — never copy the printed letter shapes.");
  const rows = sheet.rows.map((r, i) => `Row ${i + 1}: ${[...r].join(sheet.kind === "symbols" ? "   " : " ")}`);
  if (sheet.kind === "symbols") return [...head,
    "Each cell is ONE character box the size of one Hangul syllable. Write each character at the size and position it would have right after a Hangul syllable in a line of this handwriting — do NOT enlarge small marks to fill the cell:",
    "- comma and period: small, at the bottom-left of the box on the baseline; question and exclamation marks: full syllable height; the ellipsis …: three small dots low in the middle; tilde ~: medium, in the middle.",
    "- corner brackets 「 」 and curly quotes “ ” ‘ ’: small, at the top of the box (「 opens at the top-left, 」 closes at the bottom-right, as in Korean/Japanese text).",
    "- single jamo ㅋ ㅎ ㅠ ㅜ ㄷ ㅇ: written on their own as in Korean chat (like ㅋㅋㅋ), about 70% of syllable height, centered.",
    "- heart ♡ and music note ♪: small hand-drawn outline, centered; parentheses, hyphen, colon, percent, slash: normal text size.",
    "- digits 0-9: about the height of a syllable, simple handwritten digits.",
    "Cells row by row from the top, left to right within each row. Write exactly these characters:", ...rows].join("\n");
  const body = [...head,
    "Each cell holds ONE Hangul syllable, centered, upright, about the same size in every cell (roughly 60% of the cell height).",
    "Cells row by row from the top, left to right within each row. Write exactly these syllables, every jamo correct (check each final consonant and each vowel stroke):", ...rows];
  if (sheet.spell) body.push(
    "Spelling check. Do NOT write this list on the sheet; it only spells out the jamo of each syllable above:",
    [...new Set(sheet.rows.join(""))].map((c) => `${c} = ${jamo(c)}`).join(", "),
    "Reminders: ㅠ has TWO downward legs under its bar and ㅛ TWO short strokes above its bar (do not reduce them to ㅡ, ㅜ or ㅗ); ㅑ ㅕ ㅒ ㅖ have two short side strokes; a final made of two consonants (ㄳ ㄵ ㄶ ㄺ ㄻ ㄼ ㄽ ㄾ ㄿ ㅀ ㅄ) is written as exactly those two consonants side by side, the first one on the left.");
  if (sheet.kind === "redo") body.push(
    "This is a correction sheet: each syllable above was miswritten before. Look at every syllable twice before writing it.",
    "Common mistakes to avoid: writing ㅠ or ㅛ with only ONE leg/stroke (that makes ㅜ or ㅗ); drawing ㅁ as a round circle (ㅁ is a rounded SQUARE box with flat sides, ㅇ is a circle); doubling a single final ㅅ into ㅆ; writing ㄻ (ㄹ+ㅁ box) or ㄶ (ㄴ+ㅎ) as ㄹ+ㅂ; dropping the extra vertical stroke of ㅐ ㅔ ㅙ ㅞ ㅖ.");
  return body.join("\n");
}

// 돈 장부: 사용자가 승인한 상한(cap_usd)과 쓴 돈. 스크립트(openai)와 에이전트(내장 도구·MCP)가 같이 쓴다.
export const ledgerFile = (dir) => P(dir, "ledger.json");
export const ledger = (dir) => readJson(ledgerFile(dir), { cap_usd: 0, approved_at: null, note: "", spent: [] });
// 음수는 세지 않는다 — 장부를 "정정"하려고 음수를 적어 상한 여유를 늘리는 길을 막는다(spend 도 음수를 거절한다)
export const spentUsd = (l) => +l.spent.reduce((s, x) => s + Math.max(0, x.usd || 0), 0).toFixed(4);
export const sheetsUsed = (l) => l.spent.filter((x) => x.state !== "failed").length;
export function canSpend(dir, usd) {
  const l = ledger(dir);
  const left = +((l.cap_usd || 0) - spentUsd(l)).toFixed(4);
  const sheetsLeft = l.cap_sheets != null ? l.cap_sheets - sheetsUsed(l) : null;
  const base = { left, cap: l.cap_usd, spent: spentUsd(l), sheetsLeft };
  // 승인 기록이 없으면 0원짜리(Codex 내장 도구)도 멈춘다 — 장당 0 으로 적는 길이 승인 없이 열리지 않게
  if (!l.approved_at) return { ...base, ok: false, reason: "승인 기록이 없다(approve 를 한 번도 안 함)" };
  if (sheetsLeft != null && sheetsLeft < 1) return { ...base, ok: false, reason: `승인한 장 수(${l.cap_sheets}장)를 다 썼다` };
  if (usd > left + 1e-9) return { ...base, ok: false, reason: `남은 돈 ${left} USD < 이번 ${usd} USD — 상한(${l.cap_usd})을 넘는다` };
  return { ...base, ok: true };
}
export function recordSpend(dir, row) {
  const l = ledger(dir);
  l.spent.push({ at: new Date().toISOString(), ...row });
  writeJson(ledgerFile(dir), l);
  return l;
}

// 받은 장(inbox/<id>.png)
export const inboxFile = (dir, id) => P(dir, "inbox", `${id}.png`);
