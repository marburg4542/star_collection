// ตัวอย่างเริ่มต้นตอนสร้างฐานข้อมูลครั้งแรก — ผู้ปกครองแก้/ลบ/เพิ่มได้ทั้งหมดในหน้าตั้งค่า

export const SEED_ACTIVITIES = [
  // ทำดี → ได้ดาว
  { kind: 'earn', emoji: '🧸', name: 'เก็บของเล่นเข้าที่', stars: 1 },
  { kind: 'earn', emoji: '🛏️', name: 'เก็บที่นอนเอง', stars: 1 },
  { kind: 'earn', emoji: '🪥', name: 'แปรงฟันเองเช้า-เย็น', stars: 1 },
  { kind: 'earn', emoji: '🥦', name: 'กินข้าวหมด ไม่เลือกกิน', stars: 1 },
  { kind: 'earn', emoji: '🍽️', name: 'ช่วยล้างจาน', stars: 2 },
  { kind: 'earn', emoji: '🧹', name: 'ช่วยกวาด/ถูบ้าน', stars: 2 },
  { kind: 'earn', emoji: '👕', name: 'ช่วยพับผ้า', stars: 2 },
  { kind: 'earn', emoji: '📚', name: 'ทำการบ้านเสร็จเอง', stars: 2 },
  { kind: 'earn', emoji: '📖', name: 'อ่านหนังสือ 20 นาที', stars: 2 },
  { kind: 'earn', emoji: '🤝', name: 'แบ่งปัน/ช่วยเหลือพี่น้อง', stars: 2 },
  { kind: 'earn', emoji: '🌟', name: 'ทำดีเป็นพิเศษ', stars: 5 },

  // ความผิด → หักดาว (แบ่งตามความร้ายแรง)
  { kind: 'penalty', severity: 'light', emoji: '🧦', name: 'ทิ้งของเกลื่อน ไม่เก็บ', stars: 1 },
  { kind: 'penalty', severity: 'light', emoji: '⏰', name: 'ไม่ทำตามเวลาที่ตกลง', stars: 1 },
  { kind: 'penalty', severity: 'light', emoji: '📱', name: 'เล่นโทรศัพท์เกินเวลา', stars: 2 },
  { kind: 'penalty', severity: 'medium', emoji: '😤', name: 'ทะเลาะกับพี่น้อง', stars: 3 },
  { kind: 'penalty', severity: 'medium', emoji: '🙉', name: 'ไม่เชื่อฟัง/เถียง', stars: 3 },
  { kind: 'penalty', severity: 'medium', emoji: '🗣️', name: 'พูดจาไม่สุภาพ', stars: 3 },
  { kind: 'penalty', severity: 'severe', emoji: '🤥', name: 'โกหก', stars: 5 },
  { kind: 'penalty', severity: 'severe', emoji: '👊', name: 'ตี/ทำร้ายคนอื่น', stars: 5 },
  { kind: 'penalty', severity: 'severe', emoji: '💥', name: 'ทำของเสียหายโดยตั้งใจ', stars: 5 },
];

export const SEED_REWARDS = [
  { category: 'snack', emoji: '🍦', name: 'ไอติม 1 แท่ง', cost: 5 },
  { category: 'snack', emoji: '🍬', name: 'ขนม 1 ห่อ', cost: 5 },
  { category: 'screen', emoji: '📱', name: 'เล่นโทรศัพท์ 30 นาที', cost: 5 },
  { category: 'screen', emoji: '🎮', name: 'เล่นโทรศัพท์ 1 ชั่วโมง', cost: 9 },
  { category: 'money', emoji: '🪙', name: 'เงิน 20 บาท', cost: 10 },
  { category: 'money', emoji: '💵', name: 'เงิน 50 บาท', cost: 22 },
  { category: 'money', emoji: '💰', name: 'เงิน 100 บาท', cost: 40 },
  { category: 'toy', emoji: '🚗', name: 'ของเล่นชิ้นเล็ก (ไม่เกิน 100 บาท)', cost: 40 },
  { category: 'toy', emoji: '🧩', name: 'ของเล่นชิ้นกลาง (ไม่เกิน 300 บาท)', cost: 100 },
  { category: 'toy', emoji: '🎁', name: 'ของเล่นชิ้นใหญ่ (ไม่เกิน 1,000 บาท)', cost: 300 },
];
