#!/bin/bash
DATE=$(date +%Y-%m-%d)
NOTE_PATH=~/obsidian-vault/$DATE.md

# ノートが存在しなければヘッダー作成
if [ ! -f "$NOTE_PATH" ]; then
  echo "# $DATE の作業記録" > $NOTE_PATH
  echo "" >> $NOTE_PATH
fi

# 内容を追記
echo "" >> $NOTE_PATH
echo "## $(date +%H:%M) - $1" >> $NOTE_PATH
echo "$2" >> $NOTE_PATH
echo "" >> $NOTE_PATH
