#!/usr/bin/env bash
# อัปเดตสะสมดาวบน Pi เป็นโค้ดล่าสุดจาก GitHub — ปกติ auto-deploy.sh (cron ทุก 2 นาที) เรียกเองหลัง push
#   สั่งเองบน Pi:      bash ~/star_collection/deploy/pi/deploy.sh
#   สั่งจากโน้ตบุ๊ก:    ssh marburg@server.local "bash star_collection/deploy/pi/deploy.sh"
# ขั้นตอน: สำรอง → ดึงโค้ด → build ลงโฟลเดอร์ใหม่ → สลับ → รีสตาร์ท → ตรวจ
# พังกลางทาง = ถอยกลับเป็นรุ่นเดิมเอง (หน้าเว็บ dist/ ไม่ถูกทับจนกว่า build จะผ่าน)
set -euo pipefail
cd "$(dirname "$0")/../.."

exec 9>/tmp/stars-deploy.lock
flock -n 9 || { echo "มีการอัปเดตอื่นกำลังทำอยู่ — ข้าม"; exit 0; }

env_value() { grep -E "^$1=" server/.env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"\r'; }
PORT=$(env_value API_PORT); PORT=${PORT:-5100}
SITE=$(env_value APP_URL)

before=$(git rev-parse HEAD)
deps_changed=0
swapped=0

rollback() {
  trap - ERR
  echo "❌ อัปเดตไม่สำเร็จ — ถอยกลับเป็น $(git rev-parse --short "$before") (แอปยังเปิดด้วยรุ่นเดิม)"
  git reset -q --hard "$before"
  rm -rf dist-next
  if [ "$deps_changed" = 1 ]; then npm ci --silent || true; npm --prefix server ci --omit=dev --silent || true; fi
  if [ "$swapped" = 1 ]; then
    rm -rf dist && mv dist-prev dist
    pm2 restart star-collection --update-env >/dev/null || true
  fi
  exit 1
}
trap rollback ERR

echo "== สำรองข้อมูลก่อนอัปเดต"
node server/tools/backup-now.mjs

echo "== ดึงโค้ด"
git pull --ff-only
git --no-pager log --oneline "$before..HEAD"

if ! git diff --quiet "$before" HEAD -- package-lock.json server/package-lock.json; then
  deps_changed=1
  git diff --quiet "$before" HEAD -- package-lock.json || npm ci
  git diff --quiet "$before" HEAD -- server/package-lock.json || npm --prefix server ci --omit=dev
fi

echo "== build"
npx vite build --outDir dist-next --emptyOutDir --logLevel warn

echo "== สลับหน้าเว็บ + รีสตาร์ท"
rm -rf dist-prev
mv dist dist-prev
mv dist-next dist
swapped=1
pm2 restart star-collection --update-env >/dev/null

echo "== ตรวจ"
for _ in $(seq 1 15); do curl -fsS -o /dev/null "http://127.0.0.1:$PORT/api/status" && break; sleep 1; done
curl -fsS -o /dev/null "http://127.0.0.1:$PORT/api/status"
echo "API ตอบปกติ"
trap - ERR

# ให้ Cloudflare เก็บไฟล์ชุดใหม่ไว้ก่อน เครื่องแรกที่เปิดจะได้ไม่ต้องรอไฟล์ใหญ่วิ่งผ่าน tunnel
if [ -n "$SITE" ]; then
  for f in dist/assets/*.js dist/assets/*.css; do curl -s -o /dev/null -H 'Accept-Encoding: br' "$SITE/assets/$(basename "$f")" || true; done
  built=$(grep -o 'assets/index-[^"]*\.js' dist/index.html | head -1)
  live=$(curl -s "$SITE/" | grep -o 'assets/index-[^"]*\.js' | head -1 || true)
  if [ "$live" = "$built" ]; then echo "เว็บจริงใช้ไฟล์ชุดใหม่แล้ว ($built)"; else echo "⚠️ เว็บจริงยังเป็น '${live}' (build ได้ $built)"; fi
fi
echo "✅ อัปเดตเสร็จ: $(git --no-pager log --oneline -1)"
