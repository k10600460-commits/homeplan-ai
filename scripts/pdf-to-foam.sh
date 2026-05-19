#!/bin/bash
# AI関連フォルダのPDFをFoamに自動取り込み
PDF_DIR="/Users/Shoji.S/Downloads/AI関連"
DATE=$(date +%Y-%m-%d)
NOTE_PATH=~/obsidian-vault/pdf-index.md

# インデックスファイル初期化
if [ ! -f "$NOTE_PATH" ]; then
  echo "# AI関連 PDFインデックス" > $NOTE_PATH
  echo "" >> $NOTE_PATH
fi

echo "" >> $NOTE_PATH
echo "## $DATE 取り込み" >> $NOTE_PATH

# PDFファイル一覧を記録
for pdf in "$PDF_DIR"/*.pdf; do
  filename=$(basename "$pdf")
  echo "- [[$filename]]" >> $NOTE_PATH
  echo "  - パス: $pdf" >> $NOTE_PATH
done

echo "✅ 取り込み完了"
cat $NOTE_PATH
