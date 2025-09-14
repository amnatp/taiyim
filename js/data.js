// data.js - storage and data model
export const LS = {
  load: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  save: (k, v) => localStorage.setItem(k, JSON.stringify(v))
};

export const todayKey = () => 'log_'+new Date().toISOString().slice(0,10);

export const defaultFoods = [
  { id: 'rice', name: 'ข้าวสวย 1 ทัพพี', cat: 'อาหารจานหลัก', protein: 2.0, sodium: 2 },
  { id: 'chicken_boil', name: 'ไก่ต้ม 50 กรัม', cat: 'อาหารจานหลัก', protein: 11.0, sodium: 50 },
  { id: 'egg', name: 'ไข่ต้ม 1 ฟอง', cat: 'อาหารจานหลัก', protein: 6.0, sodium: 65 },
  { id: 'tofu', name: 'เต้าหู้ขาว 80 กรัม', cat: 'อาหารจานหลัก', protein: 8.0, sodium: 10 },
  { id: 'fish', name: 'ปลาอบ 60 กรัม', cat: 'อาหารจานหลัก', protein: 12.0, sodium: 70 },
  { id: 'soy_sauce', name: 'ซีอิ๊ว 1 ช้อนชา', cat: 'ซอสปรุงรส', protein: 0.5, sodium: 335 },
  { id: 'instant_noodle', name: 'บะหมี่กึ่งฯ 1 ซอง (พร้อมซุป)', cat: 'อาหารจานหลัก', protein: 7.0, sodium: 1500 },
  { id: 'banana', name: 'กล้วยน้ำว้า 1 ลูก', cat: 'อาหารว่าง', protein: 1.2, sodium: 1 },
  { id: 'apple', name: 'แอปเปิล 1 ผลเล็ก', cat: 'อาหารว่าง', protein: 0.3, sodium: 1 },
  { id: 'snack', name: 'ขนมอบกรอบ 1 ซองเล็ก', cat: 'อาหารว่าง', protein: 2.0, sodium: 250 }
];

export let foods = LS.load('foods', defaultFoods);
if (!LS.load('foods_inited', false)) { LS.save('foods', foods); LS.save('foods_inited', true); }

export const state = {
  profile: LS.load('profile', { name: '', age: null, weight: null, ckd: '2' }),
  log: LS.load(todayKey(), [])
};

export function saveLog(){ LS.save(todayKey(), state.log); }
