모두의 폰트 스킬(modu-font) — node scripts/hf.mjs <명령> <작업 폴더> [옵션]

  init <dir> [--script ko] [--kind hand|print] [--sample 견본.png] [--family-en "My Hand"] [--family-ko "내 손글씨"] [--style "<영어 글씨 설명>"] [--count 2350] [--price 0.42] [--grid 6|8|10|12|14]   한국어(기본, references/korean.md)
                                격자: --grid 를 안 주면 견본을 재서 정한다(획 굵기 ÷ 글자 높이 < 0.09 → 14, 그 밖 → 12 · 못 재면 12 · 견본이 아직 없으면 6). 견본 없이 만들면 pick 때, 견본을 손으로 style/sample.png 에 넣었으면 다음 jobs 때 잰다(기울어 있으면 되돌려서 잰다).
                                --price 는 font.json 에 적혀 그 뒤의 모든 견적 · check 가 쓴다. 일본어 모드에는 --grid 를 못 쓴다(6×6 고정)
                                --kind: 글씨 종류 hand(손글씨, 기본 — kind 가 없는 옛 폴더도 hand) · print(활자 — 명조 · 고딕 같은 인쇄 글씨). 프롬프트 · 시안의 말이 이것으로 갈린다
  style <dir> [--kind hand|print] [--style "<영어 설명>"]   글씨 종류 · 설명을 바꾼다(init 을 다시 부르지 않는다) — 옵션이 없으면 지금 값을 보여 준다. 바꾼 뒤 jobs 를 다시 돌리면 안 받은 장의 프롬프트가 새 문구
  init <dir> --script ja [--family-ja "わたしの手書き"] [--chars 한자.txt | --set jis1|jis12] [--count <한자 수>] [--kana no] …   일본어(references/japanese.md)
  init <dir> … --latin [--base <glyphs.json> [--base-bold <glyphs-bold.json>]]   영문 3장 더하기 · 다른 폴더에서 만든 글자 그림을 바탕으로(references/latin.md)
  latin <dir> [--from <다른 작업 폴더>] [--force]   이미 있는 작업 폴더에 영문 3장(L1~L3, 늘 6×6)을 더한다 · --from 이면 그 폴더에서 받은 영문 장·검수를 옮긴다
  drafts <dir> [--set hand|print] [--style "<설명>"]   AI 시안 4개(2×2)를 그릴 묶음 jobs/drafts — 받은 그림은 inbox/drafts.png
                                --set: 손글씨 네 가지(hand) · 활자 네 가지(print — 명조 둘 · 고딕 둘), 기본 = font.json 의 kind. --style 이면 그 설명을 네 갈래(그대로 · 가늘게 · 굵게 · 좁고 각지게)로
  drafts <dir> --base a.png[,b.png] [--set …]   이미 있는 견본(다른 글자 체계도)과 같은 글씨로 이 폰트의 견본 한 장 — 받은 뒤 pick --whole
  pick <dir> --quad 1~4 | --whole [--style "..."]   시안 사분면(또는 통째로)을 style/sample.png 로 — 격자가 아직 안 정해졌으면 이 견본을 재서 정한다. --quad 는 그 시안 묶음의 설명을 style 로, 묶음의 종류를 kind 로 적는다
  grid <dir>                    한국어 모드의 격자: 지금 격자 · 근거(견본에서 잰 값) · 첫 장의 시도 · 치운 그림 · 내려갈 차례
  grid <dir> --down [--price X]   한 단계 낮춘다(14 → 12 → 10 → 8 → 6): 받은 첫 장을 inbox/rejected/ 로 치우고 장 목록 · 빈 격자를 새 격자로 다시 만든다.
                                장 수가 바뀌어 새 견적을 낸다 — 그 견적을 말하고 새 approve 를 받기 전에는 check · spend · openai 가 멈춘다.
                                거절: 첫 장이 통과한 뒤 · 첫 장 말고 이 격자로 받은 한국어 장이 있을 때(한 폰트 한 격자 — 다른 격자는 새 작업 폴더) · 6 에서(견본이나 글씨 설명을 바꿔야 한다)
  grid <dir> --set <N> | --auto   첫 장이 통과하기 전 · 다른 장을 받기 전에만: 사용자가 정한다(6 · 8 · 10 · 12 · 14) | 견본을 다시 재서 정한다
  plan <dir>                    font.json 의 count · 격자로 장 목록 sheets.json 을 다시 만든다(redo 장은 남김)
  jobs <dir> [장…] [--all] [--format <장>]   안 받은 장마다 jobs/<장>/ (ref-1 견본, ref-2 형식, [ref-3 활자], prompt.txt, job.json — job.json 의 key 가 그 장을 보낼 때 쓸 키,
                                ref_sha256 이 참조 그림마다의 sha256 — 서버에 이미 올린 그림인지 맞춰 본다)
                                다시 쓰기 장의 ref-2 는 틀린 칸이 가장 적은 '됨' 본문 장(같으면 앞 장 · job.json 의 format_ref) — --format <장> 으로 고른다(받은 장 · 같은 격자)
                                첫 장 통과(style/format.png) 전에는 첫 한글 장 하나만, 영문은 style/latin-format.png 전에는 L1 하나만.
                                --all 이면 전부 묶지만 묶음만 미리 만드는 것이다 — 첫 장 통과 전에는 첫 장만 그린다(spend · openai 가 다른 한국어 장을 막는다).
                                첫 장을 받았는데 통과하지 못했으면(아직 안 잘랐거나 떨어졌거나) 다른 한국어 장을 묶지 않고 멈추며 먼저 할 일을 말한다
  status <dir>                  장별 받음·자름·격자·장 검사 판정·시도, 글자 수, 쓴 돈, 격자와 치운 그림(거기에 든 돈)
  estimate <dir> [--price X] [장…]   안 받은 장 × 장당 값 · 이미 쓴 돈(장부) · 격자 · 다시 받을 장 · 치운 그림에 든 돈 — 사용자에게 말할 견적
                                --price 는 font.json 에 적혀 그 뒤의 견적(estimate · grid --down) · openai 의 장부 값이 그 값을 쓴다(아무것도 올리거나 보내지 않는다)
  approve <dir> --note "<사용자가 한 말>"   견적을 들은 사용자가 승인했다는 기록(금액은 넣지 않는다, 이력은 ledger.json approvals).
                                예전 옵션 --cap <USD> · --sheets <장 수> 를 주면 "없어졌다 — 무시한다" 한 줄을 내고 승인만 적는다
  check <dir>                   승인 기록이 있으면 0, 없거나 격자가 바뀐 뒤 새 승인이 없으면 1 로 끝난다(에이전트가 한 장 그리기 전마다). 금액은 보지 않는다
  spend <dir> --sheet <장> --usd <값≥0> [--backend codex|mcp|agent] [--job <id>]   보내기 직전에 기록(같은 --job 은 한 번만). --job 에는 jobs/<장>/job.json 의 key 를 준다.
                                승인 기록이 없거나 격자가 바뀐 뒤 새 승인이 없으면 적지 않고 멈춘다
                                --backend: Codex 내장 도구 codex · 이미지 MCP 서버 mcp · 그 밖의 에이전트 도구 agent(기본). 첫 장 통과 전에 다른 한국어 장이면 적지 않고 멈춘다
  openai <dir> [장…] [--dry-run] [--model gpt-image-2] [--size 2048x2048] [--quality high] [--retry]
                                B 백엔드. OPENAI_API_KEY 환경 변수, 승인 기록이 있을 때만, 받은 장은 건너뜀, 첫 장 통과 전엔 첫 장만(다른 한국어 장은 보내지 않는다).
                                --retry 는 보내고 응답을 못 받은 요청을 다시 보내는 옵션이다(아래 retry 명령과 다르다)
  cut <dir> [장…] [--all]        inbox/<장>.png → cells/<장>/, review/<장>.png(6×6 보다 큰 격자는 쪽마다 review/<장>-p01.png …), review/index.html
                                한국어 본문 · 부호 · 다시 쓰기 장은 장 검사(됨 · 일부 · 안 됨)를 하고 찾은 선대로 자른다. 받은 장은 장마다 바로 자른다.
                                6×6 의 빈 칸은 그 칸만 빠진다(줄 판정에 안 넣는다 — 첫 장이면 통과가 아니라 retry, 그 뒤의 장이면 redo)
                                판정 · 못 쓰는 줄 · 다음 할 일(→ 다음:)은 화면과 cells/<장>/cells.json(check · next)에. 종료 코드는 다음 할 일에 맞춘다:
                                next 가 go(됨 — "ok") · redo(첫 장 통과 뒤 장의 일부 — "일부:")면 0, 그 밖(retry · down · ask · stop — 첫 장의 일부 · 안 됨 · 정사각 아님 · 1,500px 미만)은 "경고:" + 2
                                영문 장과 일본어 모드는 예전대로(격자 못 찾음·정사각 아님·1,500px 미만·빈 칸이면 "경고:" + 종료 코드 2)
  retry <dir> <장…>             받은 그림을 inbox/rejected/<장>-g<격자>-<시도>.png 로 치우고 그 장의 칸 · 검수 그림 · 묶음을 지운다 → jobs <dir> <장> 으로 다시 묶는다(시도 번호 · key 가 오른다).
                                치운 기록(ledger.json rejected)에 장 검사 판정이 남는다 — 격자 낮추기는 장 검사에 떨어진 첫 장 그림 수로 센다
  review <dir>                  review/index.html 만 다시(작업 폴더의 errors.json 을 고친 뒤 꼭). errors.json 에 {"r01": "*"} 처럼 장 이름에 "*" 면 그 장을 통째로 버린다
  redo <dir> [--print] [--replace]   아직 없는 목표 글자로 다시 쓰기 장 rNN(그 폰트의 격자), 빠진 부호는 부호 다시 쓰기 장, 빠진 영문은 영문 다시 쓰기 장(6×6)(안 받은 rNN 이 있으면 멈춤, --replace 면 버리고 새로).
                                새 견적(장 수 × 장당 값)을 내고 장부에 적는다 — 말하고 다시 approve 받기 전에는 check · spend · openai 가 멈춘다
  compare <dir> <장>:<칸> …      의심 칸을 크게 + 그 장의 활자 참조(ref-3) 칸 → review/compare.png. 칸 이름은 행열(0부터): 10×10 까지 "24", 11×11 부터 두 자리씩 "0213"
  preview <dir> [--text "줄1|줄2"]   조립한 폰트로 out/preview.html(가로 보통·굵게, 일본어는 세로쓰기도) — 브라우저로 연다
  glyphs <dir>                  받은 칸 → glyphs/ + glyphs.json
  bold <dir> [--units 14]       굵은 판 글자 그림 → glyphs-bold.json

  python scripts/build_font.py <dir> [--bold] [--only 가나다]   → out/<PS>-Regular.ttf / -Bold.ttf(일본어는 세로쓰기 표·vert 포함)
  node scripts/kanji-list.mjs <kanji.json> <out.txt> [--set joyo|kyoiku] [--first 파일]   일본어 한자 목록(빈도순, references/japanese.md)
  pwsh -File scripts/install-windows.ps1 <ttf> "<이름> Regular (TrueType)"   ·   sh scripts/install-unix.sh <ttf>...
