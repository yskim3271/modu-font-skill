<p align="center"><b>English</b> · <a href="README.ko.md">한국어</a> · <a href="README.ja.md">日本語</a></p>

<p align="center"><img src="docs/images/hero.en.png" alt="Reference image → sheets written by generative AI → finished font (Regular and Bold)" width="900"></p>

# modu-font

An agent skill for Claude Code and Codex that turns the lettering style in one reference image into a real, installable TrueType font. Ask *"turn this handwriting into a font"*: an image model writes every character in that style, cell by cell, on 6×6 sheets; the skill cuts the cells, has the agent and you check each one, traces the outlines and builds Regular and Bold TTFs.

## Download the fonts: Modu Dunggeul Pen

The first fonts made with this skill, free under the SIL Open Font License 1.1.

**[Download ModuDunggeulPen-1.100.zip](https://github.com/yskim3271/modu-font-skill/releases/download/fonts-v1.100/ModuDunggeulPen-1.100.zip)** (4 MB) · [Release notes](https://github.com/yskim3271/modu-font-skill/releases/tag/fonts-v1.100)

| File | Covers |
|---|---|
| `ModuDunggeulPen-Regular.ttf` · `-Bold.ttf` | Korean (2,338 of the 2,350 KS X 1001 Hangul syllables), Latin, digits, punctuation |
| `ModuDunggeulPenJP-Regular.ttf` · `-Bold.ttf` | Japanese (kana, the 2,136 Joyo kanji, vertical forms), Latin, digits, punctuation |

Install: on Windows, right-click the `.ttf` files and choose **Install**; on macOS, double-click and choose **Install Font**.

## How it works

| | Step | Command |
|---|---|---|
| ① | Pick the reference image (a photo of lettering you like, or one of four AI drafts) and the character set | `init` (`drafts` → `pick`) |
| ② | Bundle each sheet: the reference, the sheet format and a prompt listing its 36 characters | `jobs` |
| ③ | An image model writes the sheet. **The first sheet is checked with you before the rest are drawn**, and it becomes the format reference for the others | OpenAI key or the agent's image tool |
| ④ | Find the light-blue grid, cut the 36 cells and make a review page | `cut` |
| ⑤ | The agent compares every cell with the character it should be and proposes errors; you confirm them on the page. Wrong characters go on correction sheets | `review` · `redo` |
| ⑥ | Trace the ink into outlines and build the font, then a Bold weight from the same drawings | `glyphs` → `build_font.py` → `bold` |

The model does make mistakes on rare characters (in the 2,350-character Korean run, 63 of 1,872 cells were wrong on the first try), so the review step is never skipped.

## Modes

| Mode | Characters | Docs |
|---|---|---|
| Korean (default) | Hangul, 500 or all 2,350 of KS X 1001, plus punctuation, chat jamo and digits | [korean.md](skills/modu-font/references/korean.md) |
| Japanese | kana + a kanji list (the 2,136 Joyo kanji, or JIS level 1/2), vertical forms built automatically | [japanese.md](skills/modu-font/references/japanese.md) |
| Add Latin | A–Z, a–z and ASCII punctuation on 3 sheets with guide lines; baseline alignment, spacing and kerning at build time. Works on Korean and Japanese fonts | [latin.md](skills/modu-font/references/latin.md) |

## Drawing and cost

Images are generated with either an **OpenAI API key** (`hf.mjs openai`) or **the agent's own image tool** (Codex's built-in tool, an image MCP server). Either way the skill shows an estimate first, records your approval and a spending cap in `ledger.json`, and stops at the cap.

Measured with GPT Image 2.6 at 2K, about $0.42 per sheet:

| Target | Sheets | Cost |
|---|---|---|
| Korean, 500 characters + punctuation | 15 | about $6 |
| Korean, all 2,350 + punctuation | 67 + a few corrections | about $30 |
| Japanese, 2,136 Joyo kanji + kana + punctuation | 69 (measured) | $30.22 |
| Add Latin | 3 (measured, no corrections) | $1.29 |

## Install

Requirements: Node 18.17+ and Python 3.

**Claude Code plugin**
```
/plugin marketplace add yskim3271/modu-font-skill
/plugin install modu-font@modu-font-skill
```

**By hand**: copy `skills/modu-font` to `~/.claude/skills/modu-font` (Claude Code) or `~/.agents/skills/modu-font` (Codex).

Then, once, inside the skill folder (for the plugin it is `~/.claude/plugins/cache/modu-font-skill/modu-font/<version>/skills/modu-font`; if you skip this, the skill stops with a message and your agent can run it there after asking you):
```sh
npm install                      # sharp
pip install -r requirements.txt  # fontTools
```

Then ask your agent: *"turn the handwriting in this image into a font"*. The skill asks a few short questions first (reference, character count, how to draw, font name, whether to add Latin), and nothing that costs money runs before you approve it. Full rules: [SKILL.md](skills/modu-font/SKILL.md) · commands: [commands.md](skills/modu-font/references/commands.md). The skill's own instructions and references are written in Korean; agents follow them in any language.

## License

- Skill code: [MIT](LICENSE)
- Fonts: [SIL Open Font License 1.1](fonts/OFL.txt). Use, modify and redistribute them freely; just don't sell the fonts by themselves.
- Fonts you make are yours to license, but check the terms of the image service you used for commercial use of its output.
