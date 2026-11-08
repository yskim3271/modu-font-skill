<p align="center"><a href="README.md">English</a> · <a href="README.ko.md">한국어</a> · <b>日本語</b></p>

<p align="center"><img src="docs/images/hero.ja.png" alt="参考画像 → 生成AIが書いたシート → 完成したフォント(Regular・Bold)" width="900"></p>

# modu-font

参考画像1枚の書体を、実際にインストールして使える TrueType フォントにする Claude Code・Codex 用のエージェントスキル。*「この書体でフォントを作って」* と頼むと、画像生成モデルが 6×6 のマスに1マス1文字ずつその書体で書き、スキルがマスを切り出してエージェントと人が1つずつ確認したあと、輪郭をなぞって Regular・Bold の TTF に組み立てます。

## フォントのダウンロード: モドゥ丸ペン

このスキルで最初に作ったフォント。SIL Open Font License 1.1 で無料です。

**[ModuDunggeulPen-1.100.zip をダウンロード](https://github.com/yskim3271/modu-font-skill/releases/download/fonts-v1.100/ModuDunggeulPen-1.100.zip)**(4 MB)· [リリースノート](https://github.com/yskim3271/modu-font-skill/releases/tag/fonts-v1.100)

| ファイル | 収録文字 |
|---|---|
| `ModuDunggeulPenJP-Regular.ttf` · `-Bold.ttf` | 日本語(かな、常用漢字 2,136 字、縦書き)、英字、数字、記号 |
| `ModuDunggeulPen-Regular.ttf` · `-Bold.ttf` | 韓国語(ハングル)、英字、数字、記号 |

インストール: Windows は `.ttf` を右クリックして **インストール**、macOS はダブルクリックして **フォントをインストール**。

## 作り方の流れ

| | 手順 | コマンド |
|---|---|---|
| ① | 参考画像(好きな文字の写真、または AI の試案4つから1つ)と文字数を決める | `init` (`drafts` → `pick`) |
| ② | シートごとに、見本・シート形式・そのシートの36字を書いたプロンプトをまとめる | `jobs` |
| ③ | 画像モデルがシートを書く。**最初の1枚はユーザーと確認してから**残りを描き、その1枚が以降のシートの形式見本になる | OpenAI キーまたはエージェントの画像ツール |
| ④ | 水色の格子を見つけて36マスを切り出し、確認ページを作る | `cut` |
| ⑤ | エージェントが各マスを書くべき文字と照らし合わせて間違いを提案し、ユーザーがページで確認する。間違った文字は書き直しシートへ | `review` · `redo` |
| ⑥ | インクを輪郭にしてフォントを組み立て、同じ絵から Bold を作る | `glyphs` → `build_font.py` → `bold` |

モデルはまれな文字で間違えることがあるため(韓国語 2,350 字の初回は 1,872 マス中 63 マス)、確認の手順は省きません。日本語版は 69 シートで初回の間違いが1マス(★ を ☆ と描いた)だけでした。

## モード

| モード | 文字 | 説明 |
|---|---|---|
| 日本語 | かな + 漢字リスト(常用漢字 2,136 字、JIS 第1・第2水準)、縦書き用の字形は組み立て時に自動 | [japanese.md](skills/modu-font/references/japanese.md) |
| 韓国語(既定) | ハングル 500 字または KS X 1001 の 2,350 字すべて + 記号・数字 | [korean.md](skills/modu-font/references/korean.md) |
| 英字の追加 | 大文字・小文字と ASCII 記号を、ガイド線入りの3シートに。組み立て時にベースライン合わせ・字間・カーニング。日本語・韓国語どちらのフォントにも | [latin.md](skills/modu-font/references/latin.md) |

各モードの詳しい説明(references)は韓国語で書かれています。

## 描き方と費用

画像は **OpenAI API キー**(`hf.mjs openai`)または **エージェント自身の画像ツール**(Codex の内蔵ツール、画像 MCP サーバー)で生成します。どちらも先に見積もりを出し、ユーザーの承認と上限額を `ledger.json` に記録して、上限で止まります。

GPT Image 2.6・2K の実測で1シート約 $0.42:

| 目標 | シート | 費用 |
|---|---|---|
| 常用漢字 2,136 字 + かな + 記号 | 69(実測) | $30.22 |
| 韓国語 2,350 字 + 記号 | 67 + 書き直し数枚 | 約 $30 |
| 英字の追加 | 3(実測、書き直しなし) | $1.29 |

## インストール

必要なもの: Node 18.17 以上、Python 3。

**Claude Code プラグイン**
```
/plugin marketplace add yskim3271/modu-font-skill
/plugin install modu-font@modu-font-skill
```

**手動**: `skills/modu-font` フォルダーを `~/.claude/skills/modu-font`(Claude Code)または `~/.agents/skills/modu-font`(Codex)にコピーします。

そのあとスキルフォルダーで一度だけ:
```sh
npm install                      # sharp
pip install -r requirements.txt  # fontTools
```

エージェントに *「この画像の書体でフォントを作って」* と頼めば始まります。スキルは最初にいくつか(見本、文字数、描き方、フォント名、英字の有無)を確認し、費用がかかる処理は承認前に実行しません。全体のルール: [SKILL.md](skills/modu-font/SKILL.md) · コマンド: [commands.md](skills/modu-font/references/commands.md)。

## ライセンス

- スキルのコード: [MIT](LICENSE)
- フォント: [SIL Open Font License 1.1](fonts/OFL.txt)。自由に使用・改変・再配布できます。フォント単体での販売はできません。
- 自分で作ったフォントのライセンスは作った人が決めます。ただし使った画像サービスの、生成物の商用利用に関する規約は確認してください。
