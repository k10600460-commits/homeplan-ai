#!/bin/bash
# Downloads NotoSansCJK-Regular.ttf for ZH PDF generation
# Run once: bash scripts/download-cjk-font.sh

set -e
DEST="public/fonts/NotoSansCJK-Regular.ttf"
mkdir -p public/fonts

echo "Downloading Noto Sans CJK SC Regular (~8MB)..."
curl -L -o "$DEST" \
  "https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf" \
  2>/dev/null || \
curl -L -o "$DEST" \
  "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf" \
  2>/dev/null

if [ -f "$DEST" ]; then
  echo "Font saved to $DEST ($(du -sh "$DEST" | cut -f1))"
else
  echo "ERROR: Download failed. Place NotoSansCJK-Regular.ttf manually at $DEST"
  exit 1
fi
