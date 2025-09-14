import { LS, state, foods, saveLog, todayKey, initDBAndLoad, loadFoodsFromServer, generateDummyHistory, saveIntakeForToday, saveProfile, saveManagedFoods, savePerDayKey, exportAllData, getEntriesForDate, calcAgeYears, computeTargets, computeEgfr } from './data.js';
import { renderDashboard, renderFoodList, renderManageFoods, renderPastCalories, render30DayHistory, renderSodiumChart, renderProteinChart } from './ui.js';

function initProfileInputs(){
  const p = state.profile;
  document.getElementById('p_name').value = p.name || '';
  document.getElementById('p_age').value = p.age ?? '';
  document.getElementById('p_weight').value = p.weight ?? '';
  document.getElementById('p_ckd').value = p.ckd || '2';
  // extra fields
  document.getElementById('p_nickname').value = p.nickname || '';
  document.getElementById('p_dob').value = p.dob || '';
  document.getElementById('p_egfr').value = p.egfr ?? '';
  document.getElementById('p_guardian').value = p.guardian || '';
  document.getElementById('p_school').value = p.school || '';
  document.getElementById('p_height').value = p.height ?? '';
  document.getElementById('p_activity').value = p.activity || 'moderate';
  // update visible sub-form based on age
  toggleAgeForms(Number(document.getElementById('p_age').value||0));
}

function setProfileEnabled(enabled){
  const form = document.getElementById('profileForm');
  if(!form) return;
  Array.from(form.querySelectorAll('input,select,button')).forEach(el=>{
    // keep the reset button enabled
    if(el.id === 'resetAll') { el.disabled = false; return; }
    el.disabled = !enabled;
    if(!enabled) el.classList && el.classList.add('opacity-60'); else el.classList && el.classList.remove('opacity-60');
  });
}

function toggleAgeForms(age){
  const ped = document.getElementById('pediatricForm');
  const adult = document.getElementById('adultForm');
  if(!ped || !adult) return;
  if(age < 18){ ped.classList.remove('hidden'); adult.classList.add('hidden'); }
  else { adult.classList.remove('hidden'); ped.classList.add('hidden'); }
}

function registerEvents(){
  // Helper to reliably show a tab, update nav visuals, and run renderer
  async function showTab(tabId){
    try{
      // hide all tab sections
      document.querySelectorAll('.tab').forEach(s=>s.classList.add('hidden'));
      // show requested
      const elTab = document.getElementById(tabId);
      if(elTab) elTab.classList.remove('hidden');
      // update nav visuals
      document.querySelectorAll('.tabBtn').forEach(b=>{ b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
      const btn = document.querySelector('.tabBtn[data-tab="'+tabId+'"]');
      if(btn){ btn.classList.add('active'); btn.setAttribute('aria-pressed','true'); }
      // call renderer if available
      if(tabId==='dashboard') try{ 
        renderDashboard(); 
        // ensure history panel is visible (cal30Block is a separate section/tab)
        try{ const cal30 = document.getElementById('cal30Block'); if(cal30) { cal30.classList.remove('hidden'); console.debug('[showTab] cal30Block shown'); } }catch(e){}
        // also refresh history widgets (use selected range if present)
        try{
          const historyRangeEl = document.getElementById('historyRange');
          const days = historyRangeEl ? Number(historyRangeEl.value) : 7;
          console.debug('[showTab] scheduling history render for', days, 'days');
          // schedule on next tick / after paint so dimensions are available for sparkline
          setTimeout(()=>{
            (async ()=>{
                try{ await renderPastCalories(days); console.debug('[showTab] renderPastCalories done'); }catch(e){ console.warn('renderPastCalories error', e); }
                try{ await render30DayHistory(days); console.debug('[showTab] render30DayHistory done'); }catch(e){ console.warn('render30DayHistory error', e); }
                try{ await renderSodiumChart(days); console.debug('[showTab] renderSodiumChart done'); }catch(e){ console.warn('renderSodiumChart error', e); }
              })();
          }, 50);
        }catch(e){ console.warn('history render scheduling failed', e); }
      }catch(e){ console.warn('showTab dashboard render failed', e); }
      if(tabId==='food') try{ renderFoodList(); }catch(e){}
      if(tabId==='manage') try{ 
        // ensure server-provided foods are loaded before rendering manage list (demo convenience)
        try{ await loadFoodsFromServer(); }catch(e){}
        try{ renderManageFoods(); }catch(e){}
      }catch(e){}
      return true;
    }catch(e){ console.warn('showTab error', e); return false; }
  }
  document.querySelectorAll('.tabBtn').forEach(btn=>btn.addEventListener('click', (ev)=>{
  const el = ev.currentTarget || btn;
  console.debug('[tabBtn] click detected', { tag: el.tagName, dataset: el.dataset, text: el.textContent && el.textContent.trim().slice(0,30) });
  const target = el.dataset.tab;
  // use showTab to reliably switch and render
  showTab(target);
  }));

  // Delegated fallback: ensure clicks inside nav always activate the tab and trigger render
  const navContainer = document.getElementById('navItems');
  if(navContainer){
      navContainer.addEventListener('click', (ev)=>{
        const btn = ev.target.closest && ev.target.closest('.tabBtn');
        console.debug('[navItems] click', { clicked: ev.target.tagName, foundBtn: !!btn, btnDataset: btn && btn.dataset });
        if(!btn) return;
        showTab(btn.dataset.tab);
      });
  }

  document.getElementById('profileForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const dob = document.getElementById('p_dob').value || '';
    // prefer computed age from DOB if available
    let age = Number(document.getElementById('p_age').value) || null;
    const dobAge = calcAgeYears(dob);
    if(dobAge != null) age = dobAge;
    const weight = Number(document.getElementById('p_weight').value) || null;
    const ckd = document.getElementById('p_ckd').value || '2';
    const profile = {
      name: document.getElementById('p_name').value.trim(),
      age: age,
      weight: weight,
  sex: document.getElementById('p_sex')?.value || null,
      ckd: ckd,
      // extras
      nickname: document.getElementById('p_nickname').value.trim(),
      dob: dob || null,
  egfr: Number(document.getElementById('p_egfr').value) || null,
  scr: Number(document.getElementById('p_scr')?.value) || null,
      guardian: document.getElementById('p_guardian').value.trim() || null,
      school: document.getElementById('p_school').value.trim() || null,
      height: Number(document.getElementById('p_height').value) || null,
      activity: document.getElementById('p_activity').value || null
    };
    // compute recommended targets and attach
    try{
      const t = computeTargets(age, ckd, weight);
      profile.targets = { proteinMin: t.proteinMin, proteinMax: t.proteinMax, sodiumMax: t.sodiumMax };
    }catch(e){ /* ignore compute errors */ }
    state.profile = profile;
    LS.save('profile', state.profile);
    try{ saveProfile(state.profile); }catch(e){}
    renderDashboard();
    showToast('บันทึกโปรไฟล์แล้ว');
  });

  // toggle sub-forms live when age changes
  // keep p_age read-only and compute from DOB; update forms when DOB changes
  const pDobEl = document.getElementById('p_dob');
  const pAgeEl = document.getElementById('p_age');
  if(pDobEl){
    pDobEl.addEventListener('input', (e)=>{
      try{
        const years = calcAgeYears(e.target.value);
        if(pAgeEl) pAgeEl.value = years != null ? years : '';
        toggleAgeForms(Number(years || 0));
      }catch(err){ console.warn('age calc failed', err); }
    });
  }

  // live eGFR calculation from height and serum creatinine
  const pScrEl = document.getElementById('p_scr');
  const pHeightEl = document.getElementById('p_height');
  const pEgfrEl = document.getElementById('p_egfr');
  function recomputeEgfr(){
    try{
  const scr = pScrEl ? Number(pScrEl.value) : null;
  const h = pHeightEl ? Number(pHeightEl.value) : null;
  const age = Number(pAgeEl ? pAgeEl.value : null) || null;
  const sex = document.getElementById('p_sex')?.value || null;
  const egfr = computeEgfr({ age, heightCm: h, scr, sex });
      if(pEgfrEl) pEgfrEl.value = egfr != null ? egfr : '';
    }catch(e){ console.warn('egfr calc failed', e); }
  }
  pScrEl?.addEventListener('input', recomputeEgfr);
  pHeightEl?.addEventListener('input', recomputeEgfr);

  document.getElementById('resetAll').addEventListener('click', async ()=>{
    if(confirm('ลบข้อมูลทั้งหมด (โปรไฟล์ อาหาร ที่บันทึกวันนี้)?')){ await LS.clearAll(); location.reload(); }
  });

  document.getElementById('food').addEventListener('click', (e)=>{
    if(e.target.classList.contains('add')){
  // perform add immediately
  const id = e.target.dataset.id;
  const card = e.target.closest('div');
  const qty = Number(card.querySelector('.qty').value || 1);
  const item = foods.find(f=>f.id===id);
  if(item){ state.log.push({ name: item.name, protein: item.protein, sodium: item.sodium, qty, id: item.id, ts: new Date().toISOString(), src: item._source||'server' });
      // sync both legacy per-day and unified intake_log
      try{ saveIntakeForToday(); }catch(e){ saveLog(); }
      renderDashboard(); }
  // then show modal to ask whether to stay or go to dashboard
  const modal = document.getElementById('confirmAddModal');
  const msg = document.getElementById('confirmAddMsg');
  modal.dataset.addName = item ? item.name : '';
  modal.dataset.addId = id;
  modal.dataset.addQty = String(qty);
  msg.textContent = item? `เพิ่ม "${item.name}" จำนวน ${qty} หน่วยแล้ว — ต้องการเลือกอาหารต่อหรือไปหน้า Dashboard?` : 'เพิ่มแล้ว — ต้องการไปที่ไหน?';
  modal.classList.remove('hidden');
  modal.classList.add('flex');
    }
  });

  // Modal buttons handling
  const closeConfirm = ()=>{
    const m = document.getElementById('confirmAddModal');
    if(!m) return;
    m.classList.add('hidden'); m.classList.remove('flex');
    delete m.dataset.addId; delete m.dataset.addQty; delete m.dataset.addName;
  };

  // note: Cancel button removed from markup. 'Stay' keeps user on food list.
  document.getElementById('confirmAddStay').addEventListener('click', ()=>{
  // user chose to add more — close modal and stay on food tab
  closeConfirm();
  renderFoodList();
  });
  document.getElementById('confirmAddDashboard').addEventListener('click', ()=>{
  // user chose to go to dashboard — close modal and navigate
  closeConfirm();
    // navigate to dashboard tab
    document.querySelectorAll('.tab').forEach(s=>s.classList.add('hidden'));
    const db = document.getElementById('dashboard'); if(db) db.classList.remove('hidden');
    // update tab button active visuals
  document.querySelectorAll('.tabBtn').forEach(b=>{ b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
  const btn = document.querySelector('.tabBtn[data-tab="dashboard"]'); if(btn){ btn.classList.add('active'); btn.setAttribute('aria-pressed','true'); }
    renderDashboard();
  });

  document.getElementById('search').addEventListener('input', renderFoodList);
  document.getElementById('categoryFilter').addEventListener('change', renderFoodList);

  // ensure navItems is visible and scrollable on small screens (no hamburger)
  const navItems = document.getElementById('navItems');
  if(navItems) navItems.classList.remove('hidden');

  document.getElementById('todayList').addEventListener('click', (e)=>{
    const idx = Number(e.target.dataset.idx);
    const act = e.target.dataset.act;
  if(act==='del'){ state.log.splice(idx,1); }
  if(act==='plus'){ state.log[idx].qty++; }
  if(act==='minus'){ state.log[idx].qty = Math.max(1, state.log[idx].qty-1); }
  try{ saveIntakeForToday(); }catch(e){ saveLog(); }
  renderDashboard();
  });

  // Manage list actions (edit/delete)
  document.getElementById('manageList')?.addEventListener('click', (e)=>{
    const idx = Number(e.target.dataset.idx);
    if(e.target.classList.contains('del')){
  if(confirm('ลบรายการอาหารนี้?')){
        const f = foods[idx];
  // local items are in-memory only; no IDB persistence for managed foods
  foods.splice(idx,1);
  try{ saveManagedFoods(foods); }catch(e){}
  renderManageFoods(); showToast('ลบรายการ (เฉพาะเครื่องนี้)'); }
    }
    if(e.target.classList.contains('edit')){
      const f = foods[idx];
      if(!f) return;
      // simple inline editor modal-like
      const formHtml = `
        <div class=\"p-4 bg-white rounded shadow max-w-md w-full\"> 
          <div class=\"font-medium mb-2\">แก้ไข: ${f.name}</div>
          <div class=\"grid gap-2\"> 
            <input id=\"m_name\" class=\"border rounded px-3 py-2\" value=\"${f.name}\" />
            <input id=\"m_cat\" class=\"border rounded px-3 py-2\" value=\"${f.cat}\" />
            <input id=\"m_protein\" type=\"number\" step=\"0.1\" class=\"border rounded px-3 py-2\" value=\"${f.protein}\" />
            <input id=\"m_sodium\" type=\"number\" class=\"border rounded px-3 py-2\" value=\"${f.sodium}\" />
            <label class=\"text-xs text-slate-600\">รูปภาพ (แตะเพื่อถ่าย/เลือกรูป)</label>
            <div class=\"flex items-center gap-2\">
              <input id=\"m_image\" type=\"file\" accept=\"image/*\" class=\"border rounded px-2 py-1\" />
              <div class=\"relative\"><img id=\"m_preview\" src=\"${f.image?f.image:`images/${f.id}.jpg`}\" alt=\"preview\" class=\"w-24 h-24 object-cover rounded-md border\" style=\"object-position: ${f.imagePos?`${f.imagePos.x}% ${f.imagePos.y}%`:'center'}\" /></div>
            </div>
              <input id=\"m_image\" type=\"file\" accept=\"image/*\" capture=\"environment\" class=\"border rounded px-2 py-1\" />
              <div class=\"relative\"><img id=\"m_preview\" src=\"${f.image?f.image:`images/${f.id}.jpg`}\" alt=\"preview\" class=\"w-24 h-24 object-cover rounded-md border\" style=\"object-position: ${f.imagePos?`${f.imagePos.x}% ${f.imagePos.y}%`:'center'}\" /></div>
            </div>
            <div class=\"grid grid-cols-2 gap-2 text-xs\">
              <label class=\"text-xs\">Center X</label><label class=\"text-xs\">Center Y</label>
              <input id=\"m_pos_x\" type=\"range\" min=\"0\" max=\"100\" value=\"${f.imagePos?f.imagePos.x:50}\" />
              <input id=\"m_pos_y\" type=\"range\" min=\"0\" max=\"100\" value=\"${f.imagePos?f.imagePos.y:50}\" />
            </div>
            <div class=\"flex gap-2\"><button id=\"m_save\" class=\"btn-primary px-3 py-1\">บันทึก</button><button id=\"m_cancel\" class=\"px-3 py-1 border rounded\">ยกเลิก</button></div>
          </div>
        </div>`;
      const holder = document.createElement('div'); holder.className='fixed inset-0 bg-black/30 flex items-center justify-center z-50'; holder.innerHTML = formHtml;
      document.body.appendChild(holder);
      const inputFileHandler = (file, previewEl, cb)=>{
        if(!file) return cb(null);
        const reader = new FileReader();
        reader.onload = ()=> cb(reader.result);
        reader.readAsDataURL(file);
      };
      const m_image = document.getElementById('m_image');
      const m_preview = document.getElementById('m_preview');
      const m_pos_x = document.getElementById('m_pos_x');
      const m_pos_y = document.getElementById('m_pos_y');
      // update preview object-position from sliders
      const applyPos = ()=>{ m_preview.style.objectPosition = `${m_pos_x.value}% ${m_pos_y.value}%`; };
      m_pos_x.addEventListener('input', applyPos); m_pos_y.addEventListener('input', applyPos);
      // drag to pan: track pointer on preview
      (function(){
        let dragging=false, startX=0, startY=0, startPx=Number(m_pos_x.value), startPy=Number(m_pos_y.value);
        m_preview.addEventListener('pointerdown', (ev)=>{ dragging=true; startX=ev.clientX; startY=ev.clientY; startPx=Number(m_pos_x.value); startPy=Number(m_pos_y.value); m_preview.setPointerCapture(ev.pointerId); });
        window.addEventListener('pointermove', (ev)=>{ if(!dragging) return; const dx = ev.clientX-startX, dy = ev.clientY-startY; // adjust sensitivity
          const rect = m_preview.getBoundingClientRect(); const sens = 100/rect.width; const nx = Math.min(100, Math.max(0, startPx + dx*sens)); const ny = Math.min(100, Math.max(0, startPy + dy*sens)); m_pos_x.value = nx; m_pos_y.value = ny; applyPos(); });
        window.addEventListener('pointerup', (ev)=>{ if(!dragging) return; dragging=false; try{ m_preview.releasePointerCapture(ev.pointerId); }catch(e){} });
      })();
      m_image.addEventListener('change', (ev)=>{
        const ffile = ev.target.files && ev.target.files[0];
        if(!ffile) return;
        const r = new FileReader(); r.onload = ()=> { m_preview.src = r.result; }; r.readAsDataURL(ffile);
      });
      document.getElementById('m_cancel').addEventListener('click', ()=> holder.remove());
      document.getElementById('m_save').addEventListener('click', ()=>{
        const name = document.getElementById('m_name').value.trim();
        const cat = document.getElementById('m_cat').value.trim();
        const protein = Number(document.getElementById('m_protein').value||0);
        const sodium = Number(document.getElementById('m_sodium').value||0);
        const fileInput = document.getElementById('m_image');
        const ffile = fileInput.files && fileInput.files[0];
        const pos = { x: Number(m_pos_x.value||50), y: Number(m_pos_y.value||50) };
            if(ffile){
          inputFileHandler(ffile, m_preview, (dataUrl)=>{
              foods[idx] = { ...foods[idx], name, cat, protein, sodium, image: dataUrl, imagePos: pos };
            // local edits remain in-memory only
              try{ saveManagedFoods(foods); }catch(e){}
              holder.remove();
              renderManageFoods();
              showToast('แก้ไขเฉพาะเครื่องนี้ (ยังไม่ได้ซิงค์กับเซิร์ฟเวอร์)');
          });
        } else {
          // if preview was changed but no new file, capture current preview src
          const currentSrc = m_preview.src;
            foods[idx] = { ...foods[idx], name, cat, protein, sodium, image: currentSrc, imagePos: pos };
            try{ saveManagedFoods(foods); }catch(e){}
            // local edits remain in-memory only
            holder.remove();
            renderManageFoods();
            showToast('แก้ไขเฉพาะเครื่องนี้ (ยังไม่ได้ซิงค์กับเซิร์ฟเวอร์)');
        }
      });
    }
  });

  document.getElementById('clearToday').addEventListener('click', ()=>{
    if(confirm('ลบรายการอาหารของวันนี้ทั้งหมด?')){ state.log = []; try{ saveIntakeForToday(); }catch(e){ saveLog(); } renderDashboard(); }
  });

  document.getElementById('exportCsv').addEventListener('click', ()=>{
    const rows = [['วันที่','ชื่ออาหาร','จำนวน','โปรตีนต่อเสิร์ฟ (g)','โซเดียมต่อเสิร์ฟ (mg)','โปรตีนรวม (g)','โซเดียมรวม (mg)']];
    const d = new Date().toISOString().slice(0,10);
    state.log.forEach(r=> rows.push([d, r.name, r.qty, r.protein, r.sodium, (r.protein*r.qty).toFixed(1), (r.sodium*r.qty)]));
    const csv = rows.map(r=>r.join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ckd_kids_${d}.csv`;
    a.click();
  });

  document.getElementById('addFoodForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const f = {
      id: 'u_'+Date.now(),
      name: document.getElementById('foodName').value.trim(),
      cat: document.getElementById('foodCat').value,
      protein: Number(document.getElementById('foodProtein').value),
      sodium: Number(document.getElementById('foodSodium').value)
    };
    // handle optional image input (read as data URL) and then POST
    const fileInput = document.getElementById('foodImage');
    const file = fileInput && fileInput.files && fileInput.files[0];
    const submitWithImage = (imageDataUrl)=>{
      if(imageDataUrl) f.image = imageDataUrl;
      // Try to POST to server API; if successful, reload server foods. Otherwise keep local-only.
      fetch('/api/foods', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(f) })
      .then(r=> r.ok ? r.json() : Promise.reject(r))
      .then(async json => {
        showToast('เพิ่มอาหารไปยังเซิร์ฟเวอร์แล้ว');
        await loadFoodsFromServer();
        renderFoodList();
      }).catch(err => {
  // fallback: local-only (persist managed foods to IDB)
      f._source = 'local'; foods.push(f); try{ saveManagedFoods(foods); }catch(e){} renderFoodList(); showToast('เพิ่มอาหารในเครื่อง (เซิร์ฟเวอร์ไม่ตอบ)');
      }).finally(()=> e.target.reset());
    };
    if(file){
      const reader = new FileReader();
      reader.onload = ()=> submitWithImage(reader.result);
      reader.readAsDataURL(file);
    } else submitWithImage(null);
  });

  // Preview selected image in the add food form
  const foodImageEl = document.getElementById('foodImage');
  const foodPreview = document.getElementById('foodImagePreview');
  if(foodImageEl && foodPreview){
    foodImageEl.addEventListener('change', (ev)=>{
      const f = ev.target.files && ev.target.files[0];
      if(!f){ foodPreview.classList.add('hidden'); return; }
      const r = new FileReader(); r.onload = ()=>{ foodPreview.src = r.result; foodPreview.classList.remove('hidden'); };
      r.readAsDataURL(f);
    });
  }
}

// Simple toast helper
function showToast(text, ms=2500){
  const container = document.getElementById('toastContainer');
  if(!container) return; 
  const el = document.createElement('div');
  el.className = 'inline-block bg-slate-900 text-white text-sm px-4 py-2 rounded-md shadow pointer-events-auto';
  el.textContent = text;
  container.appendChild(el);
  setTimeout(()=>{ el.classList.add('opacity-0'); el.style.transition='opacity 300ms'; }, ms-300);
  setTimeout(()=>{ try{ container.removeChild(el); }catch(e){} }, ms+100);
}

function registerServiceWorker(){
  if ('serviceWorker' in navigator) {
    // register relative to the current document so scope matches (works on GitHub Pages subpaths)
    const swUrl = './sw.js';
    window.addEventListener('load', async function() {
      try{
        const reg = await navigator.serviceWorker.register(swUrl);
        console.log('SW registered', reg.scope);

        // Listen for updates found (new SW installing)
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if(!installing) return;
          installing.addEventListener('statechange', () => {
            if(installing.state === 'installed'){
              // If there's an active controller, this means a new SW is waiting to activate
              if(navigator.serviceWorker.controller){
                // notify user and request skipWaiting on the waiting worker
                try{ showToast('มีเวอร์ชันใหม่ — โหลดหน้าใหม่เพื่ออัปเดต', 5000); }catch(e){}
                // give user a moment, then ask SW to skipWaiting so it can activate
                setTimeout(()=>{ try{ reg.waiting?.postMessage({ type: 'SKIP_WAITING' }); }catch(e){} }, 1000);
              } else {
                console.log('Service worker installed for the first time (cached).');
              }
            }
          });
        });

        // If a worker is already waiting when the page loads, activate it
        if(reg.waiting){
          try{ showToast('มีเวอร์ชันใหม่อยู่ในคิว — โหลดหน้าใหม่', 5000); }catch(e){}
          try{ reg.waiting.postMessage({ type: 'SKIP_WAITING' }); }catch(e){}
        }

        // When a new SW takes control, reload so the page runs under the new version
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          console.log('New service worker activated, reloading page...');
          try{ window.location.reload(); }catch(e){}
        });

      }catch(err){ console.log('SW reg failed', err); }
    });
  }
}

// PWA install prompt handling removed (install UI not included in demo)

function setupIOSHint(){
  const hint = document.getElementById('iosInstallHint');
  const close = document.getElementById('iosInstallClose');
  const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) && !window.navigator.standalone;
  const hasBeforeInstall = ('onbeforeinstallprompt' in window);
  if(isIOS && !hasBeforeInstall && hint){
    hint.classList.remove('hidden');
  }
  if(close) close.addEventListener('click', ()=> hint && hint.classList.add('hidden'));
}

export async function boot(){
  // initialize IndexedDB and migrate existing data if present
  await initDBAndLoad();
  // load foods from server JSON (server authoritative)
  await loadFoodsFromServer();
  console.log('foods loaded at boot:', foods && foods.length);
  initProfileInputs();
  registerEvents();
  renderDashboard();
  // render past calories/history using the selected range
  const historyRangeEl = document.getElementById('historyRange');
  const historyTitle = document.getElementById('calHistoryTitle');
  function applyHistoryRange(days){
    const d = Number(days) || 7;
    try{ renderPastCalories(d); }catch(e){}
    try{ render30DayHistory(d); }catch(e){}
  // render active chart panel if present
  try{ renderSodiumChart(d); }catch(e){}
  try{ renderProteinChart(d); }catch(e){}
    if(historyTitle) historyTitle.textContent = `ประวัติ ${d} วันล่าสุด`;
  }
  // initial render (use selector value or default 7)
  const initialRange = historyRangeEl ? historyRangeEl.value : '7';
  applyHistoryRange(initialRange);
  // chart tab buttons
  const tabS = document.getElementById('chartTabSodium');
  const tabP = document.getElementById('chartTabProtein');
  const sodiumPanel = document.getElementById('sodiumChart');
  const proteinPanel = document.getElementById('proteinChart');
  function setChartTab(which){
    if(which==='protein'){ tabP.classList.add('bg-slate-50'); tabS.classList.remove('bg-slate-50'); proteinPanel.classList.remove('hidden'); sodiumPanel.classList.add('hidden'); }
    else { tabS.classList.add('bg-slate-50'); tabP.classList.remove('bg-slate-50'); sodiumPanel.classList.remove('hidden'); proteinPanel.classList.add('hidden'); }
  }
  tabS?.addEventListener('click', ()=>{ setChartTab('sodium'); const days = Number(historyRangeEl ? historyRangeEl.value : 7) || 7; try{ renderSodiumChart(days); }catch(e){} });
  tabP?.addEventListener('click', ()=>{ setChartTab('protein'); const days = Number(historyRangeEl ? historyRangeEl.value : 7) || 7; try{ renderProteinChart(days); }catch(e){} });
  // default to sodium
  setChartTab('sodium');
  // listen for changes
  historyRangeEl?.addEventListener('change', (e)=> applyHistoryRange(e.target.value));
  renderFoodList();
  renderManageFoods();
  registerServiceWorker();
  setupIOSHint();

  // DEV: allow regeneration of sample data via ?regen=1 (creates 40 days × 3 meals)
  try{
    const params = new URLSearchParams(location.search);
    if(params.get('regen')==='1'){
      // wipe existing sample logs (optional: keep profile)
      for(let d=1; d<=40; d++){ const dt = new Date(); dt.setDate(dt.getDate()-d); const key='log_'+dt.toISOString().slice(0,10); try{ localStorage.removeItem(key); }catch(e){} }
      await generateDummyHistory(40,3);
    try{ renderPastCalories(40); }catch(e){}
  try{ render30DayHistory(30); }catch(e){}
  try{ renderSodiumChart(30); }catch(e){}
      console.log('regen complete');
    }
  }catch(e){ /* ignore in prod */ }

  // Consent flow: show 'confirm' tab on first run until user accepts
  const consent = LS.load('consent', false);
  if(!consent){
    // open confirm tab
    document.querySelectorAll('.tab').forEach(s=>s.classList.add('hidden'));
    const el = document.getElementById('confirm'); if(el) el.classList.remove('hidden');
    // set active nav button
    document.querySelectorAll('.tabBtn').forEach(b=>{ b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
    const btn = document.querySelector('.tabBtn[data-tab="confirm"]'); if(btn){ btn.classList.add('active'); btn.setAttribute('aria-pressed','true'); }
  }

  // ensure profile inputs are disabled until consent is accepted
  setProfileEnabled(!!consent);
  // within Profile tab, show/hide the profile block based on consent
  try{
    const profileBlock = document.getElementById('profileBlock');
    const consentBoxEl = document.getElementById('consentBox');
    if(profileBlock && consentBoxEl){
  // always show consentBox content; toggle buttons vs status
  const cbProf = document.getElementById('consentButtonsProfile');
  const csProf = document.getElementById('consentStatusProfile');
  if(!!consent){ profileBlock.classList.remove('hidden'); if(cbProf) cbProf.classList.add('hidden'); if(csProf) csProf.classList.remove('hidden'); }
  else { profileBlock.classList.add('hidden'); if(cbProf) cbProf.classList.remove('hidden'); if(csProf) csProf.classList.add('hidden'); }
    }
  }catch(e){ /* ignore */ }

  // unify consent accept/decline across any consent buttons (profile/global)
  const acceptButtons = ['consentAccept','consentAcceptGlobal'];
  const declineButtons = ['consentDecline','consentDeclineGlobal'];
  acceptButtons.forEach(id=> document.getElementById(id)?.addEventListener('click', ()=>{
    LS.save('consent', true);
  // navigate to profile (show profile page for user to edit after consenting)
  document.querySelectorAll('.tab').forEach(s=>s.classList.add('hidden'));
  const prof = document.getElementById('profile'); if(prof) prof.classList.remove('hidden');
  document.querySelectorAll('.tabBtn').forEach(b=>{ b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
  const btn = document.querySelector('.tabBtn[data-tab="profile"]'); if(btn){ btn.classList.add('active'); btn.setAttribute('aria-pressed','true'); }
  // populate inputs
  try{ initProfileInputs(); }catch(e){}
    // enable profile editing once consent accepted
    setProfileEnabled(true);
  // reveal profile block and hide consent box (if present)
    try{ const profileBlock = document.getElementById('profileBlock'); if(profileBlock) profileBlock.classList.remove('hidden'); // toggle buttons/status in both places
      ['Profile','Global'].forEach(loc=>{ const btns = document.getElementById('consentButtons'+loc); const stat = document.getElementById('consentStatus'+loc); const cancel = document.getElementById('consentCancel'+loc); if(btns) btns.classList.add('hidden'); if(stat) stat.classList.remove('hidden'); if(cancel) cancel.classList.remove('hidden'); });
    }catch(e){}
  }));
  declineButtons.forEach(id=> document.getElementById(id)?.addEventListener('click', ()=>{
    alert('การยืนยันจำเป็นต้องใช้งานแอปนี้ต่อ');
  }));
  // Revoke consent handlers (always available where shown)
  const revokeIds = ['consentRevokeProfile','consentCancelProfile'];
  revokeIds.forEach(id=> document.getElementById(id)?.addEventListener('click', ()=>{
    if(!confirm('คุณต้องการถอนการยินยอมหรือไม่? การถอนจะล็อกโปรไฟล์และลบการตั้งค่าบางอย่างออกจากอุปกรณ์นี้')) return;
    try{ LS.save('consent', false); }catch(e){}
    // disable profile inputs and hide profile block
    setProfileEnabled(false);
    try{ const profileBlock = document.getElementById('profileBlock'); if(profileBlock) profileBlock.classList.add('hidden'); }catch(e){}
    // show the global confirm tab so user must re-confirm to use app
    document.querySelectorAll('.tab').forEach(s=>s.classList.add('hidden'));
    const conf = document.getElementById('confirm'); if(conf) conf.classList.remove('hidden');
    document.querySelectorAll('.tabBtn').forEach(b=>{ b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
    const btn = document.querySelector('.tabBtn[data-tab="confirm"]'); if(btn){ btn.classList.add('active'); btn.setAttribute('aria-pressed','true'); }
    // toggle buttons/status UI
    ['Profile','Global'].forEach(loc=>{ const btns = document.getElementById('consentButtons'+loc); const stat = document.getElementById('consentStatus'+loc); const revoke = document.getElementById('consentRevoke'+loc); if(btns) btns.classList.remove('hidden'); if(stat) stat.classList.add('hidden'); if(revoke) revoke.classList.add('hidden'); });
    showToast('ถอนการยินยอมแล้ว');
  }));
  // sample data generation button (in cal30Block)
  document.getElementById('genSampleData')?.addEventListener('click', async ()=>{
    await generateDummyHistory(40,3);
    renderPastCalories(40);
  render30DayHistory(30);
    showToast('สร้างตัวอย่างข้อมูล 40 วัน (3 มื้อ/วัน) แล้ว');
  });

  // Export all IDB data as JSON
  document.getElementById('exportAllBtn')?.addEventListener('click', async ()=>{
    try{
      const all = await exportAllData();
      const blob = new Blob([JSON.stringify(all,null,2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ckd_kids_export_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      showToast('ดาวน์โหลดข้อมูลแล้ว');
    }catch(e){ console.warn('export failed', e); showToast('ส่งออกข้อมูลล้มเหลว'); }
  });

  // Export history for current range as CSV
  document.getElementById('exportHistoryBtn')?.addEventListener('click', async ()=>{
    try{
      const historyRangeEl = document.getElementById('historyRange');
      const days = Number(historyRangeEl ? historyRangeEl.value : 30) || 30;
      const now = new Date();
      const rows = [['วันที่','รหัส','ชื่ออาหาร','จำนวน','โปรตีน (g)','โซเดียม (mg)']];
      for(let d=0; d<days; d++){
        const dt = new Date(now); dt.setDate(now.getDate() - d);
        const dateStr = dt.toISOString().slice(0,10);
        const entries = await getEntriesForDate(dateStr) || [];
        if(entries.length===0){
          rows.push([dateStr,'','','ไม่มีบันทึก','','']);
        } else {
          entries.forEach(r=> rows.push([dateStr, r.id||'', r.name||'', r.qty||'', r.protein||'', r.sodium||'']));
          // daily summary
          const daily = entries.reduce((a,c)=>({ protein: a.protein + (Number(c.protein||0)*(c.qty||1)), sodium: a.sodium + (Number(c.sodium||0)*(c.qty||1)) }), {protein:0, sodium:0});
          rows.push([`รวม ${dateStr}`,'','', '', daily.protein.toFixed(1), Math.round(daily.sodium)]);
        }
      }
      // build CSV
      const csv = rows.map(r=> r.map(c=> '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `ckd_kids_history_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      showToast('ดาวน์โหลดประวัติแล้ว');
    }catch(e){ console.warn('exportHistory failed', e); showToast('ส่งออกประวัติไม่สำเร็จ'); }
  });
}

// Auto-boot when module is loaded
document.addEventListener('DOMContentLoaded', ()=>{ boot().catch(err=>{ console.error('boot failed', err); }); });
