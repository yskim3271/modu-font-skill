# B. OpenAI API 키 (유료)

`node scripts/hf.mjs openai <dir>` 가 `jobs/<장>/` 묶음을 OpenAI 이미지 편집 API(`POST /v1/images/edits`, 참조 그림 여러 장 `image[]` + 프롬프트)로 보내 `inbox/<장>.png` 로 저장한다.

## 준비
- 사용자가 **자기 터미널에서** `OPENAI_API_KEY` 환경 변수를 넣는다. 에이전트는 키 값을 묻거나, 받거나, 출력하지 않는다.
- 모델·크기·화질은 `font.json` 의 `openai`(`model`·`size`·`quality`) 또는 `--model --size --quality`. 기본값(`gpt-image-2`, `2048x2048`, `high`)은 OpenAI 문서의 최신 이미지 모델 기준이며 계정에서 쓸 수 있는지는 첫 장으로 확인한다.
- 장당 값은 `font.json` 의 `price_usd`(기본 0.42 = 우리가 GPT Image 2.6 2K 최고 화질로 실제 낸 값). OpenAI 가격표의 값이 다르면 `estimate <dir> --price <그 값>` 을 한 번 돌린다 — `font.json` 에 적혀 그 뒤의 견적(`estimate` · `grid --down`)과 `check` · `openai` 가 그 값을 쓴다.

## 순서 (지킨다)
1. `jobs <dir> s01` → `openai <dir> s01 --dry-run` 으로 보낼 내용·어림 값을 사용자에게 보여 준다.
2. `estimate <dir> s01` 의 금액으로 사용자 "예" → `approve <dir> --note "<사용자가 한 말>"`(금액은 넣지 않는다). 말할 때 따로 덧붙인다: 첫 장이 떨어지면 같은 격자로 한 번 더 = 한 장 값, 다시 쓰기 장은 보통 한두 장.
3. `openai <dir> s01` → `cut` → 사용자와 첫 장 확인. 한국어 장은 `cut` 이 장 검사를 하고 `→ 다음:` 으로 할 일을 말한다:
   - 통과("됨") → 4번으로.
   - 떨어짐("일부"도 — 종료 코드 2 · `경고:`), 1번째 → 사용자에게 한 줄로 알리고(한 장 값이 더 든다) `retry <dir> s01` → `jobs <dir> s01` → `openai <dir> s01`. 다시 보낼 때 장부에 새 줄이 생긴다(시도 번호 · 키가 다르다 — `openai <dir> s01 --dry-run` 으로 보낼 장 · 시도 · 키를 미리 본다).
   - 떨어짐, 2번째(장 검사에 떨어진 그림 수로 센다) → `grid <dir> --down`(한 단계 낮춤 — 새 장 수 · 견적이 나온다) → 사용자 "예" → `approve <dir> --note "<사용자가 한 말>"` → `jobs <dir> s01` → `openai <dir> s01`. **격자를 낮춘 뒤 새 `approve` 가 없으면 스크립트가 멈춘다.**
4. 나머지: `jobs <dir>`(첫 장을 형식 참조로 나머지 묶음) → `estimate <dir>` → 사용자 "예" → `approve <dir> --note "<사용자가 한 말>"` → `openai <dir>` → 받은 장마다 `cut`. `redo` 로 만든 다시 쓰기 장도 그리기 전에 `estimate` 로 장 수와 값을 말한다.

## 스크립트가 지키는 것
- 승인 기록(`ledger.json`)이 없으면 첫 장 앞에서 멈춘다(받은 장은 다시 돌려도 건너뛴다). 금액 한도는 없다.
- 첫 장 통과 전(`style/format.png` 없음)에는 승인이 있어도 첫 장만 보낸다 — `jobs --all` 로 묶어 둔 다른 한국어 장(본문 · 부호 · 다시 쓰기)은 보내지 않는다(영문 장 · 시안은 따로).
- 보내기 전에 장부에 `sent` 를 적는다. 응답 없이 끊긴 장은 다시 돌리면 멈추고 묻는다 — 사용자가 OpenAI 사용 내역을 확인한 뒤 `--retry`.
- `--retry`(끊긴 요청을 다시 보냄)와 `retry` 명령(받은 그림을 치우고 다시 받음)은 다른 것이다. `retry` 명령 뒤에는 받은 그림이 없으니 `openai` 가 그 장을 다시 보내고, 장부에는 보낼 때마다 한 줄씩 `job`(키) · `grid` · `attempt` 와 함께 적힌다.
- 격자가 바뀐 뒤(`grid --down`) 새 승인이 없으면 첫 장 앞에서 멈춘다.
- 실패 응답은 0원으로 적고 오류 문구를 보여 준다.
- 장부의 금액은 `price_usd` 로 적은 어림값이다. 실제 청구액은 OpenAI 사용 내역이 정답이다.
