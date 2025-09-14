import { state, foods, saveLog, todayKey, getEntriesForDate, getIntakeLog } from './data.js';

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
  // compute raw percentages (may exceed 100)
  const pPctRaw = t.pMax ? (sums.protein / t.pMax) * 100 : 0;
  const sPctRaw = t.sMax ? (sums.sodium / t.sMax) * 100 : 0;
  const pWidth = Math.min(100, Math.round(pPctRaw));
  const sWidth = Math.min(100, Math.round(sPctRaw));
  const colorFor = (pctRaw)=>{
    if(pctRaw > 100) return '#ef4444'; // red-500
    if(pctRaw > 66) return '#f59e0b';  // amber-500
    return '#10b981'; // green-500
  };
  const pColor = colorFor(pPctRaw);
  const sColor = colorFor(sPctRaw);
  const pBar = document.getElementById('proteinBar');
  const sBar = document.getElementById('sodiumBar');
  if(pBar){ pBar.style.width = pWidth + '%'; pBar.style.background = pColor; }
  if(sBar){ sBar.style.width = sWidth + '%'; sBar.style.background = sColor; }
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
          <span class="chip chip-theme ${proteinClass}">โปรตีน ${fmt(totP,1)} g</span>
          <span class="chip chip-theme ${sodiumClass}">โซเดียม ${fmt(totS)} mg</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button class="text-sm px-2 py-1 border rounded-md bg-slate-50 hover:bg-slate-100" data-act="minus" data-idx="${idx}">−</button>
        <button class="text-sm px-2 py-1 border rounded-md bg-slate-50 hover:bg-slate-100" data-act="plus" data-idx="${idx}">+</button>
        <button class="text-sm px-2 py-1 border rounded-md text-red-600 bg-red-50 hover:bg-red-100" data-act="del" data-idx="${idx}">ลบ</button>
      </div>`;
    container.appendChild(row);
  });
}

// compute calories for a single record (fallback estimate)
function estimateCalories(rec){
  if(rec.calories) return Number(rec.calories) * (rec.qty||1);
  // simple estimate: protein*4 kcal + assume carb/fat ~ 150 kcal per serving if missing
  const p = Number(rec.protein||0);
  const est = Math.round(p*4 + 150) * (rec.qty||1);
  return est;
}

// render 30-day calories sparkline and total from localStorage logs
export async function renderPastCalories(days = 40){
  const numDays = Number(days) || 40;
  const now = new Date();
  const vals = [];
  let total = 0;
  for(let d=numDays-1; d>=0; d--){
    const dt = new Date(now);
    dt.setDate(now.getDate() - d);
    const keyDate = dt.toISOString().slice(0,10);
    let entries = [];
    try{ entries = await getEntriesForDate(keyDate) || []; }catch(e){ entries = []; }
    const dayCal = entries.reduce((s,rec)=> s + estimateCalories(rec), 0);
    vals.push(dayCal);
    total += dayCal;
  }
  // display total and draw simple sparkline bars
  const label = document.getElementById('cal30Label');
  if(label) label.textContent = `${total.toLocaleString()} kcal`;
  const spark = document.getElementById('cal30Spark');
  if(spark){
    // render compact SVG line chart
    const w = spark.clientWidth || 300; const h = spark.clientHeight || 40; const pad = 4;
    const maxv = Math.max(1, ...vals);
    const points = vals.map((v,i)=>{
      const x = pad + (i/(vals.length-1))*(w-2*pad);
      const y = h - pad - ((v/maxv)*(h-2*pad));
      return [x,y];
    });
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('width', '100%'); svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    // path
    const pathD = points.map((p,i)=> (i===0?`M ${p[0]} ${p[1]}`:`L ${p[0]} ${p[1]}`)).join(' ');
    const path = document.createElementNS(svgNS, 'path'); path.setAttribute('d', pathD); path.setAttribute('fill','none'); path.setAttribute('stroke','#3b82f6'); path.setAttribute('stroke-width','2'); path.setAttribute('stroke-linejoin','round');
    svg.appendChild(path);
    // area under curve (subtle)
    const areaD = pathD + ` L ${w-pad} ${h-pad} L ${pad} ${h-pad} Z`;
    const area = document.createElementNS(svgNS, 'path'); area.setAttribute('d', areaD); area.setAttribute('fill','#bfdbfe'); area.setAttribute('opacity','0.35'); svg.insertBefore(area, path);
    // circles with tooltips
    points.forEach((p,i)=>{
      const c = document.createElementNS(svgNS, 'circle'); c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.setAttribute('r','2.5'); c.setAttribute('fill', vals[i]>0? '#2563eb':'#cbd5e1');
      const title = document.createElementNS(svgNS, 'title'); title.textContent = `${vals[i].toLocaleString()} kcal`; c.appendChild(title); svg.appendChild(c);
    });
    spark.innerHTML = ''; spark.appendChild(svg);
  }
  // populate list of daily consumption
  const list = document.getElementById('cal30List');
  if(list){
    list.innerHTML = '';
    // show most-recent first
    const now = new Date();
    for(let i=vals.length-1;i>=0;i--){
      const daysAgo = vals.length-1 - i;
      const dt = new Date(now); dt.setDate(now.getDate() - daysAgo);
      const key = dt.toISOString().slice(0,10);
      const el = document.createElement('div');
      el.className = 'p-2 bg-slate-50 rounded';
      el.innerHTML = `<div class="font-medium text-xs">${key}</div><div class="text-xs text-slate-600">${vals[i].toLocaleString()} kcal</div>`;
      list.appendChild(el);
    }
  }
}

export function renderFoodList(){
  const list = document.getElementById('foodList');
  const q = document.getElementById('search').value.trim().toLowerCase();
  const cat = document.getElementById('categoryFilter').value;
  list.innerHTML = '';
  // current totals from today's selections
  const currentTotals = state.log.reduce((a,r)=>({ protein:a.protein + r.protein*r.qty, sodium: a.sodium + r.sodium*r.qty }), {protein:0, sodium:0});
  const t = targets();
  foods
    .filter(f => (!q || f.name.toLowerCase().includes(q)) && (!cat || f.cat===cat))
    .forEach(f => {
      const card = document.createElement('div');
      card.className = 'border rounded-lg p-3 hover:shadow-sm bg-white';
      const jpg = `images/${f.id}.jpg`;
      const png = `images/${f.id}.png`;
      const noImg = 'images/no-image.svg';
      const src = f.image ? f.image : jpg;
  card.innerHTML = `
        <div class="flex gap-3 items-center sm:items-start">
          <div class="flex-shrink-0">
  <img src="${src}" alt="${f.name}" class="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-md border" style="object-position: ${f.imagePos?`${f.imagePos.x}% ${f.imagePos.y}%`:'center'}" onerror="this.onerror=null;this.src='${png}';this.onerror=function(){this.src='${noImg}';}" loading="lazy" />
          </div>
          <div class="flex-1">
            <div class="font-medium text-sm"><span class="food-name">${f.name}</span></div>
            <div class="text-xs text-slate-600 mt-1">หมวด: ${f.cat}</div>
            <div class="text-sm mt-2">โปรตีน <b>${fmt(f.protein,1)}</b> g · โซเดียม <b>${fmt(f.sodium)}</b> mg / เสิร์ฟ</div>
            <div class="mt-3 flex items-center gap-2">
              <input type="number" min="1" value="1" class="qty border rounded-md px-2 py-1 w-20 text-sm" />
              <button class="add btn-primary hover:brightness-95 rounded-md px-3 py-1 shadow" data-id="${f.id}">เพิ่ม</button>
            </div>
          </div>
        </div>`;
      // helper: compute projected percentages and apply highlight classes
      const applyHighlight = (qty)=>{
        const qnum = Number(qty)||1;
        const projP = currentTotals.protein + f.protein * qnum;
        const projS = currentTotals.sodium + f.sodium * qnum;
        const pPctRaw = t.pMax ? (projP / t.pMax) * 100 : 0;
        const sPctRaw = t.sMax ? (projS / t.sMax) * 100 : 0;
        // decision: if single serving sodium is very high (e.g. instant noodles ~1500mg), always red
        let stateCol = 'normal';
  if (f.sodium >= 1200) {
          // treat as immediate red hazard
          stateCol = 'red';
        } else if(pPctRaw > 100 || sPctRaw > 100) stateCol = 'red';
        else if(pPctRaw > 66 || sPctRaw > 66) stateCol = 'yellow';
  // normalize classes and remove any previous badge and name chip classes
  card.classList.remove('ring-2','ring-red-200','border-red-300','ring-amber-100','border-amber-300','shadow-md','bg-red-50','bg-amber-50');
  const prevBadge = card.querySelector('.high-badge'); if(prevBadge) prevBadge.remove();
  const nameSpan = card.querySelector('.food-name');
  if(nameSpan) nameSpan.classList.remove('px-2','py-0.5','rounded-full','bg-emerald-600','text-white','text-xs');
  if(stateCol==='red'){
          // stronger visual: red border, subtle red background, ring and small shadow
          card.classList.add('border-red-300','ring-2','ring-red-200','bg-red-50','shadow-md');
          // inject badge
          const b = document.createElement('div');
          b.className = 'high-badge text-xs px-2 py-0.5 rounded-full bg-red-600 text-white inline-block';
          b.textContent = 'สูง: โซเดียม';
          card.querySelector('.flex-1')?.prepend(b);
        } else if(stateCol==='yellow'){
          card.classList.add('border-amber-300','ring-2','ring-amber-100','bg-amber-50','shadow-sm');
          const b = document.createElement('div');
          b.className = 'high-badge text-xs px-2 py-0.5 rounded-full bg-amber-600 text-white inline-block';
          b.textContent = 'ระวัง';
          card.querySelector('.flex-1')?.prepend(b);
        } else {
          // normal/ok => mark the name as a small green chip for positive cue
          if(nameSpan){
            // apply nicer chip classes (use a dedicated class in CSS)
            nameSpan.classList.add('chip-good');
            // tooltip
            nameSpan.setAttribute('title','เหมาะสม');
            // click handler => show a toast or fallback
            nameSpan.style.cursor = 'pointer';
            nameSpan.addEventListener('click', ()=>{
              const msg = `${f.name} เหมาะสมสำหรับเป้าหมายนี้`;
              if(window.showToast) return window.showToast(msg);
              // fallback: create a temporary toast
              const tc = document.getElementById('toastContainer');
              if(!tc) return;
              const t = document.createElement('div');
              t.className = 'px-4 py-2 bg-emerald-600 text-white rounded shadow-md pointer-events-auto';
              t.textContent = msg;
              tc.appendChild(t);
              setTimeout(()=>{ t.remove(); }, 3000);
            });
          }
        }
      };

      list.appendChild(card);
      // attach event to qty input for live highlight updates
      const qtyInput = card.querySelector('.qty');
      if(qtyInput){
        applyHighlight(qtyInput.value);
        qtyInput.addEventListener('input', (ev)=>{ applyHighlight(ev.target.value); });
      } else applyHighlight(1);
    });
}

export function renderManageFoods(){
  const container = document.getElementById('manageList');
  if(!container) return;
  container.innerHTML = '';
  foods.forEach((f, idx)=>{
    const row = document.createElement('div');
    row.className = 'p-2 border rounded flex items-center justify-between gap-2 bg-white';
  row.innerHTML = `
      <div class="flex-1 flex items-center gap-3">
        <div class="flex-shrink-0">
          <img src="${f.image?f.image:`images/${f.id}.jpg`}" alt="${f.name}" class="w-12 h-12 object-cover rounded-md border" onerror="this.onerror=null;this.src='images/${f.id}.png';this.onerror=function(){this.src='images/no-image.svg';}" />
        </div>
        <div>
          <div class="font-medium text-sm">${f.name} <span class="text-xs text-slate-500">· ${f.cat}</span></div>
          <div class="text-xs text-slate-500">โปรตีน ${fmt(f.protein,1)} g · โซเดียม ${fmt(f.sodium)} mg</div>
  </div>
  <div class="text-xs text-slate-400 ml-2">${f._source==='server'?'<span class="px-2 py-0.5 bg-sky-100 text-sky-700 rounded-full">จากเซิร์ฟเวอร์</span>':'<span class="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">เครื่องนี้</span>'}</div>
      </div>
      <div class="flex items-center gap-2">
        <button class="edit px-3 py-1 text-sm border rounded" data-idx="${idx}">แก้</button>
        <button class="del px-3 py-1 text-sm border rounded text-red-600" data-idx="${idx}">ลบ</button>
      </div>`;
    container.appendChild(row);
  });
}

// render a 30-day table with date, food id, name, protein, sodium and highlight rows
export async function render30DayHistory(days = 30){
  const num = Number(days) || 30;
  const now = new Date();
  const container = document.getElementById('calHistoryTable');
  if(!container) return;
  // build table
  const table = document.createElement('table');
  table.className = 'w-full text-sm border-collapse';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr class="bg-slate-100 text-left"><th class="p-2 border">วันที่</th><th class="p-2 border">ชื่ออาหาร</th><th class="p-2 border text-right">โปรตีน (g)</th><th class="p-2 border text-right">โซเดียม (mg)</th></tr>`;
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  // iterate most-recent first
  for(let d=0; d<num; d++){
    const dt = new Date(now); dt.setDate(now.getDate() - d);
    const keyDate = dt.toISOString().slice(0,10);
    let entries = [];
    try{ entries = await getEntriesForDate(keyDate) || []; }catch(e){ entries = []; }
    if(entries.length===0){
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="p-2 border">${keyDate}</td><td class="p-2 border" colspan="3"><span class="text-slate-400">ไม่มีบันทึก</span></td>`;
      tbody.appendChild(tr);
    } else {
      // compute daily totals for the date and decide one highlight state for all rows of that day
      const daily = entries.reduce((acc, rec) => {
        acc.protein += Number(rec.protein||0) * (rec.qty||1);
        acc.sodium  += Number(rec.sodium||0) * (rec.qty||1);
        return acc;
      }, {protein:0, sodium:0});
      const t = targets();
      const pPctRawDaily = t.pMax ? (daily.protein / t.pMax) * 100 : 0;
      const sPctRawDaily = t.sMax ? (daily.sodium / t.sMax) * 100 : 0;
      let dayState = 'normal';
      if (daily.sodium >= 1200) dayState = 'red';
      else if(pPctRawDaily > 100 || sPctRawDaily > 100) dayState = 'red';
      else if(pPctRawDaily > 66 || sPctRawDaily > 66) dayState = 'yellow';

      // render each record but apply the same rowState for visual grouping
      entries.forEach((rec, idx)=>{
        const totP = Number(rec.protein||0) * (rec.qty||1);
        const totS = Number(rec.sodium||0) * (rec.qty||1);
        const tr = document.createElement('tr');
        const baseCls = 'p-2 border align-top';
        tr.innerHTML = `
          <td class="${baseCls}">${keyDate}</td>
          <td class="${baseCls}">${rec.name || ''}${rec.qty?` <span class="text-xs text-slate-500">×${rec.qty}</span>`:''}</td>
          <td class="${baseCls} text-right">${fmt(totP,1)}</td>
          <td class="${baseCls} text-right">${fmt(totS,0)}</td>
        `;
        if(dayState==='red') tr.classList.add('bg-red-50','border-red-200');
        else if(dayState==='yellow') tr.classList.add('bg-amber-50','border-amber-200');
        tbody.appendChild(tr);
      });
      // append a summary row for the day with totals
      const sumTr = document.createElement('tr');
      sumTr.className = 'bg-slate-50';
      if(dayState==='red') sumTr.classList.add('bg-red-100'); else if(dayState==='yellow') sumTr.classList.add('bg-amber-100');
  sumTr.innerHTML = `<td class="p-2 border font-medium">รวม ${keyDate}</td><td class="p-2 border"></td><td class="p-2 border text-right font-medium">${fmt(daily.protein,1)}</td><td class="p-2 border text-right font-medium">${fmt(daily.sodium,0)}</td>`;
      tbody.appendChild(sumTr);
    }
  }
  table.appendChild(tbody);
  container.innerHTML = '';
  container.appendChild(table);
}

// Render sodium line chart for the past `days` days
export async function renderSodiumChart(days = 7){
  const numDays = Number(days) || 7;
  const now = new Date();
  const vals = [];
  const labels = [];
  for(let d=numDays-1; d>=0; d--){
    const dt = new Date(now); dt.setDate(now.getDate() - d);
    const keyDate = dt.toISOString().slice(0,10);
    labels.push(keyDate);
    let entries = [];
    try{ entries = await getEntriesForDate(keyDate) || []; }catch(e){ entries = []; }
    const dailyS = entries.reduce((s,rec)=> s + (Number(rec.sodium||0)*(rec.qty||1)), 0);
    vals.push(dailyS);
  }
  const container = document.getElementById('sodiumChart');
  if(!container) return;
  // basic SVG line chart
  const w = container.clientWidth || 600; const h = 120; const pad = 24;
  const maxv = Math.max(1, ...vals);
  // daily sodium target from profile
  const t = targets(); const limit = t.sMax || 1000;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('width','100%'); svg.setAttribute('height', h);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  // background grid lines
  for(let i=0;i<=4;i++){
    const y = pad + i*((h-2*pad)/4);
    const line = document.createElementNS(svgNS,'line'); line.setAttribute('x1',pad); line.setAttribute('x2', w-pad); line.setAttribute('y1', y); line.setAttribute('y2', y); line.setAttribute('stroke','#eef2f7'); line.setAttribute('stroke-width','1'); svg.appendChild(line);
  }
  // reference line for daily limit
  const refY = h - pad - ((Math.min(limit, maxv)/maxv)*(h-2*pad));
  const ref = document.createElementNS(svgNS,'line'); ref.setAttribute('x1',pad); ref.setAttribute('x2', w-pad); ref.setAttribute('y1', refY); ref.setAttribute('y2', refY); ref.setAttribute('stroke','#f59e0b'); ref.setAttribute('stroke-width','2'); ref.setAttribute('stroke-dasharray','6 4'); svg.appendChild(ref);
  const refLabel = document.createElementNS(svgNS,'text'); refLabel.setAttribute('x', w-pad-4); refLabel.setAttribute('y', refY-6); refLabel.setAttribute('text-anchor','end'); refLabel.setAttribute('font-size','10'); refLabel.setAttribute('fill','#b45309'); refLabel.textContent = `Limit ${Math.round(limit)} mg`; svg.appendChild(refLabel);
  // points and path
  const points = vals.map((v,i)=>{ const x = pad + (i/(vals.length-1))*(w-2*pad); const y = h - pad - ((v/maxv)*(h-2*pad)); return [x,y]; });
  const dPath = points.map((p,i)=> (i===0?`M ${p[0]} ${p[1]}`:`L ${p[0]} ${p[1]}`)).join(' ');
  const path = document.createElementNS(svgNS,'path'); path.setAttribute('d', dPath); path.setAttribute('fill','none'); path.setAttribute('stroke','#2563eb'); path.setAttribute('stroke-width','2'); svg.appendChild(path);
  points.forEach((p,i)=>{
    const c = document.createElementNS(svgNS,'circle'); c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.setAttribute('r','2.5'); c.setAttribute('fill', vals[i] > limit ? '#ef4444' : '#2563eb'); svg.appendChild(c);
  });
  container.innerHTML = ''; container.appendChild(svg);
}

// Render protein line chart for the past `days` days
export async function renderProteinChart(days = 7){
  const numDays = Number(days) || 7;
  const now = new Date();
  const vals = [];
  const labels = [];
  for(let d=numDays-1; d>=0; d--){
    const dt = new Date(now); dt.setDate(now.getDate() - d);
    const keyDate = dt.toISOString().slice(0,10);
    labels.push(keyDate);
    let entries = [];
    try{ entries = await getEntriesForDate(keyDate) || []; }catch(e){ entries = []; }
    const dailyP = entries.reduce((s,rec)=> s + (Number(rec.protein||0)*(rec.qty||1)), 0);
    vals.push(dailyP);
  }
  const container = document.getElementById('proteinChart');
  if(!container) return;
  const w = container.clientWidth || 600; const h = 120; const pad = 24;
  const maxv = Math.max(1, ...vals);
  const t = targets(); const limit = t.pMax || 50; // protein daily max
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('width','100%'); svg.setAttribute('height', h);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  for(let i=0;i<=4;i++){
    const y = pad + i*((h-2*pad)/4);
    const line = document.createElementNS(svgNS,'line'); line.setAttribute('x1',pad); line.setAttribute('x2', w-pad); line.setAttribute('y1', y); line.setAttribute('y2', y); line.setAttribute('stroke','#eef2f7'); line.setAttribute('stroke-width','1'); svg.appendChild(line);
  }
  const refY = h - pad - ((Math.min(limit, maxv)/maxv)*(h-2*pad));
  const ref = document.createElementNS(svgNS,'line'); ref.setAttribute('x1',pad); ref.setAttribute('x2', w-pad); ref.setAttribute('y1', refY); ref.setAttribute('y2', refY); ref.setAttribute('stroke','#10b981'); ref.setAttribute('stroke-width','2'); ref.setAttribute('stroke-dasharray','6 4'); svg.appendChild(ref);
  const refLabel = document.createElementNS(svgNS,'text'); refLabel.setAttribute('x', w-pad-4); refLabel.setAttribute('y', refY-6); refLabel.setAttribute('text-anchor','end'); refLabel.setAttribute('font-size','10'); refLabel.setAttribute('fill','#065f46'); refLabel.textContent = `Limit ${Math.round(limit)} g`; svg.appendChild(refLabel);
  const points = vals.map((v,i)=>{ const x = pad + (i/(vals.length-1))*(w-2*pad); const y = h - pad - ((v/maxv)*(h-2*pad)); return [x,y]; });
  const dPath = points.map((p,i)=> (i===0?`M ${p[0]} ${p[1]}`:`L ${p[0]} ${p[1]}`)).join(' ');
  const path = document.createElementNS(svgNS,'path'); path.setAttribute('d', dPath); path.setAttribute('fill','none'); path.setAttribute('stroke','#059669'); path.setAttribute('stroke-width','2'); svg.appendChild(path);
  points.forEach((p,i)=>{
    const c = document.createElementNS(svgNS, 'circle'); c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.setAttribute('r','2.5'); c.setAttribute('fill', vals[i] > limit ? '#ef4444' : '#059669'); svg.appendChild(c);
  });
  container.innerHTML = ''; container.appendChild(svg);
}

    
