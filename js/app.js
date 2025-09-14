import { LS, state, foods, saveLog, todayKey } from './data.js';
import { renderDashboard, renderFoodList } from './ui.js';

function initProfileInputs(){
  const p = state.profile;
  document.getElementById('p_name').value = p.name || '';
  document.getElementById('p_age').value = p.age ?? '';
  document.getElementById('p_weight').value = p.weight ?? '';
  document.getElementById('p_ckd').value = p.ckd || '2';
}

function registerEvents(){
  document.querySelectorAll('.tabBtn').forEach(btn=>btn.addEventListener('click', ()=>{
    const target = btn.dataset.tab;
    document.querySelectorAll('.tab').forEach(s=>s.classList.add('hidden'));
    document.getElementById(target).classList.remove('hidden');
    if(target==='food') renderFoodList();
    if(target==='dashboard') renderDashboard();
  }));

  document.getElementById('profileForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    state.profile = {
      name: document.getElementById('p_name').value.trim(),
      age: Number(document.getElementById('p_age').value),
      weight: Number(document.getElementById('p_weight').value),
      ckd: document.getElementById('p_ckd').value
    };
    LS.save('profile', state.profile);
    renderDashboard();
    alert('บันทึกโปรไฟล์แล้ว');
  });

  document.getElementById('resetAll').addEventListener('click', ()=>{
    if(confirm('ลบข้อมูลทั้งหมด (โปรไฟล์ อาหาร ที่บันทึกวันนี้)?')){ localStorage.clear(); location.reload(); }
  });

  document.getElementById('food').addEventListener('click', (e)=>{
    if(e.target.classList.contains('add')){
      const id = e.target.dataset.id;
      const card = e.target.closest('div');
      const qty = Number(card.querySelector('.qty').value || 1);
      const item = foods.find(f=>f.id===id);
      state.log.push({ name: item.name, protein: item.protein, sodium: item.sodium, qty });
      saveLog();
      renderDashboard();
      alert('เพิ่มในมื้อวันนี้แล้ว');
    }
  });

  document.getElementById('search').addEventListener('input', renderFoodList);
  document.getElementById('categoryFilter').addEventListener('change', renderFoodList);

  document.getElementById('todayList').addEventListener('click', (e)=>{
    const idx = Number(e.target.dataset.idx);
    const act = e.target.dataset.act;
    if(act==='del'){ state.log.splice(idx,1); }
    if(act==='plus'){ state.log[idx].qty++; }
    if(act==='minus'){ state.log[idx].qty = Math.max(1, state.log[idx].qty-1); }
    saveLog();
    renderDashboard();
  });

  document.getElementById('clearToday').addEventListener('click', ()=>{
    if(confirm('ลบรายการอาหารของวันนี้ทั้งหมด?')){ state.log = []; saveLog(); renderDashboard(); }
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
    foods.push(f);
    LS.save('foods', foods);
    e.target.reset();
    alert('เพิ่มอาหารแล้ว');
    renderFoodList();
  });
}

function registerServiceWorker(){
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/sw.js').then(function(reg){
        console.log('SW registered', reg.scope);
      }).catch(function(err){ console.log('SW reg failed', err); });
    });
  }
}

// PWA install prompt handling
let deferredPrompt = null;
function setupInstallPrompt(){
  const btn = document.getElementById('installBtn');
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault();
    deferredPrompt = e;
    if(btn) btn.classList.remove('hidden');
  });
  if(btn) btn.addEventListener('click', async ()=>{
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    console.log('PWA install choice', choice.outcome);
    deferredPrompt = null;
    btn.classList.add('hidden');
  });
}

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

export function boot(){
  initProfileInputs();
  registerEvents();
  renderDashboard();
  renderFoodList();
  registerServiceWorker();
  setupInstallPrompt();
  setupIOSHint();
}

// Auto-boot when module is loaded
document.addEventListener('DOMContentLoaded', boot);
