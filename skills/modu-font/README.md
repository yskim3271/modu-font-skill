# 모두의 폰트 스킬 (modu-font-skill)

참고 이미지 한 장의 글씨체로 한글·일본어 TrueType 폰트(보통·굵게, 같은 글씨체의 영문 선택)를 만드는 에이전트 스킬. 이미지 생성 모델이 6×6 격자에 한 칸 한 글자씩 쓰고, 스크립트가 칸을 잘라 사람이 확인한 뒤 윤곽을 따서 조립한다. 처음 만든 폰트: "모두의 둥글펜"(KS X 1001 한글 2,338/2,350자).

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

둘 다 견적 → 사용자 승인 → 상한(`ledger.json`) 안에서만 돈다. 자세한 규칙은 `SKILL.md`.

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
node scripts/hf.mjs jobs my-font          # jobs/s01/ … 묶음
# B: estimate → approve → openai  /  C: SKILL.md 의 C 절 (에이전트가 그려 my-font/inbox/s01.png 로)
node scripts/hf.mjs cut my-font           # review/index.html 에서 틀린 칸 고르기 → errors.json
node scripts/hf.mjs redo my-font && node scripts/hf.mjs jobs my-font   # 틀린 글자 다시
node scripts/hf.mjs glyphs my-font && python scripts/build_font.py my-font
node scripts/hf.mjs bold my-font && python scripts/build_font.py my-font --bold
```

## 비용 어림 (GPT Image 2.6 · 2K · 장당 약 $0.42 실측)

| 목표 | 장 | 비용 |
|---|---|---|
| 말풍선용 500자 + 부호 | 15 | 약 $6 |
| KS X 1001 2,350자 + 부호 | 67 + 다시 쓰기 몇 장 | 약 $30 |
| 일본어 상용한자 2,136자 + 가나 + 부호 | 69(실측, 견본·다시 쓰기 포함) | $30.22 |
| 영문 더하기(대소문자 + ASCII 부호) | 3 + 다시 쓰기 | 약 $1.3 |

## 알아 둘 것

- 정확도는 GPT Image 2.6 으로만 쟀다. 드문 글자는 3% 쯤 틀려서 검수는 빼면 안 된다.
- 영문은 `--latin`(이미 만든 폴더는 `latin <dir>`) — 기준선·x-높이 맞춤과 커닝이 들어간다(`references/latin.md`). 일본어 폰트에는 세로쓰기(세로용 부호 모양·vert)가 들어간다(`references/japanese.md`).
- 만든 폰트를 배포하려면 쓴 생성 서비스의 출력물 약관을 확인한다.

MIT License.
