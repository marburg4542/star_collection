#!/usr/bin/env bash
# อัปเดตอัตโนมัติหลัง push: cron บน Pi เรียกทุก 2 นาที — GitHub มีโค้ดใหม่ก็สั่ง deploy.sh · ไม่มีก็จบเงียบๆ
#   ติดตั้ง (ครั้งเดียว):  (crontab -l; echo '*/2 * * * * bash $HOME/star_collection/deploy/pi/auto-deploy.sh') | crontab -
#   ดูผล:               tail -n 40 ~/star_collection/server/logs/deploy.log
# รุ่นที่อัปเดตไม่ผ่าน (ถอยกลับแล้ว) จะไม่ลองซ้ำจนกว่าจะมี push ใหม่
set -uo pipefail
cd "$(dirname "$0")/../.."

LOG=server/logs/deploy.log
FAILED="$HOME/.cache/stars-deploy-failed"
mkdir -p server/logs "$(dirname "$FAILED")"

git fetch -q origin main || exit 0
target=$(git rev-parse FETCH_HEAD)
[ "$(git rev-parse HEAD)" = "$target" ] && exit 0
[ "$(cat "$FAILED" 2>/dev/null)" = "$target" ] && exit 0

{
  echo
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') อัปเดตอัตโนมัติ $(git rev-parse --short HEAD) → $(git rev-parse --short "$target")"
  if bash deploy/pi/deploy.sh; then rm -f "$FAILED"; else echo "$target" > "$FAILED"; fi
} >> "$LOG" 2>&1

if [ "$(wc -l < "$LOG")" -gt 3000 ]; then tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; fi
