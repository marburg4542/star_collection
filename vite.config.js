import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    host: true, // เปิดรับเครื่องอื่นในวง LAN (ลองบนมือถือระหว่างพัฒนา)
    proxy: {
      // 127.0.0.1 แทน localhost — บน Windows localhost อาจชี้ไป ::1 ซึ่งเซิร์ฟเวอร์ไม่ได้ฟังอยู่
      '/api': { target: 'http://127.0.0.1:5100', changeOrigin: true },
    },
  },
});
