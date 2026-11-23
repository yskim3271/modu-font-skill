# 모두의 폰트 스킬 (modu-font-skill)

참고 이미지 한 장의 글씨체로 한글·일본어 TrueType 폰트(보통·굵게, 같은 글씨체의 영문 선택)를 만드는 에이전트 스킬. 이미지 생성 모델이 격자에 한 칸 한 글자씩 쓰고, 스크립트가 장을 검사해 선대로 칸을 자르고, 사람이 확인한 뒤 윤곽을 따서 조립한다. 한국어 본문은 견본의 획 굵기를 재서 14×14(가는 글씨)나 12×12(굵은 글씨) 격자로 쓰고, 첫 장이 장 검사에 떨어지면 같은 격자로 한 번 더 받은 뒤, 또 떨어지면 6×6 까지 한 단계씩 낮춘다. 일본어와 영문 장은 6×6. 처음 만든 폰트: "모두의 둥글펜"(KS X 1001 한글 2,338/2,350자 — 6×6 으로 만들었다).

## 모드

| 모드 | 명령 | 문서 |
|---|---|---|
| 한국어(기본) | `init <dir>` (`--script ko`) | `references/korean.md` |
| 일본어 | `init <dir> --script ja` | `references/japanese.md` |
| 영문 더하기 | `init … --latin` / `latin <dir>` | `references/latin.md` |

## 그리는 방법은 둘 — 섞어 써도 된다

| | 돈 | 방법 |
|---|---|---|
| B OpenAI 키 | 유료 | `hf.mjs openai` 가 이미지 편집 API 로 그림(`OPENAI_API_KEY`) |
| C 에이전트 도구 | 도구에 따라 | Codex 내장 이미지 도구, 이미지 MCP 서버(Sume 등)로 에이전트가 직접 |

둘 다 견적 → 사용자 승인(`approve`, `ledger.json` 에 기록) 뒤에만 돌고, 장마다 장부에 적는다. 자세한 규칙은 `SKILL.md`.

## 설치

저장소: https://github.com/yskim3271/modu-font-skill (스킬은 `skills/modu-font/`)
- Claude Code 플러그인: `/plugin marketplace add yskim3271/modu-font-skill` → `/plugin install modu-font@modu-font-skill`
- 손으로: `skills/modu-font` 폴더를 Claude Code `~/.claude/skills/modu-font` 또는 Codex `~/.agents/skills/modu-font`(프로젝트의 `.claude/skills`·`.agents/skills` 도 된다)에 둔다.

그다음 스킬 폴더에서 한 번:
```sh
npm install                      # sharp
pip install -r requirements.txt  # fontTools
```

## 빠른 흐름

```sh
node scripts/hf.mjs init my-font --sample 견본.png --family-en "My Hand" --family-ko "내 손글씨" --style "<영어 글씨 설명>" --count 500
# 활자(명조 · 고딕 같은 인쇄 글씨)면 --kind print 를 더한다(기본은 손글씨)
#   → "격자 14×14 — 견본의 획 굵기 ÷ 글자 높이 … → 가는 글씨" 처럼 격자와 까닭, 장 수가 나온다
node scripts/hf.mjs jobs my-font          # jobs/s01/ 묶음 — 첫 장이 통과하기 전에는 첫 장만 그린다
# B: estimate → approve --note "<사용자가 한 말>" → openai  /  C: references/backend-agent.md (에이전트가 그려 my-font/inbox/s01.png 로)
node scripts/hf.mjs cut my-font s01       # 받은 장마다 바로. 장 검사(됨 · 일부 · 안 됨) + "→ 다음:" 한 줄 — "경고:"(종료 코드 2)면 통과가 아니다. review/index.html 에서 틀린 칸 고르기 → my-font/errors.json
#   첫 장이 떨어지면: retry my-font s01 → jobs my-font s01 → 다시 그리기 → cut. 또 떨어지면: grid my-font --down → 새 견적을 말하고 다시 승인(approve --note)
node scripts/hf.mjs redo my-font && node scripts/hf.mjs jobs my-font   # 틀린 글자 다시
node scripts/hf.mjs glyphs my-font && python scripts/build_font.py my-font
node scripts/hf.mjs bold my-font && python scripts/build_font.py my-font --bold
```

## 비용 어림 (GPT Image 2.6 · 2K · 장당 약 $0.42 실측)

| 목표 | 장 | 비용 |
|---|---|---|
| 말풍선용 500자 + 부호 (6×6) | 15 | 약 $6.3 |
| KS X 1001 2,350자 + 부호 (6×6) | 67 + 다시 쓰기 몇 장 | 약 $28.1 + 다시 쓰기 장마다 $0.42 |
| 일본어 상용한자 2,136자 + 가나 + 부호 | 69(실측, 견본·다시 쓰기 포함) | $30.22 |
| 영문 더하기(대소문자 + ASCII 부호) | 3 + 다시 쓰기 | 약 $1.3 |

한국어 장 수는 격자에 따라 다르다(부호 장 1장 포함, 다시 쓰기 장은 따로). 값은 `estimate` 가 장 수 × 장당 값으로 낸다. 첫 장이 떨어져 같은 격자로 한 번 더 받으면 한 장 값이 더 들고, 아주 굵은 글씨는 12×12 첫 장에서 떨어져 10×10 으로 내려갈 수 있다(그때 그림 두 장 값이 더 든다).

| 격자 | 500자 | 2,350자 |
|---|---|---|
| 14 | 4장 | 13장 |
| 12 | 5장 | 18장 |
| 10 | 6장 | 25장 |
| 8 | 9장 | 38장 |
| 6 | 15장 | 67장 |

## 알아 둘 것

- 격자 규칙(획 ÷ 높이 0.09 를 경계로 14/12, 줄 어긋남 15%, 못 쓰는 줄 20%, 한 번 더 뒤 낮춤)은 글씨체 다섯 개 · 장 18개로 한 실험에서 나온 임시 규칙이다. 가는 펜은 칸이 작을수록 획이 상대적으로 굵게 나온다(14×14 가 6×6 의 1.3 ~ 1.6배) — 한 폰트는 한 격자로 쓴다.
- 정확도는 GPT Image 2.6 으로 쟀다(6×6 2,350자 첫 시도 1,809/1,872 · 14×14 500자 한 벌 497/500). 드문 글자와 둥근 손글씨의 ㅁ(→ ㅇ)이 틀리기 쉬워 검수는 빼면 안 된다.
- 영문은 `--latin`(이미 만든 폴더는 `latin <dir>`) — 기준선·x-높이 맞춤과 커닝이 들어간다(`references/latin.md`). 일본어 폰트에는 세로쓰기(세로용 부호 모양·vert)가 들어간다(`references/japanese.md`).
- 만든 폰트를 배포하려면 쓴 생성 서비스의 출력물 약관을 확인한다.

## 0.5.0 → 0.6.0 에서 바뀐 것

- **격자를 스스로 고른다**: 한국어는 견본의 획 굵기를 재서 가는 글씨는 14×14, 굵은 글씨는 12×12(못 재면 12×12). 장 수와 값이 크게 준다(500자 15장 → 4 ~ 5장, 2,350자 67장 → 13 ~ 18장).
- **장 검사**: 받은 장마다 선 수 · 줄 어긋남 · 칸마다 글자 하나를 보고 "됨 · 일부 · 안 됨"과 다음 할 일을 한 줄로 말한다. 선대로 자른다. 6×6 은 빈 칸만 뺀다.
- **첫 장 먼저**: 첫 장이 통과하기 전에는 다른 장으로 돈이 나가지 않는다. 떨어지면 같은 격자로 한 번 더, 또 떨어지면 격자를 한 단계 낮춘다.
- **상한 없음**: 금액 상한을 없앴다. 견적을 말하고 승인받은 기록(`approve --note`)과 장부는 그대로이고, 격자를 낮추거나 다시 쓰기 장을 만들면 새 견적을 다시 승인받는다.
- **다시 쓰기**: 형식 참조를 실수가 가장 적은 장으로 고르고(`--format` 으로 바꿀 수 있다), 받아들이지 않는 장은 `errors.json` 에 `"*"` 로 통째로 버린다. 둥근 손글씨의 ㅁ 검수 기준을 더했다.
- **손글씨 말고 활자도**: 글씨 종류 `--kind hand|print` 를 두었다. 활자(명조 · 고딕 같은 인쇄 글씨)를 고르면 프롬프트 · 시안에서 "같은 사람이 같은 펜으로" 같은 손글씨 말이 빠지고 "같은 활자로, 같은 글자는 칸마다 똑같이"로 쓴다. 활자 시안 네 가지(명조 둘 · 고딕 둘)도 있다. 만들던 폴더의 종류는 `style <dir> --kind …` 로 바꾼다.
- **서버 그림 다시 쓰기**: 참조 그림마다 sha256 을 적어 이미 올린 그림을 다시 올리지 않게 한다.

## 0.6.0 → 0.7.0 에서 바뀐 것

- **6×6 스케일-매칭 구제**(`redo --rescue` · `calibrate`): 본 격자 다시 쓰기 뒤에도 남는 드문 글자를 6×6 장에 이미 통과한 본문 글자(앵커)와 같이 그리고, 앵커로 크기 · 장평 · 획 굵기를 재서 본문에 맞춘다(크리스털 명조 12×12 에서 남은 61자를 모두 회수 — TTF 높이 오차 0.00%).
- **프롬프트 대조**(`verify-prompt`): 보내기 전(행 · 손글씨 낱말 · 자모 풀이 · 참조 그림 sha256)과 보낸 뒤(`--echo` — 서버가 받은 프롬프트와 칸마다)를 스크립트로 본다.
- **정밀 검수**: `compare --band`(720px 단독 확대 + 가운데 모음 띠 4배) · `errors.json` 의 `"pick"`(여러 후보 가운데 쓸 칸).
- **보정 글자**(`override`): 여러 라운드 실패한 드문 한두 자만, 사용자 동의를 받고 이미 통과한 글자의 요소로 조합해 **사람이 검수 페이지를 보고 통과시킨 것만** 넣는다.
- 활자 명조의 굵게는 `bold --units 8 · 10` 도 견주어 고르고, 검수 · 미리 보기 페이지는 브라우저로 연다.

MIT License.
