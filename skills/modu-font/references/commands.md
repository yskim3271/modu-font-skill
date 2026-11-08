모두의 폰트 스킬(modu-font) — node scripts/hf.mjs <명령> <작업 폴더> [옵션]

  init <dir> [--script ko] [--sample 견본.png] [--family-en "My Hand"] [--family-ko "내 손글씨"] [--style "<영어 글씨 설명>"] [--count 2350] [--price 0.42]   한국어(기본, references/korean.md)
  init <dir> --script ja [--family-ja "わたしの手書き"] [--chars 한자.txt | --set jis1|jis12] [--count <한자 수>] [--kana no] …   일본어(references/japanese.md)
  init <dir> … --latin [--base <glyphs.json> [--base-bold <glyphs-bold.json>]]   영문 3장 더하기 · 다른 폴더에서 만든 글자 그림을 바탕으로(references/latin.md)
  latin <dir> [--from <다른 작업 폴더>] [--force]   이미 있는 작업 폴더에 영문 3장(L1~L3)을 더한다 · --from 이면 그 폴더에서 받은 영문 장·검수를 옮긴다
  drafts <dir>                  AI 시안 4개(2×2)를 그릴 묶음 jobs/drafts — 받은 그림은 inbox/drafts.png
  drafts <dir> --base a.png[,b.png]   이미 있는 손글씨(다른 글자 체계도)로 같은 사람의 견본 한 장 — 받은 뒤 pick --whole
  pick <dir> --quad 1~4 | --whole [--style "..."]   시안 사분면(또는 통째로)을 style/sample.png 로
  plan <dir>                    font.json count 로 장 목록 sheets.json 을 다시 만든다(redo 장은 남김)
  jobs <dir> [장…] [--all]      안 받은 장마다 jobs/<장>/ (ref-1 견본, ref-2 형식, [ref-3 활자], prompt.txt, job.json)
                                첫 장 확인(style/format.png) 전에는 첫 한글 장 하나만, 영문은 style/latin-format.png 전에는 L1 하나만 — --all 이면 전부
  status <dir>                  장별 받음·자름, 글자 수, 쓴 돈
  estimate <dir> [--price X] [장…]   남은 장 × 장당 값
  approve <dir> --cap <USD> | --sheets <장 수>  --note "<사용자가 한 말>"   사용자가 승인한 상한(누적, 이력은 ledger.json approvals)
  check <dir> [--usd X]         상한 안이면 0, 넘거나 승인 기록이 없으면 1 로 끝난다(에이전트가 한 장 그리기 전마다)
  spend <dir> --sheet <장> --usd <값≥0> [--backend codex|mcp|agent] [--job <id>]   보내기 직전에 기록(같은 --job 은 한 번만)
  openai <dir> [장…] [--dry-run] [--model gpt-image-2] [--size 2048x2048] [--quality high] [--retry]
                                B 백엔드. OPENAI_API_KEY 환경 변수, 상한 안에서만, 받은 장은 건너뜀, 첫 장 확인 전엔 한 장만
  cut <dir> [장…] [--all]        inbox/<장>.png → cells/<장>/, review/<장>.png, review/index.html
                                격자 못 찾음·정사각 아님·1,500px 미만·빈 칸이면 "경고:" + 종료 코드 2
  review <dir>                  review/index.html 만 다시(errors.json 을 고친 뒤 꼭)
  redo <dir> [--print] [--replace]   아직 없는 본문 글자로 다시 쓰기 장 rNN, 빠진 부호는 부호 다시 쓰기 장, 빠진 영문은 영문 다시 쓰기 장(안 받은 rNN 이 있으면 멈춤, --replace 면 버리고 새로)
  compare <dir> <장>:<칸> …      의심 칸을 크게 + 그 장의 활자 참조(ref-3) 칸 → review/compare.png
  preview <dir> [--text "줄1|줄2"]   조립한 폰트로 out/preview.html(가로 보통·굵게, 일본어는 세로쓰기도) — 브라우저로 연다
  glyphs <dir>                  받은 칸 → glyphs/ + glyphs.json
  bold <dir> [--units 14]       굵은 판 글자 그림 → glyphs-bold.json

  python scripts/build_font.py <dir> [--bold] [--only 가나다]   → out/<PS>-Regular.ttf / -Bold.ttf(일본어는 세로쓰기 표·vert 포함)
  node scripts/kanji-list.mjs <kanji.json> <out.txt> [--set joyo|kyoiku] [--first 파일]   일본어 한자 목록(빈도순, references/japanese.md)
  pwsh -File scripts/install-windows.ps1 <ttf> "<이름> Regular (TrueType)"   ·   sh scripts/install-unix.sh <ttf>...
