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

// 글씨 종류(지시서 14): font.json kind — "hand"(손글씨, 기본 · 옛 폴더) 또는 "print"(활자). 프롬프트 · 시안의 손글씨 문장이 이 값으로 갈린다.
export const KINDS = ["hand", "print"];
export const kindOf = (cfg) => { const k = cfg?.kind ?? "hand"; if (!KINDS.includes(k)) die(`font.json kind 는 hand 또는 print (받은 값: ${k})`); return k; };
export const config = (dir) => readJson(P(dir, "font.json")) ?? die(`${P(dir, "font.json")} 가 없다 — 먼저 init`);
export const sheetsOf = (dir) => readJson(P(dir, "sheets.json"), { sheets: [] }).sheets;

// ---- 격자(한 장의 칸 수 N×N). 한국어 본문 장 · 부호 장 · 다시 쓰기 장은 그 폰트의 격자, 영문 장과 일본어 모드는 늘 6.
//   고를 수 있는 값이자 내려가는 차례. 규칙(0.09 · 14/12 · 한 번 더 · 낮추기)은 글씨체 다섯 개 · 장 18개에서 나온 임시 규칙이다.
export const GRIDS = [14, 12, 10, 8, 6];
export const GRID_BOUND = 0.09; // 견본의 획 굵기 ÷ 글자 높이가 이 값 미만이면 가는 글씨(14), 아니면 굵은 글씨(12)
export const gridOfFont = (cfg) => cfg?.grid?.n ?? 6; // 격자 정보가 없는 옛 작업 폴더는 6
export const gridOfSheet = (s) => s.rows.length;      // 장의 격자는 그 장의 줄 수(sheets.json) — 한 폰트에 본문 14 + 영문 6 이 같이 든다
// 칸 이름: N ≤ 10 은 행열 한 자리씩("24" = 3번째 줄 5번째 칸), N ≥ 11 은 두 자리씩("0213" = 3번째 줄 14번째 칸). 0 부터 센다.
export const rcName = (r, c, N) => (N <= 10 ? `${r}${c}` : `${String(r).padStart(2, "0")}${String(c).padStart(2, "0")}`);
export const rcParse = (rc) => (rc.length === 2 ? [+rc[0], +rc[1]] : [+rc.slice(0, 2), +rc.slice(2)]);
// 칸 그림을 뜰 때 선에서 안쪽으로 띄우는 화소. 6×6 은 0.5.0 과 같은 max(6, 2%) — 작은 칸에서는 최솟값이 36 ÷ N 으로 줄어 칸의 2~3% 가 된다
export const padOf = (cellW, N) => Math.max(Math.round(36 / N), Math.round(cellW * 0.02));
// 빈 칸으로 치는 잉크 화소 수(이 값 미만). 6×6 은 30 그대로, 작은 칸은 넓이 비례(바닥 4) — 작은 칸의 마침표가 빈 칸이 되지 않게
export const emptyPx = (N) => Math.max(4, Math.floor(30 * (6 / N) ** 2));

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
//   3장이 폰트마다 같으니, 같은 글씨(같은 견본)의 다른 폰트 폴더에서 받은 그림을 그대로 옮겨 쓸 수 있다(latin --from).
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
  const pr = kindOf(cfg) === "print"; // 활자(지시서 14) — 손글씨 문장만 바꾸고 나머지는 같다
  const ref2 = format === "blank"
    ? "Reference 2 is an EMPTY grid with guide lines: it only shows the exact target format (paper, 6x6 light-blue grid, three light-blue guide lines inside every cell, margins)."
    : pr ? "Reference 2 is an earlier sheet of Latin letters in the same typeface: the exact target format, and how this typeface draws Latin letters on the guide lines."
    : "Reference 2 is an earlier sheet of Latin letters by the same hand: the exact target format, and how this hand writes Latin letters on the guide lines.";
  const rows = sheet.rows.map((r, i) => `Row ${i + 1}: ${[...r].join("   ")}`);
  const body = [
    ...(pr ? [
      `Reference 1 is a lettering sample in a printed typeface (it may be in another script, such as Korean). ${ref2}`,
      `Draw a new sheet of English letters in EXACTLY the same typeface: ${cfg.style_text}. Same stroke weight, contrast, proportions and slant, as if set from the same font family: the Latin letters this typeface would have.`,
      "Printed Latin letters as in typeset text, each letter separate: serifs only if the typeface described above has serifs (a sans-serif typeface gets none). The same letter always has exactly the same shape.",
    ] : [
      `Reference 1 is a handwriting sample (it may be in another script, such as Korean). ${ref2}`,
      `Write a new sheet of English letters in EXACTLY the same handwriting: ${cfg.style_text}. Same pen, stroke weight, roundness, proportions and slant, as if the same person wrote these Latin letters on the same day.`,
      "Simple print letters, each one written on its own: no cursive, no joining strokes, no serifs or flourishes the hand would not make. It must look handwritten, not like a typeface.",
    ]),
    "Layout exactly like reference 2: a square sheet of plain white paper seen flat from directly above like a clean scan, a 6x6 grid of equal square cells drawn with thin light-blue lines, filling the sheet with a small even margin.",
    "Inside every cell keep the three faint light-blue guide lines of reference 2: a dotted top line (capital height), a dashed middle line (lowercase x-height) and a solid lower line (the baseline). Guide lines stay light blue; black ink only for the characters.",
    "No other text: no labels, no titles, no numbers. No drawings, no shadows, no decorations. Do NOT copy the characters of reference 2; write only the characters listed below.",
    `Each cell holds ONE character standing on the solid baseline of its cell, the way it would sit in a line of English ${pr ? "text set in this typeface" : "handwriting"}:`,
    "- Capital letters, and the tall strokes of b d f h k l t, reach the dotted top line. Lowercase letters (a c e m n o r s u v w x z and the bodies of the others) reach only the dashed middle line.",
    "- The tails of g j p q y go clearly below the baseline. The dots of i and j sit just above the dashed middle line.",
    "- Capital and lowercase pairs that share a shape (C c, K k, O o, P p, S s, U u, V v, W w, X x, Z z) differ in size: the capital reaches the top line, the lowercase only the middle line. Never write a capital where a lowercase letter is listed, or the other way round.",
    pr ? "- a and g in the usual printed forms of this typeface; I, l and 1 clearly different from each other." : "- a and g as simple round handwritten forms; I is a plain upright stroke, l a plain tall stroke.",
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
  const style = cfg.style_text, pr = kindOf(cfg) === "print"; // 활자(지시서 14)
  const ref2 = format === "blank"
    ? "Reference 2 is an EMPTY grid: it only shows the exact target format (paper, 6x6 light-blue grid, margins)."
    : pr ? "Reference 2 is an earlier sheet in the same typeface (it may be in another script): the exact target format, and how this typeface draws single characters in cells."
    : "Reference 2 is an earlier sheet by the same hand (it may be in another script): the exact target format, and how this hand writes single characters in cells.";
  const head = [
    ...(pr ? [
      `Reference 1 is a lettering sample (a printed typeface). ${ref2}`,
      `Draw a new sheet in EXACTLY the same typeface: ${style}. Same stroke weight, contrast, serifs, proportions and slant, as if set from the same font file. A character that appears in several cells has exactly the same shape in every one of them, as printed type does.`,
    ] : [
      `Reference 1 is a handwriting sample. ${ref2}`,
      `Write a new sheet in EXACTLY the same handwriting: ${style}. Same stroke weight, letter proportions, roundness and slant, as if the same person wrote it with the same pen on the same day.`,
    ]),
    "Layout exactly like reference 2: a square sheet of plain white paper seen flat from directly above like a clean scan, a 6x6 grid of equal square cells drawn with thin light-blue lines, filling the sheet with a small even margin. Black ink; only the grid lines are light blue.",
    "No other text: no labels, no numbers outside the listed ones, no titles. No drawings, no shadows, no decorations. Do NOT copy the characters of reference 2; write only the characters listed below.",
  ];
  if (print) head.push(pr
    ? "Reference 3 shows the same 36 characters in a standard Japanese typeface, cell for cell in the same grid: use it only for each character's structure (the components of each kanji, where each one sits, and how many strokes it has), keep the sample's own typeface — never copy the letter shapes of reference 3."
    : "Reference 3 is NOT handwriting: it shows the very same 36 characters printed in a standard Japanese typeface, cell for cell in the same grid. Use it only to get every character's structure exactly right (the components of each kanji, where each one sits, and how many strokes it has), but draw every stroke in the handwriting of references 1 and 2 — never copy the printed letter shapes.");
  const rows = sheet.rows.map((r, i) => `Row ${i + 1}: ${[...r].join(sheet.kind === "symbols" ? "   " : " ")}`);
  if (sheet.kind === "symbols") return [...head,
    `Each cell is ONE character box the size of one kanji. Write each mark at the size and position it would have in a line of horizontal Japanese ${pr ? "text set in this typeface" : "handwriting"} — do NOT enlarge small marks to fill the cell:`,
    "- 、 and 。: small, at the bottom-left of the box; ！ and ？: full height; …: three small dots in the middle; 〜: medium, in the middle; ・: a small dot in the centre.",
    "- brackets 「 」 『 』 【 】 （ ）: 「 『 open at the top-left, 」 』 close at the bottom-right; 【 】 and （ ） are full height.",
    `- ♪ ♡ ♥ ★ ※ →: small ${pr ? "marks in the same style" : "hand-drawn marks"}, centered (♥ and ★ filled in solid black, ♡ outline only — ★ is a solid star, not ☆); ： ％ ／ ＋ ＝: normal text size.`,
    `- digits 0-9: about the height of a kanji, ${pr ? "the digits of this typeface" : "simple handwritten digits"}.`,
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
  // 격자 N×N(그 장의 줄 수). N = 6 이면 문구가 0.5.0 과 글자 하나까지 같다. "an 8x8" — 8 · 11 · 18 은 모음 소리로 시작한다
  const N = gridOfSheet(sheet), a = [8, 11, 18].includes(N) ? "an" : "a";
  // 글씨 종류(지시서 14): print(활자)면 손글씨를 전제한 문장만 활자 말로 바꾼다. hand 는 0.6.0 과 바이트 같다(공통 문장은 손대지 않는다)
  const pr = kindOf(cfg) === "print";
  const ref2 = format === "blank"
    ? `Reference 2 is an EMPTY grid: it only shows the exact target format (paper, ${N}x${N} light-blue grid, margins).`
    : pr ? "Reference 2 is an earlier sheet in the same typeface: the exact target format, and how this typeface draws single characters in cells."
    : "Reference 2 is an earlier sheet by the same hand: the exact target format, and how this hand writes single characters in cells.";
  const head = [
    ...(pr ? [
      `Reference 1 is a lettering sample (a printed typeface). ${ref2}`,
      `Draw a new sheet in EXACTLY the same typeface: ${style}. Same stroke weight, contrast, serifs, proportions and slant, as if set from the same font file. A character that appears in several cells has exactly the same shape in every one of them, as printed type does.`,
    ] : [
      `Reference 1 is a handwriting sample. ${ref2}`,
      `Write a new sheet in EXACTLY the same handwriting: ${style}. Same stroke weight, letter proportions, roundness and slant, as if the same person wrote it with the same pen on the same day.`,
    ]),
    `Layout exactly like reference 2: a square sheet of plain white paper seen flat from directly above like a clean scan, ${a} ${N}x${N} grid of equal square cells drawn with thin light-blue lines, filling the sheet with a small even margin. Black ink; only the grid lines are light blue.`,
    "No other text: no labels, no numbers outside the listed ones, no titles. No drawings, no shadows, no decorations. Do NOT copy the characters of reference 2; write only the characters listed below.",
  ];
  if (print) head.push(pr
    ? `Reference 3 shows the same ${N * N} characters in a standard typeface, cell for cell in the same grid: use it only for the jamo structure (count the strokes of each vowel and each final consonant there), keep the sample's own typeface — never copy the letter shapes of reference 3.`
    : `Reference 3 is NOT handwriting: it shows the very same ${N * N} characters printed in a standard typeface, cell for cell in the same grid. Use it only to get every syllable's jamo structure exactly right (count the strokes of each vowel and each final consonant there), but draw every stroke in the handwriting of references 1 and 2 — never copy the printed letter shapes.`);
  const rows = sheet.rows.map((r, i) => `Row ${i + 1}: ${[...r].join(sheet.kind === "symbols" ? "   " : " ")}`);
  if (sheet.kind === "symbols") return [...head,
    `Each cell is ONE character box the size of one Hangul syllable. Write each character at the size and position it would have right after a Hangul syllable in a line of ${pr ? "text set in this typeface" : "this handwriting"} — do NOT enlarge small marks to fill the cell:`,
    "- comma and period: small, at the bottom-left of the box on the baseline; question and exclamation marks: full syllable height; the ellipsis …: three small dots low in the middle; tilde ~: medium, in the middle.",
    "- corner brackets 「 」 and curly quotes “ ” ‘ ’: small, at the top of the box (「 opens at the top-left, 」 closes at the bottom-right, as in Korean/Japanese text).",
    "- single jamo ㅋ ㅎ ㅠ ㅜ ㄷ ㅇ: written on their own as in Korean chat (like ㅋㅋㅋ), about 70% of syllable height, centered.",
    `- heart ♡ and music note ♪: small ${pr ? "outline in the same style" : "hand-drawn outline"}, centered; parentheses, hyphen, colon, percent, slash: normal text size.`,
    `- digits 0-9: about the height of a syllable, ${pr ? "the digits of this typeface" : "simple handwritten digits"}.`,
    // 격자가 6 보다 크면 부호 36자를 N² 칸에 돌려 채운다 — 같은 부호가 여러 칸에 나온다는 것을 알려 준다(6×6 문구는 그대로)
    ...(N > 6 ? [`The same characters repeat in the same order across the sheet, so every character appears in several cells. ${pr ? "Draw every cell again, each repeat identical" : "Write every cell again by hand"} — never leave a repeated cell empty and never merge cells.`] : []),
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
    `Common mistakes to avoid: writing ㅠ or ㅛ with only ONE leg/stroke (that makes ㅜ or ㅗ); drawing ㅁ as a round circle (${pr ? "ㅁ is a square box with flat sides and corners" : "ㅁ is a rounded SQUARE box with flat sides"}, ㅇ is a circle); doubling a single final ㅅ into ㅆ; writing ㄻ (ㄹ+ㅁ box) or ㄶ (ㄴ+ㅎ) as ㄹ+ㅂ; dropping the extra vertical stroke of ㅐ ㅔ ㅙ ㅞ ㅖ.`);
  return body.join("\n");
}

// 돈 장부: 사용자의 승인 기록(approved_at · note · approvals)과 쓴 돈(spent). 스크립트(openai)와 에이전트(내장 도구·MCP)가 같이 쓴다.
//   금액 한도는 없다(지시서 11 — 사용자가 없앴다). 예전 폴더의 ledger.json 에 남은 한도 칸(cap_usd · cap_sheets)은 지우지 않고 읽지도 않는다.
export const ledgerFile = (dir) => P(dir, "ledger.json");
export const ledger = (dir) => readJson(ledgerFile(dir), { approved_at: null, note: "", spent: [] });
// 음수는 세지 않는다 — 장부를 "정정"하려고 음수를 적는 길을 막는다(spend 도 음수를 거절한다)
export const spentUsd = (l) => +l.spent.reduce((s, x) => s + Math.max(0, x.usd || 0), 0).toFixed(4);
export const sheetsUsed = (l) => l.spent.filter((x) => x.state !== "failed").length;
// 그려도 되는가(돈이 나가도 되는가): 금액이 아니라 "사용자의 승인 기록이 있는가"로만 정한다 — check · spend · openai 가 같이 쓴다.
export function canSpend(dir) {
  const l = ledger(dir);
  const base = { spent: spentUsd(l), sheets: sheetsUsed(l) };
  // 승인 기록이 없으면 0원짜리(Codex 내장 도구)도 멈춘다 — 견적을 말하고 "예"를 듣기 전에는 그리지 않는다
  if (!l.approved_at) return { ...base, ok: false, reason: "승인 기록이 없다(approve 를 한 번도 안 함) — 견적(estimate)을 사용자에게 말하고 승인을 받아 approve --note 로 적는다" };
  // 격자를 바꾸면 장 수(값)가 바뀐다 — 새 견적을 말하고 다시 승인받기 전에는 멈춘다
  const gc = l.grid_changes?.at(-1);
  if (gc && gc.at > l.approved_at) return { ...base, ok: false, reason: `격자가 바뀌었다(${gc.from}×${gc.from} → ${gc.to}×${gc.to}, 장 ${gc.sheets_before} → ${gc.sheets_after}) — 새 견적(estimate)을 사용자에게 말하고 승인을 다시 받는다(approve --note)` };
  // 다시 쓰기 장이 생기면(redo) 그 장 값도 새 견적이다 — 말하고 다시 승인받기 전에는 멈춘다(지시서 12). 같은 장 다시 받기(retry)는 막지 않는다
  const rq = l.redo_quotes?.at(-1);
  if (rq && rq.at > l.approved_at) return { ...base, ok: false, reason: `다시 쓰기 장이 생겼다(${rq.sheets.join(" ")} — ${rq.sheets.length}장 × ${rq.price} = ${rq.usd} USD) — 이 새 견적을 사용자에게 말하고 승인을 다시 받는다(approve --note)` };
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

// ---- 치운 그림(inbox/rejected/)과 시도 번호. 장 검사에서 떨어진 그림은 retry · grid --down 이 여기로 옮기고 log.json 에 적는다.
//   시도 번호 = 1 + 그 장 · 그 격자의 치운 그림 수. 보낼 때 쓸 키(idempotency key)는 <작업 폴더 이름>-<장>-g<N>-<시도> —
//   격자를 낮춘 뒤의 s01 이 예전 s01 과 같은 키를 쓰면 장부에 한 번만 적히고 서버가 예전 그림을 돌려주므로 키에 격자를 넣는다.
export const rejectedDir = (dir) => P(dir, "inbox", "rejected");
export const rejectedLog = (dir) => readJson(P(dir, "inbox", "rejected", "log.json"), { note: "장 검사에서 떨어져 치운 그림(retry · grid --down). 시도 번호는 이 목록으로 센다 — 지우지 않는다", rejected: [] });
export const attemptOf = (dir, id, N) => 1 + rejectedLog(dir).rejected.filter((x) => x.sheet === id && x.grid === N).length;
export const jobKey = (dir, id, N, attempt) => `${path.basename(path.resolve(dir))}-${id}-g${N}-${attempt}`;
