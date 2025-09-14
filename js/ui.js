import { state, foods, saveLog, todayKey } from './data.js';

export function fmt(n, d=0){ return (n??0).toLocaleString(undefined,{maximumFractionDigits:d, minimumFractionDigits:d}); }
export function percent(v, max){ if (!max) return 0; return Math.min(100, Math.round((v/max)*100)); }

function proteinRangePerKg(age){
  if (age <= 0.9) return [1.1, 1.57];
  if (age <= 1.1) return [0.9, 1.21];
  if (age <= 3) return [0.9, 1.21];
  if (age <= 6) return [0.85, 1.03];
  if (age <= 12) return [0.9, 1.09];
  if (age <= 14) return [0.8, 1.07];
  return [0.8, 1.02];
}

function sodiumRange(age){
  if (age < 1) return [175, 550];
  if (age <= 3) return [225, 675];
  if (age <= 5) return [300, 900];
  if (age <= 8) return [325, 950];
  if (age <= 12) return [400, 1175];
  if (age <= 15) return [500, 1500];
  return [525, 1600];
}

function targets(){
  const age = Number(state.profile.age || 0);
  const wt = Number(state.profile.weight || 0);
  const [pMinKG, pMaxKG] = proteinRangePerKg(age);
  const pMin = wt * pMinKG;
  const pMax = wt * pMaxKG;
  const [sMin, sMax] = sodiumRange(age);
  return { pMin, pMax, sMin, sMax };
}

export function renderDashboard(){
  const t = targets();
  const sums = state.log.reduce((a,r)=>({ protein:a.protein+ r.protein*r.qty, sodium:a.sodium+ r.sodium*r.qty }), {protein:0,sodium:0});
  document.getElementById('proteinLabel').textContent = `${fmt(sums.protein,1)} / ${fmt(t.pMax,1)} g`;
  document.getElementById('sodiumLabel').textContent  = `${fmt(sums.sodium,0)} / ${fmt(t.sMax,0)} mg`;
  document.getElementById('proteinBar').style.width = percent(sums.protein, t.pMax)+"%";
  document.getElementById('sodiumBar').style.width  = percent(sums.sodium, t.sMax)+"%";
  const tips = [];
  if (sums.sodium > 0.8*t.sMax) tips.push('⚠️ โซเดียมใกล้เกิน ลองลดซอส/บะหมี่กึ่งฯ เลือกปลาอบ/เต้าหู้แทน');
  if (sums.protein < t.pMin*0.6) tips.push('ℹ️ โปรตีนน้อยไป อาจเพิ่มไข่ต้ม/ไก่ต้มในปริมาณเหมาะสม');
  document.getElementById('adviceBox').textContent = tips.join(' · ');
  const us = state.profile;
  const line = (us.name?`ชื่อ: ${us.name} · `:'')+`อายุ ${us.age??'-'} ปี · น้ำหนัก ${us.weight??'-'} กก. · ระยะ CKD ${us.ckd}`+
    ` | เป้าหมาย/วัน: โปรตีน ${fmt(t.pMin,1)}–${fmt(t.pMax,1)} g · โซเดียม ${fmt(t.sMin)}–${fmt(t.sMax)} mg`;
  document.getElementById('userSummary').textContent = line;
  const container = document.getElementById('todayList');
  container.innerHTML = '';
  state.log.forEach((r, idx)=>{
    const totP = r.protein*r.qty, totS = r.sodium*r.qty;
    const proteinClass = totP<=t.pMax? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
    const sodiumClass  = totS<=t.sMax?  'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
    const row = document.createElement('div');
    row.className = 'py-2 flex items-center justify-between gap-2';
    row.innerHTML = `
      <div>
        <div class="font-medium">${r.name} <span class="text-xs text-slate-500">×${r.qty}</span></div>
        <div class="flex gap-2 mt-1">
          <span class="chip ${proteinClass}">โปรตีน ${fmt(totP,1)} g</span>
          <span class="chip ${sodiumClass}">โซเดียม ${fmt(totS)} mg</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button class="text-sm px-2 py-1 border rounded" data-act="minus" data-idx="${idx}">−</button>
        <button class="text-sm px-2 py-1 border rounded" data-act="plus" data-idx="${idx}">+</button>
        <button class="text-sm px-2 py-1 border rounded text-red-600" data-act="del" data-idx="${idx}">ลบ</button>
      </div>`;
    container.appendChild(row);
  });
}

export function renderFoodList(){
  const list = document.getElementById('foodList');
  const q = document.getElementById('search').value.trim().toLowerCase();
  const cat = document.getElementById('categoryFilter').value;
  list.innerHTML = '';
  foods
    .filter(f => (!q || f.name.toLowerCase().includes(q)) && (!cat || f.cat===cat))
    .forEach(f => {
      const card = document.createElement('div');
      card.className = 'border rounded-lg p-3 hover:shadow-sm bg-white';
      const jpg = `images/${f.id}.jpg`;
      const png = `images/${f.id}.png`;
      const noImg = 'images/no-image.svg';
      card.innerHTML = `
        <div class="flex gap-3 items-center sm:items-start">
          <div class="flex-shrink-0">
            <img src="${jpg}" alt="${f.name}" class="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-md border" onerror="this.onerror=null;this.src='${png}';this.onerror=function(){this.src='${noImg}';}" loading="lazy" />
          </div>
          <div class="flex-1">
            <div class="font-medium text-sm">${f.name}</div>
            <div class="text-xs text-slate-600 mt-1">หมวด: ${f.cat}</div>
            <div class="text-sm mt-2">โปรตีน <b>${fmt(f.protein,1)}</b> g · โซเดียม <b>${fmt(f.sodium)}</b> mg / เสิร์ฟ</div>
            <div class="mt-3 flex items-center gap-2">
              <input type="number" min="1" value="1" class="qty border rounded px-2 py-1 w-20" />
              <button class="add bg-slate-800 text-white rounded px-3 py-1" data-id="${f.id}">เพิ่ม</button>
            </div>
          </div>
        </div>`;
      list.appendChild(card);
    });
}
