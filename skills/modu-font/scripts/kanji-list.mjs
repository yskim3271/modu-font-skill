#!/usr/bin/env node
// 한자 목록(빈도순) 만들기 — init --script ja --chars <이 파일> 에 넣는다.
//   node scripts/kanji-list.mjs <kanji.json> <out.txt> [--set joyo|kyoiku] [--first 먼저둘글자.txt]
// kanji.json: davidluzgouveia/kanji-data 의 kanji.json(MIT, 원자료 KANJIDIC — EDRDG CC BY-SA 4.0). 받는 것은 다운로드라 사용자에게 먼저 묻는다.
//   grade 1~6 = 교육한자(KANJIDIC 기준 1,006), 8 = 나머지 상용(합계 2,136). freq = 신문 빈도 순위(없으면 끝으로).
// 2010 개정 상용한자표의 자형과 JIS 대용 자형이 다른 글자는 둘 다 넣는다(어느 쪽으로 입력해도 글자가 나오게). 𠮟 는 BMP 밖이라 叱 만.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [src, out, ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i++) if (rest[i].startsWith("--")) opt[rest[i].slice(2)] = rest[i + 1]?.startsWith("--") ? true : rest[++i];
const stop = (m) => { console.error(`멈춤: ${m}`); process.exit(1); };
if (!src || !out) stop("node scripts/kanji-list.mjs <kanji.json> <out.txt> [--set joyo|kyoiku] [--first 파일]");
if (!existsSync(src)) stop(`${src} 가 없다 — kanji-data 의 kanji.json 을 사용자 허락을 받고 받는다`);
const set = opt.set ?? "joyo";
if (!["joyo", "kyoiku"].includes(set)) stop("--set 은 joyo(상용 2,136) 또는 kyoiku(교육 1,006)");
const maxGrade = set === "joyo" ? 8 : 6;
const d = JSON.parse(readFileSync(src, "utf8"));
const pick = Object.entries(d).filter(([k, v]) => v.grade != null && v.grade <= maxGrade && [...k].length === 1);
const order = pick.sort(([ka, a], [kb, b]) => (a.freq ?? 1e9) - (b.freq ?? 1e9) || (a.strokes ?? 0) - (b.strokes ?? 0) || ka.codePointAt(0) - kb.codePointAt(0)).map(([k]) => k);
const VARIANTS = [["塡", "填"], ["剝", "剥"], ["頰", "頬"]]; // 표 자형 / 대용 자형
for (const pair of VARIANTS) if (pair.some((c) => order.includes(c))) for (const c of pair) if (!order.includes(c)) order.push(c);
let first = [];
if (opt.first && opt.first !== true) first = [...new Set([...readFileSync(opt.first, "utf8")].filter((c) => /[㐀-鿿]/.test(c)))];
const final = [...first, ...order.filter((c) => !first.includes(c) && c.codePointAt(0) <= 0xffff)];
writeFileSync(out, final.join("") + "\n", "utf8");
const expect = set === "joyo" ? 2136 : 1006; // 교육한자는 KANJIDIC 기준 1,006(2020 개정 뒤 1,026 — 늘어난 20자는 grade 8 로 들어 있다)
console.log(`ok ${out} · ${set} ${pick.length}자${pick.length !== expect ? ` (예상 ${expect} 과 다름 — 자료 판을 확인)` : ""} + 대용 자형 → ${final.length}자${first.length ? ` (앞에 ${first.length}자)` : ""}`);
