#!/bin/sh
# 글꼴 파일을 이 사용자에게만 설치한다: macOS ~/Library/Fonts, Linux ~/.local/share/fonts (+ fc-cache).
# sh scripts/install-unix.sh out/MyHand-Regular.ttf out/MyHand-Bold.ttf
set -eu
[ "$#" -ge 1 ] || { echo "사용: install-unix.sh <ttf>..." >&2; exit 1; }
case "$(uname -s)" in
  Darwin) dest="$HOME/Library/Fonts" ;;
  *) dest="${XDG_DATA_HOME:-$HOME/.local/share}/fonts" ;;
esac
mkdir -p "$dest"
for f in "$@"; do cp -f "$f" "$dest/"; echo "copied $(basename "$f") → $dest"; done
if command -v fc-cache >/dev/null 2>&1; then fc-cache -f "$dest" >/dev/null && echo "fc-cache ok"; fi
