# ⭐ สะสมดาว

เว็บแอป (PWA) สะสมดาวสำหรับเด็กๆ ในบ้าน — ทำดีได้ดาว ทำผิดโดนหักดาว เอาดาวไปแลกของรางวัล

- **เด็ก**: แตะชื่อตัวเอง → ดูดาว, ประวัติ, กดขอแลกของรางวัล, เปิดแจ้งเตือนของตัวเอง
- **ผู้ปกครอง** (PIN 4 หลัก): ให้/หักดาว (เลือกหลายคนพร้อมกันได้, กดผิดยกเลิกได้), อนุมัติคำขอแลก, แลกให้เลย, แก้รายการทำดี/ความผิด/ของรางวัล, เปลี่ยน PIN/รหัสครอบครัว
- **แท่นจัดอันดับ**: สลับดูได้ระหว่าง "สะสมทั้งหมด" (ได้ − โดนหัก ไม่นับที่แลก) กับ "ดาวคงเหลือ"
- **รหัสครอบครัว**: ทุกเครื่องใส่ครั้งแรกครั้งเดียว คนนอกที่ไม่รู้รหัสเห็นแค่หน้าใส่รหัส
- ดาวติดลบได้ · คำขอที่รออนุมัติ "จอง" ดาวไว้ · หน้าจอเด็กอัปเดตสดเมื่อผู้ปกครองกด (SSE) · แจ้งเตือนเด้ง (Web Push)

## โครงสร้าง

| ส่วน | ที่อยู่ |
| --- | --- |
| หน้าเว็บ React + Vite + Tailwind | `src/` |
| service worker, manifest, ไอคอน | `public/` (สร้างไอคอนใหม่: `npm run icons`) |
| API Express + SQLite | `server/` (`app.js` = เส้นทาง API, `db.js` = ตาราง, `seed.js` = ตัวอย่างเริ่มต้น) |
| เทสต์ API | `server/test/` (`npm test`) |

## รันบนเครื่องพัฒนา

```bash
npm install
npm --prefix server install
cp server/.env.example server/.env   # แล้วแก้ DB_PATH เป็น data/stars.dev.sqlite
npm run dev:all                      # API :5100 + หน้าเว็บ :5180
```

เปิดครั้งแรกจะเจอหน้าตั้งค่า (รหัสครอบครัว + PIN) — ตั้งได้ครั้งเดียวต่อฐานข้อมูล

## บนเซิร์ฟเวอร์ (Raspberry Pi — `marburg@server.local`)

**อัปเดต = push ขึ้น `main`** แล้ว cron บน Pi (ทุก 2 นาที) จะสำรอง → ดึงโค้ด → build → สลับ → รีสตาร์ทเอง ถ้าพังจะถอยกลับรุ่นเดิม
ดูผล: `ssh marburg@server.local "tail -n 30 star_collection/server/logs/deploy.log"`

| อะไร | อยู่ที่ |
| --- | --- |
| โค้ด | `~/star_collection` (clone ผ่าน deploy key อ่านอย่างเดียว `~/.ssh/github_star_collection`, host alias `github-stars`) |
| แอป | pm2 `star-collection` พอร์ต 5100 (รับเฉพาะ 127.0.0.1) · log ที่ `server/logs/` |
| ฐานข้อมูล | `server/data/stars.sqlite` · สำรองรายวัน `server/data/backups/stars-*.sqlite` (30 วัน) + ก่อน deploy `pre-deploy-*.sqlite` (10 ชุด) |
| เว็บ | Cloudflare tunnel `server` → `stars.personal-proj.site` → `http://127.0.0.1:5100` |

ติดตั้งครั้งแรก (ทำไปแล้ว 2026-11-02 — เก็บไว้เผื่อย้ายเครื่อง):

1. สร้าง deploy key บน Pi แล้วเพิ่มใน GitHub (อ่านอย่างเดียว) + เพิ่มใน `~/.ssh/config`:
   `Host github-stars` / `HostName github.com` / `IdentityFile ~/.ssh/github_star_collection` / `IdentitiesOnly yes`
2. `git clone git@github-stars:marburg4542/star_collection.git ~/star_collection`
3. `npm ci && npm --prefix server ci --omit=dev && npx vite build && cp server/.env.example server/.env`
4. `pm2 start ecosystem.config.cjs && pm2 save`
5. ใส่ cron ตามหัวไฟล์ `deploy/pi/auto-deploy.sh`
6. Cloudflare dashboard → tunnel `server` → Public hostname `stars.personal-proj.site` → `http://127.0.0.1:5100`
7. เปิดเว็บ **ทันที** แล้วตั้งรหัสครอบครัว + PIN (ก่อนตั้ง ใครเปิดเจอก่อนก็ตั้งได้)
