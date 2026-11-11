// ใส่ธีมที่เครื่องนี้เลือกไว้ก่อนหน้าเว็บวาด (ไม่งั้นโหมดมืดจะกะพริบเป็นสีขาวตอนเปิด) — ดู src/lib/theme.js
try {
  if (localStorage.getItem('stars-theme') === 'minimal') {
    var saved = localStorage.getItem('stars-mode');
    var dark = saved === 'dark' || (saved !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = 'minimal';
    document.documentElement.dataset.mode = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#0f0f0f' : '#fafafa');
  }
} catch (e) {
  // เบราว์เซอร์ไม่ให้อ่าน — ใช้ธีมปกติ
}
