// ตั้งค่า pm2 สำหรับรันสะสมดาวบนเซิร์ฟเวอร์ (Raspberry Pi)
//   pm2 start ecosystem.config.cjs    เริ่มรัน
//   pm2 restart star-collection       รีสตาร์ทหลังอัปเดตโค้ด/.env
//   pm2 save                          จำไว้ให้สตาร์ทเองตอนเปิดเครื่อง
// ค่าของแอป (API_PORT, DB_PATH ฯลฯ) อ่านจาก server/.env

module.exports = {
  apps: [
    {
      name: 'star-collection',
      script: 'index.js',
      cwd: './server',
      instances: 1, // SQLite เขียนพร้อมกันหลาย process ไม่ได้
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      max_memory_restart: '200M',
      output: './logs/out.log',
      error: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      watch: false,
    },
  ],
};
