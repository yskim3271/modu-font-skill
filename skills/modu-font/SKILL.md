---
name: modu-font
description: Make a Korean (Hangul) or Japanese (kana + kanji) handwriting TrueType font from one handwriting sample with an image-generation model — sheets of 6x6 cells, one character per cell, cut, human-checked, traced to outlines, with a bold weight and optional Latin letters (A–Z, a–z, ASCII punctuation) in the same hand. Use when the user wants their own or an AI-drafted handwriting as an installable Korean or Japanese font (webtoon/manga speech bubbles, notes, Word), wants to add English letters to such a font, or mentions 손글씨 폰트, 한글 폰트 만들기, KS X 1001 2,350자, 手書きフォント, 상용한자 일본어 폰트, 영문 추가.
license: MIT
compatibility: Node 18.17+ with sharp (npm install in this folder) and Python 3 with fontTools (pip install -r requirements.txt). Needs ONE paid way to generate images — an OpenAI API key, or the host agent's own image tool / an image MCP server.
metadata:
  version: "0.5.0"
---

# 모두의 폰트 스킬 (modu-font) — 참고 이미지 한 장의 글씨체로 폰트 만들기

원하는 글씨체의 참고 이미지(손글씨 사진이나 AI 시안)를 견본으로, 이미지 생성 모델이 6×6 격자에 한 칸 한 글자씩 쓰게 하고, 칸을 잘라 사람이 확인한 뒤 윤곽을 따서 TTF(보통·굵게)로 조립한다. 모드: 한국어(기본, `references/korean.md`) · 일본어(`references/japanese.md`) · 영문 더하기(`references/latin.md`). 처음 만든 결과물: "모두의 둥글펜"(한글 2,338/2,350자 + 영문, 일본어판 포함).

모든 명령: `node scripts/hf.mjs <명령> <작업 폴더> [옵션]` (목록 `references/commands.md`). 작업 폴더는 사용자 프로젝트 안 아무 곳(예: `./my-font`).

## 0. 시작 전에 사용자와 정할 것 (짧게 묻는다)
1. **견본**: 손글씨 사진이 있나, 아니면 AI 시안 4개(`drafts`)에서 고를까?
2. **글자 수**: 말풍선용 약 500자(`--count 500`, 약 14장) / KS X 1001 전체 2,350자(약 66장 + 다시 쓰기). 부호·채팅 자모·숫자 36자 1장은 늘 들어간다.
3. **그리는 방법(백엔드)** — 아래 표에서 하나. 섞어 써도 된다(받은 장은 모두 `inbox/` 로 모인다).
4. **이름**: 영어(`--family-en`)와 한국어(`--family-ko`). 남의 폰트·브랜드 이름(예: "나눔")은 쓰지 않는다.
5. **영문**: 같은 손글씨로 영문(대소문자·ASCII 부호, 3장 약 $1.3)도 넣을까? 넣으면 `init … --latin`(이미 만든 폴더는 `latin <dir>`). 자세히 `references/latin.md`.

| 백엔드 | 돈 | 무엇을 하나 | 자세히 |
|---|---|---|---|
| B OpenAI 키 | 유료 | `hf.mjs openai` 가 이미지 편집 API 로 장마다 그려 `inbox/` 에 저장 | `references/backend-openai.md` |
| C 에이전트 도구 | 도구에 따라 | 지금 에이전트에 이미지 생성 도구(Codex 내장 image_gen, 이미지 MCP 서버 등)가 있으면 에이전트가 같은 묶음으로 직접 그려 `inbox/` 에 저장 | `references/backend-agent.md` |

기본값은 없다 — 사용자가 B 나 C 를 고른다. 에이전트에 이미지 도구가 있어도 **사용자가 C 를 고르기 전에는 쓰지 않는다.** (사람이 장마다 채팅 앱에 올려 받는 길은 0.5.0 에서 뺐다 — 수십 장을 손으로 주고받기엔 너무 길고 틀리기 쉽다.)

## 1. 흐름
```
init → (drafts → pick) → jobs → [B/C 로 그리기] → cut → 검수(errors.json) → redo → jobs → … → glyphs → build → bold → build --bold → 설치
```
1. `init <dir> --sample 견본.png --family-en "My Hand" --family-ko "내 손글씨" --style "<글씨 설명(영어)>" --count 500`
   - 견본이 없으면 `init <dir>` → `drafts <dir>` → 그림을 `inbox/drafts.png` 로 받기 → `pick <dir> --quad 1~4`.
   - `--style` 은 견본 글씨를 영어로 한 줄(예: "round, bubbly everyday handwriting with a thin black 0.5 mm gel pen (soft curves, big round ㅇ, chubby short letters)"). 프롬프트에 그대로 들어간다.
2. `jobs <dir>` — 안 받은 장마다 묶음(`ref-1.png` 견본, `ref-2.png` 형식, `prompt.txt`, `job.json`). **첫 장을 확인하기 전에는 첫 한글 장(s01) 하나만 묶는다**(`--all` 이면 전부). s01 을 받아 자르고 글씨가 견본과 같고 칸이 맞는지 사용자와 본 뒤 `jobs` 를 다시 돌리면, 기준에 맞는 첫 장이 형식 참조(`style/format.png`)가 되어 나머지 장이 만들어진다.
3. 그리기 — 백엔드별 문서대로. B·C 는 반드시 아래 "돈 규칙".
4. `cut <dir> [장…]` — 하늘색 격자선을 찾아 자르고 `review/<장>.png`(에이전트용), `review/index.html`(사람용 — 칸을 눌러 틀림 표시, 아래 JSON 을 `errors.json` 에 저장). 격자를 못 찾음·정사각 아님·긴 변 1,500px 미만·빈 칸이 있으면 `경고:` 로 알리고 종료 코드 2 — 그 장은 보고 다시 받는다(다시 받은 그림은 `cut <dir> <장>`). 빈 칸(잉크가 옅어 폰트에서 빠지는 칸)은 검토 그림에 빨간 테두리로 보인다. 기준에 안 맞는 장은 형식 참조가 되지 않는다.
5. **검수는 빼지 않는다.** 모델은 드문 글자에서 틀린다(실측 1,872칸 중 63칸: ㅠ·ㅛ 다리 하나, ㅁ 을 ㅇ 처럼, 받침 ㅅ→ㅆ, ㄻ·ㄶ→ㄼ, ㅞ·ㅙ 세로획 빠짐). 에이전트는 `review/<장>.png` 를 한 장씩 보며 칸마다 파란 글자와 손글씨를 대조해 틀린 칸을 `errors.json` 에 제안하고(`{"s07": {"24": "?"}}` = 버림, `{"s07": {"24": "쬐"}}` = 실제로는 '쬐'를 씀), 사용자가 페이지에서 확인한다. 기준은 `references/review.md`. **errors.json 을 고친 뒤에는 `review <dir>`** 를 돌려야 페이지에 그 제안이 보인다(페이지는 만들 때의 errors.json 을 담는다).
6. `redo <dir> [--print] [--replace]` — 아직 없는 본문 글자만 모아 다시 쓰기 장(흔한 실수 목록 + 자모 풀이, `--print` 면 활자 철자 참조 ref-3). 부호 장에서 빠진 글자(예: ★ 를 ☆ 로 그림)는 부호 장 형식의 다시 쓰기 장으로 따로 만든다. 의심 칸은 `compare <dir> <장>:<칸> …` 로 크게 보고 활자 참조와 대조한다. 안 받은 다시 쓰기 장이 남아 있으면 멈춘다(같은 글자에 두 번 내지 않게) — 그 장을 버리고 새로 만들려면 `--replace`. 두 번 해도 안 되는 글자는 멈추고 사용자에게 알린다(대체 글꼴로 나오게 두는 것도 답이다).
7. `glyphs <dir>` → `python scripts/build_font.py <dir>` → `bold <dir> [--units 14]` → `python scripts/build_font.py <dir> --bold` → `preview <dir>`(설치 없이 `out/preview.html` 로 가로·세로 조판 보기). 결과 `out/<PS>-Regular.ttf`·`-Bold.ttf`(같은 가족 — Word 굵게 단추·CSS 700 이 굵은 파일을 고른다). 2,350자 조립은 한 굵기에 10분 넘게 걸릴 수 있다(백그라운드로).
8. 설치(사용자가 원할 때만): Windows `pwsh -File scripts/install-windows.ps1 <ttf> "<가족 이름> Regular (TrueType)"`(관리자 권한 필요 없음), macOS·Linux `sh scripts/install-unix.sh <ttf>...`.

`status <dir>` 로 언제든 받은 장·없는 글자·쓴 돈을 본다.

## 2. 돈 규칙 (B·C — 어기지 않는다)
1. **견적 먼저**: `estimate <dir>` 로 장 수 × 장당 값을 보여 준다. C 에서 MCP 가 dry run(견적)을 주면 그 값을 쓴다.
2. **사용자의 "예"**: 금액을 말하고 승인받는다. 사용자가 "상한 없이"라고 해도 장부에는 이번 일을 덮는 금액을 적고 그 말을 `--note` 에 남긴다. 승인받은 금액만 `approve <dir> --cap <USD> --note "<사용자가 한 말>"` 로 적는다(누적 상한, `--note` 필수). 장당 0 으로 적는 Codex 내장 도구는 장 수를 승인받아 `approve <dir> --sheets <장 수> --note …`. 계획 승인("해 봐")은 결제 승인이 아니다. 승인 기록이 없으면 `check` 는 0원이어도 멈춘다.
3. **상한 안에서만, 한 번에 한 장**: 한 장 그리기 전마다 `check <dir> --usd <장당>` — 실패하면 멈추고 묻는다. 여러 장을 한 호출로 보내는 도구(MCP batch, `n` > 1)는 쓰지 않는다. **첫 장은 자르고 사용자와 본 뒤에** 나머지를 그린다 — B 는 첫 장 확인 전(`style/format.png` 없음)이면 스크립트가 한 장만 보낸다.
4. **기록은 보내기 전에** (장이 많아 서브에이전트에 나눠 맡길 때는 맡기는 쪽이 전부 먼저 적고, 서브에이전트는 장부를 건드리지 않는다 — `references/backend-agent.md`): C 는 한 장 보내기 **직전에** `spend <dir> --sheet <장> --usd <견적> --backend <codex|mcp> --job <idempotency key>`. 같은 `--job` 은 두 번 적히지 않으니 재시도 때 다시 불러도 된다. 금액은 0 이상만 받는다(실제 값이 달라도 음수로 "정정"하지 않는다). 응답 전에 끊긴 요청을 새 요청으로 다시 보내지 않는다(MCP 는 같은 idempotency key 로).
5. **키는 이름만**: API 키 값을 대화·파일·로그에 쓰지 않는다. 사용자가 자기 터미널에서 환경 변수로 넣는다.

## 3. 알아 둘 것
- 정확도는 GPT Image 2.6(2K) 으로만 쟀다(500자 432/432, 2,350자 1,809/1,872 첫 시도). 다른 모델은 첫 장으로 먼저 확인한다.
- 받는 그림은 정사각·긴 변 1,500px 이상 원본 PNG. 채팅 앱 미리보기 캡처는 흐려서 윤곽이 뭉개진다.
- 격자를 못 찾은 장은 6등분으로 자른다 — 칸이 어긋났으면 그 장을 다시 받는다.
- **영문**(`--latin` / `latin <dir>`): 한국어·일본어 폰트 모두 같은 3장(L1~L3) — 대소문자 52 + ASCII 부호 32 + “ ” ‘ ’ – —. 칸마다 하늘색 안내선(대문자 높이·x-높이·기준선)을 긋고, 조립 때 기준선·x-높이에 맞추고 옆 여백·커닝을 넣는다. 폰트에 이미 있는 부호(한국어 , . ? ! 등)는 그대로 둔다. 첫 영문 장(L1)을 받아 확인한 뒤 나머지 2장. 같은 손글씨의 다른 폰트 폴더로 받은 영문 장은 `latin <dir> --from <그 폴더>` 로 옮겨 쓴다(다시 그리지 않는다). 검수는 대소문자(c/C, o/O, s/S …)와 기준선을 본다. 자세히 `references/latin.md`.
- **한국어(한글)** 는 기본 모드(`--script ko`, 생략 가능) — 장 구성·자모 풀이·부호 장·흔한 실수·조립 규칙은 `references/korean.md`.
- **일본어(가나·한자)** 는 `init --script ja` — 상용한자 2,136자 + 가나 + 부호를 69장·$30 으로 실제로 만들었다(첫 시도에 틀린 칸은 부호 ★ 하나). 세로쓰기(세로용 부호 모양 · vhea/vmtx · vert)도 조립 때 저절로 들어간다 — 그림을 더 그리지 않는다. 한자 목록은 `scripts/kanji-list.mjs`(빈도순, 자료 다운로드는 사용자에게 묻고). 한국어 손글씨에서 시작하면 `drafts --base` → `pick --whole` 로 일본어 견본부터. 자세히 `references/japanese.md`.
- 만든 폰트를 배포하려면 쓴 생성 서비스의 약관(출력물 상업 이용)을 사용자가 확인한다. 라이선스는 사용자가 정하고(무료 폰트는 보통 SIL OFL 1.1), `font.json` 에 `copyright` · `license`(짧은 설명) · `license_url` · `description` 을 적으면 조립 때 폰트 이름 표(0·13·14·10)에 들어간다.
