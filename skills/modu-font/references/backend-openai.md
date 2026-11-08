# B. OpenAI API 키 (유료)

`node scripts/hf.mjs openai <dir>` 가 `jobs/<장>/` 묶음을 OpenAI 이미지 편집 API(`POST /v1/images/edits`, 참조 그림 여러 장 `image[]` + 프롬프트)로 보내 `inbox/<장>.png` 로 저장한다.

## 준비
- 사용자가 **자기 터미널에서** `OPENAI_API_KEY` 환경 변수를 넣는다. 에이전트는 키 값을 묻거나, 받거나, 출력하지 않는다.
- 모델·크기·화질은 `font.json` 의 `openai`(`model`·`size`·`quality`) 또는 `--model --size --quality`. 기본값(`gpt-image-2`, `2048x2048`, `high`)은 OpenAI 문서의 최신 이미지 모델 기준이며 계정에서 쓸 수 있는지는 첫 장으로 확인한다.
- 장당 값은 `font.json` 의 `price_usd`(기본 0.42 = 우리가 GPT Image 2.6 2K 최고 화질로 실제 낸 값). OpenAI 가격표로 바꿔 넣는다.

## 순서 (지킨다)
1. `jobs <dir> s01` → `openai <dir> s01 --dry-run` 으로 보낼 내용·어림 값을 사용자에게 보여 준다.
2. `estimate <dir> s01` 의 금액으로 사용자 "예" → `approve <dir> --cap <그 금액> --note "<사용자가 한 말>"`.
3. `openai <dir> s01` → `cut` → 사용자와 첫 장 확인.
4. 나머지: `jobs <dir>`(첫 장을 형식 참조로 나머지 묶음) → `estimate <dir>` → 사용자 "예" → `approve <dir> --cap <누적 금액 = 쓴 돈 + 견적> --note "<사용자가 한 말>"` → `openai <dir>`.

## 스크립트가 지키는 것
- 장마다 `ledger.json` 상한을 확인하고, 넘으면 그 장 앞에서 멈춘다(받은 장은 다시 돌려도 건너뛴다). 승인 기록이 없으면 첫 장 앞에서 멈춘다.
- 첫 장 확인 전(`style/format.png` 없음)에는 상한이 넉넉해도 한 장만 보낸다.
- 보내기 전에 장부에 `sent` 를 적는다. 응답 없이 끊긴 장은 다시 돌리면 멈추고 묻는다 — 사용자가 OpenAI 사용 내역을 확인한 뒤 `--retry`.
- 실패 응답은 0원으로 적고 오류 문구를 보여 준다.
- 장부의 금액은 `price_usd` 로 적은 어림값이다. 실제 청구액은 OpenAI 사용 내역이 정답이다.
