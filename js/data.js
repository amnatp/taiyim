// data.js - storage and data model
// Lightweight storage shim that keeps synchronous localStorage access for
// older code but also persists to IndexedDB (async) and supports clearing both.
export const LS = {
  load: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  save: (k, v) => {
    try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){}
    // async persist to idb (fire-and-forget)
    try{ const s = JSON.stringify(v); idbSet(k, s).catch(()=>{}); }catch(e){}
  },
  // clear both localStorage and idb
  clearAll: async () => { try{ localStorage.clear(); }catch(e){}; try{ await idbClear(); }catch(e){} }
};

export const todayKey = () => 'log_'+new Date().toISOString().slice(0,10);

// new unified intake log key (single JSON object containing per-day arrays)
export const INTAKE_KEY = 'intake_log';
export const MANAGED_FOODS_KEY = 'foods_local';

export const defaultFoods = null; // foods are now provided by server-side JSON

// foods will be fetched from server at boot; keep a local in-memory array
export let foods = [];

// Note: local-only foods are not persisted to IndexedDB; server is authoritative for food list

export const state = {
  profile: LS.load('profile', { name: '', age: null, weight: null, ckd: '2' }),
  log: LS.load(todayKey(), [])
};

// --- Nutrition target helpers ---
export function calcAgeYears(dobStr){
  if(!dobStr) return null;
  try{
    const dob = new Date(dobStr);
    if(isNaN(dob)) return null;
    const now = new Date();
    let years = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if(m < 0 || (m === 0 && now.getDate() < dob.getDate())) years--;
    return years;
  }catch(e){ return null; }
}

// === Sodium RNI by age (mg/day) — simplified Thai DRI style bands ===
export function sodiumRniByAge(age){
  if(age==null) return 1500;
  if (age < 1) return 550;
  if (age <= 3) return 675;
  if (age <= 5) return 900;
  if (age <= 8) return 950;
  if (age <= 12) return 1175;
  if (age <= 15) return 1500;
  return 1600;
}

// simple protein DRIs (grams per day) — approximate baseline per age
export function proteinDriByAge(age){
  // approximate absolute protein requirement (g/day) for a reference 20kg toddler -> scaled by age
  // We'll compute as weight-based elsewhere; here return a typical per-day baseline (fallback)
  if(age==null) return 30;
  if(age < 1) return 11; // infant
  if(age <= 3) return 13;
  if(age <= 6) return 19;
  if(age <= 12) return 34;
  if(age <= 14) return 46;
  return 50; // adolescent/adult baseline
}

// compute per-day protein/sodium targets given age (years) and CKD stage
const CKD_RULE = {
  '2': { pMin: 1.00, pMax: 1.40, NaCap: null },
  '3': { pMin: 1.00, pMax: 1.20, NaCap: 3000 },
  '4': { pMin: 1.00, pMax: 1.00, NaCap: 2000 },
  '5': { pMin: 1.20, pMax: 1.40, NaCap: 2000 }
};

export function computeTargets(age, ckdStage, weightKg){
  // prefer weight-based protein when weight provided; otherwise use proteinDriByAge fallback
  const rule = CKD_RULE[String(ckdStage)] || CKD_RULE['2'];
  let proteinMin = null, proteinMax = null;
  if(weightKg){
    // choose per-kg multipliers using ranges similar to proteinRangePerKg in ui/data
    function proteinRangePerKg(age){
      if (age <= 0.9) return [1.1, 1.57];
      if (age <= 1.1) return [0.9, 1.21];
      if (age <= 3) return [0.9, 1.21];
      if (age <= 6) return [0.85, 1.03];
      if (age <= 12) return [0.9, 1.09];
      if (age <= 14) return [0.8, 1.07];
      return [0.8, 1.02];
    }
    const pr = proteinRangePerKg(age==null?14:age);
    proteinMin = +(weightKg * pr[0] * rule.pMin).toFixed(1);
    proteinMax = +(weightKg * pr[1] * rule.pMax).toFixed(1);
  } else {
    const baseline = proteinDriByAge(age);
    proteinMin = +(baseline * rule.pMin).toFixed(1);
    proteinMax = +(baseline * rule.pMax).toFixed(1);
  }
  const sodiumMax = rule.NaCap ?? sodiumRniByAge(age);
  return { proteinMin, proteinMax, sodiumMax };
}

// Compute eGFR: prefer bedside Schwartz for children (eGFR ml/min/1.73m2) when height cm and Scr mg/dL provided.
export function computeEgfr({ age=null, heightCm=null, scr=null, sex=null }){
  // use bedside Schwartz-style formula with k constant depending on age/sex
  try{
    const s = Number(scr);
    const h = Number(heightCm);
    if(!s || !h) return null;
    // choose k: infants ~0.45, children 1-13 ~0.55, adolescent males ~0.70
    let k = 0.413; // fallback
    if(age != null){
      if(age < 1) k = 0.45;
      else if(age <= 13) k = 0.55;
      else {
        // adolescent: prefer sex-specific: male 0.70, female 0.55
        if(sex==='male') k = 0.70; else k = 0.55;
      }
    }
    const egfr = k * h / s;
    return Math.round(egfr*10)/10;
  }catch(e){ return null; }
}

export function saveLog(){ LS.save(todayKey(), state.log); }

// Save today's state.log into the unified intake model as well (keeps legacy per-day key too)
export async function saveIntakeForToday(){
  try{
    // ensure legacy per-day key is saved
    LS.save(todayKey(), state.log);
    // load existing intake_log
    let intake = LS.load(INTAKE_KEY, null);
    if(!intake || !Array.isArray(intake.intakes)) intake = { intakes: [] };
    const today = new Date().toISOString().slice(0,10);
    const idx = intake.intakes.findIndex(x=>x.date===today);
    // compute per-day limits from current profile
    const profAge = Number(state.profile.age || 0);
    const profWeight = Number(state.profile.weight || 0);
    // protein range per kg (approx, copy of UI logic)
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
    const pRange = proteinRangePerKg(profAge);
    const pMaxPerKg = pRange[1] || pRange[0] || 1.0;
    const pMax = profWeight ? profWeight * pMaxPerKg : null;
    const sRange = sodiumRange(profAge);
    const sMax = sRange ? sRange[1] : null;
    const payload = { date: today, protein_g_limit: pMax ? Math.round(pMax*100)/100 : null, sodium_mg_limit: sMax || null, intake: state.log.map(r=>({ id: r.id || null, name: r.name, qty: r.qty || 1, protein_g: Number(r.protein||0), sodium_mg: Number(r.sodium||0), ts: r.ts || null, src: r.src || r._source || null })) };
    if(idx>=0) intake.intakes[idx] = payload; else intake.intakes.push(payload);
    // keep entries sorted descending by date (most recent first)
    intake.intakes.sort((a,b)=> b.date.localeCompare(a.date));
    LS.save(INTAKE_KEY, intake);
    try{ await idbSet(INTAKE_KEY, JSON.stringify(intake)); }catch(e){}
    return true;
  }catch(e){ console.warn('saveIntakeForToday failed', e); return false; }
}

// Persist profile to LS and IDB
export async function saveProfile(profile){
  try{ LS.save('profile', profile); await idbSet('profile', JSON.stringify(profile)); return true;}catch(e){ console.warn('saveProfile failed', e); return false; }
}

// Persist managed foods (local-only edits) to IDB
export async function saveManagedFoods(arr){
  try{ const v = JSON.stringify(arr || []); LS.save(MANAGED_FOODS_KEY, arr || []); await idbSet(MANAGED_FOODS_KEY, v); return true; }catch(e){ console.warn('saveManagedFoods failed', e); return false; }
}

// Persist intake_log to LS and IDB
export async function saveIntakeLog(intake){
  try{
    // ensure each intake entry includes per-day limits (best-effort)
    const profAge = Number(state.profile.age || 0);
    const profWeight = Number(state.profile.weight || 0);
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
    const pRange = proteinRangePerKg(profAge);
    const pMaxPerKg = pRange[1] || pRange[0] || 1.0;
    const pMax = profWeight ? profWeight * pMaxPerKg : null;
    const sRange = sodiumRange(profAge);
    const sMax = sRange ? sRange[1] : null;
    if(intake && Array.isArray(intake.intakes)){
      intake.intakes = intake.intakes.map(it=> ({ ...it, protein_g_limit: it.protein_g_limit ?? (pMax ? Math.round(pMax*100)/100 : null), sodium_mg_limit: it.sodium_mg_limit ?? sMax }));
    }
    const v = JSON.stringify(intake);
    LS.save(INTAKE_KEY, intake);
    await idbSet(INTAKE_KEY, v);
    return true;
  }catch(e){ console.warn('saveIntakeLog failed', e); return false; }
}

// Persist per-day legacy key to LS and IDB
export async function savePerDayKey(key, arr){
  try{ const v = JSON.stringify(arr || []); LS.save(key, arr || []); await idbSet(key, v); return true; }catch(e){ console.warn('savePerDayKey failed', e); return false; }
}

// ---------------------- IndexedDB helpers ----------------------
const DB_NAME = 'ckd_kids_db';
const DB_STORE = 'kv';
let _db = null;

function openDb(){
  return new Promise((resolve, reject)=>{
    if(_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e)=>{
      const db = e.target.result;
      if(!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = (e)=>{ _db = e.target.result; resolve(_db); };
    req.onerror = (e)=> reject(e.target.error || new Error('IDB open failed'));
  });
}

async function idbSet(key, value){
  const db = await openDb();
  return new Promise((res, rej)=>{
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const r = store.put(value, key);
    r.onsuccess = ()=> res(true);
    r.onerror = ()=> rej(r.error || new Error('idb put fail'));
  });
}

async function idbGet(key){
  const db = await openDb();
  return new Promise((res, rej)=>{
    const tx = db.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const r = store.get(key);
    r.onsuccess = ()=> res(r.result ?? null);
    r.onerror = ()=> rej(r.error || new Error('idb get fail'));
  });
}


async function idbClear(){
  const db = await openDb();
  return new Promise((res, rej)=>{
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const r = store.clear();
    r.onsuccess = ()=> res(true);
    r.onerror = ()=> rej(r.error || new Error('idb clear fail'));
  });
}

// Read all key/value pairs from the IDB store and return parsed object
export async function exportAllData(){
  const result = {};
  try{
    const db = await openDb();
    const tx = db.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const keysReq = store.getAllKeys();
    const keys = await new Promise((res, rej)=>{ keysReq.onsuccess=()=>res(keysReq.result||[]); keysReq.onerror=()=>rej(keysReq.error||new Error('idb keys fail')); });
    for(const k of keys){
      try{
        const raw = await idbGet(k);
        if(raw==null) continue;
        try{ result[k] = JSON.parse(raw); }catch(e){ result[k] = raw; }
      }catch(e){}
    }
  }catch(e){ console.warn('exportAllData failed', e); }
  return result;
}

// Initialize DB and migrate existing values (if any) into memory/localStorage.
export async function initDBAndLoad(){
  try{
    await openDb();
  }catch(e){ console.warn('IndexedDB not available', e); return; }
  try{
  // keys we care about (don't migrate foods from storage; server is authoritative)
  const keys = ['foods_inited', 'profile', todayKey()];
    for(const k of keys){
      try{
        const v = await idbGet(k);
        if(v!=null){
          // v is stored as JSON string in our usage
          try{
            const parsed = JSON.parse(v);
            localStorage.setItem(k, v);
            // apply into in-memory exported vars where appropriate
            if(k==='profile') { state.profile = parsed; }
            if(k===todayKey()){ state.log = parsed; }
            if(k==='foods_inited') { /* noop */ }
            // local_foods intentionally not migrated
          }catch(e){ /* ignore parse errors */ }
        }
      }catch(e){ /* ignore per-key errors */ }
    }
    // don't override server-provided foods; only ensure profile/log keys are consistent
    // additionally load unified intake_log and managed foods from IDB into localStorage for sync
    try{
      const intakeRaw = await idbGet(INTAKE_KEY);
      if(intakeRaw != null){
        try{ JSON.parse(intakeRaw); localStorage.setItem(INTAKE_KEY, intakeRaw); }catch(e){}
      }
    }catch(e){}
    try{
      const managedRaw = await idbGet(MANAGED_FOODS_KEY);
      if(managedRaw != null){
        try{ const parsed = JSON.parse(managedRaw); localStorage.setItem(MANAGED_FOODS_KEY, managedRaw); }catch(e){}
      }
    }catch(e){}
  }catch(e){ console.warn('initDBAndLoad failed', e); }
}

// Fetch food list from server-provided JSON file
export async function loadFoodsFromServer(){
  try{
  const res = await fetch('/taiyim/food-db.json', { cache: 'no-cache' });
    if(!res.ok) throw new Error('fetch failed');
    const j = await res.json();
  if(Array.isArray(j)) foods = j.map(it => ({...it, _source:'server'}));
  // merge any managed local foods saved in IDB/localStorage (local edits should override server by id)
  try{
    const localRaw = await idbGet(MANAGED_FOODS_KEY);
    let localArr = null;
    if(localRaw) localArr = JSON.parse(localRaw);
    else localArr = LS.load(MANAGED_FOODS_KEY, null);
    if(Array.isArray(localArr) && localArr.length>0){
      // create map of server foods by id
      const map = new Map(foods.map(f=>[f.id, f]));
      localArr.forEach(l=>{ map.set(l.id, {...(map.get(l.id)||{}), ...l, _source: l._source||'local'}); });
      foods = Array.from(map.values());
    }
  }catch(e){}
  }catch(e){
    console.warn('loadFoodsFromServer failed, falling back to small defaults', e);
    foods = [
      { id: 'rice', name: 'ข้าวสวย 1 ทัพพี', cat: 'อาหารจานหลัก', protein: 2.0, sodium: 2, _source:'server' },
      { id: 'chicken_boil', name: 'ไก่ต้ม 50 กรัม', cat: 'อาหารจานหลัก', protein: 11.0, sodium: 50, _source:'server' }
    ];
  }
}

// Utility: generate dummy history entries for testing
export async function generateDummyHistory(days = 40, perDay = 3){
  if(!Array.isArray(foods) || foods.length===0) await loadFoodsFromServer();
  const pick = (arr)=> arr[Math.floor(Math.random()*arr.length)];
  const now = new Date();
  for(let d=1; d<=days; d++){
    const date = new Date(now);
    date.setDate(now.getDate() - d);
    const key = 'log_'+date.toISOString().slice(0,10);
    const entries = [];
    for(let i=0;i<perDay;i++){
      const f = pick(foods);
      const qty = 1 + Math.floor(Math.random()*2); // 1-2
      // include id so history rows can reference the original food
      entries.push({ id: f.id, name: f.name, protein: f.protein, sodium: f.sodium, qty, ts: date.toISOString(), src: f._source||'server' });
    }
  try{ await savePerDayKey(key, entries); }catch(e){}
  }
  // After generating legacy per-day keys, migrate to unified intake_log format
  try{ await migrateLegacyToIntakeLog(); }catch(e){ /* ignore */ }
  return true;
}

// Expose helper for console use
if(typeof window !== 'undefined') window.generateDummyHistory = generateDummyHistory;

// ---------------------- Migration / unified intake helpers ----------------------
// Build intake_log from existing per-day 'log_YYYY-MM-DD' keys (localStorage and IndexedDB)
export async function migrateLegacyToIntakeLog(){
  try{
    const intake = { intakes: [] };
    // scan localStorage keys for 'log_YYYY-MM-DD'
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(!k) continue;
      if(/^log_\d{4}-\d{2}-\d{2}$/.test(k)){
        try{
          const raw = localStorage.getItem(k);
          if(!raw) continue;
          const arr = JSON.parse(raw) || [];
          const date = k.slice(4);
          // derive limits from current profile (best-effort; profile may have changed since that day)
          const age = Number(state.profile.age || 0);
          const weight = Number(state.profile.weight || 0);
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
          const pRange = proteinRangePerKg(age);
          const pMaxPerKg = pRange[1] || pRange[0] || 1.0;
          const pMax = weight ? weight * pMaxPerKg : null;
          const sRange = sodiumRange(age);
          const sMax = sRange ? sRange[1] : null;
          intake.intakes.push({ date, protein_g_limit: pMax ? Math.round(pMax*100)/100 : null, sodium_mg_limit: sMax || null, intake: arr.map(r=>({ id: r.id||null, name: r.name, qty: r.qty||1, protein_g: Number(r.protein||0), sodium_mg: Number(r.sodium||0), ts: r.ts||null, src: r.src||r._source||null })) });
        }catch(e){ /* ignore per-key parse issues */ }
      }
    }
    // sort most-recent first
    intake.intakes.sort((a,b)=> b.date.localeCompare(a.date));
    // merge with any existing intake_log (prefer existing intake_log entries to avoid duplication)
    const existing = LS.load(INTAKE_KEY, null);
    if(existing && Array.isArray(existing.intakes)){
      // create map keyed by date
      const map = new Map();
      existing.intakes.concat(intake.intakes).forEach(it=>{ map.set(it.date, it); });
      const merged = Array.from(map.values()).sort((a,b)=> b.date.localeCompare(a.date));
      intake.intakes = merged;
    }
    LS.save(INTAKE_KEY, intake);
    try{ await idbSet(INTAKE_KEY, JSON.stringify(intake)); }catch(e){}
    // also ensure today's state.log reflects intake_log if present
    const today = new Date().toISOString().slice(0,10);
    const todayEntry = intake.intakes.find(x=>x.date===today);
    if(todayEntry) state.log = todayEntry.intake.map(r=>({ id: r.id, name: r.name, protein: r.protein_g || r.protein || 0, sodium: r.sodium_mg || r.sodium || 0, qty: r.qty || 1, ts: r.ts || null, src: r.src || null }));
    return true;
  }catch(e){ console.warn('migrateLegacyToIntakeLog failed', e); return false; }
}

// ---------------------- Read helpers (IDB-first) ----------------------
// Return parsed intake_log object { intakes: [ { date, intake: [...] } ] }
export async function getIntakeLog(){
  try{
    const raw = await idbGet(INTAKE_KEY);
    if(raw) return JSON.parse(raw);
  }catch(e){ /* ignore */ }
  // fallback to localStorage
  try{ return LS.load(INTAKE_KEY, { intakes: [] }); }catch(e){ return { intakes: [] }; }
}

// Return array of entries for a given date string 'YYYY-MM-DD'
export async function getEntriesForDate(dateStr){
  try{
    // prefer unified intake_log in idb
    const intake = await getIntakeLog();
    if(intake && Array.isArray(intake.intakes)){
      const found = intake.intakes.find(x=>x.date===dateStr);
      if(found && Array.isArray(found.intake)){
        // map to legacy record shape used elsewhere
        return found.intake.map(r=>({ id: r.id||'', name: r.name||'', protein: r.protein_g || r.protein || 0, sodium: r.sodium_mg || r.sodium || 0, qty: r.qty || 1, ts: r.ts||null, src: r.src||null }));
      }
    }
  }catch(e){ /* ignore */ }
  // fallback: read per-day key from idb then localStorage
  const key = 'log_'+dateStr;
  try{
    const raw = await idbGet(key);
    if(raw) return JSON.parse(raw);
  }catch(e){ /* ignore */ }
  try{ return JSON.parse(localStorage.getItem(key)) || []; }catch(e){ return []; }
}

// Return the full intake record for a date (may include protein_g_limit, sodium_mg_limit)
export async function getIntakeForDate(dateStr){
  try{
    const intake = await getIntakeLog();
    if(intake && Array.isArray(intake.intakes)){
      const found = intake.intakes.find(x=>x.date===dateStr);
      if(found) return found;
    }
  }catch(e){}
  // fallback to per-day key shape (no limits)
  try{
    const raw = await idbGet('log_'+dateStr);
    if(raw) return { date: dateStr, intake: JSON.parse(raw), protein_g_limit: null, sodium_mg_limit: null };
  }catch(e){}
  try{ const ls = JSON.parse(localStorage.getItem('log_'+dateStr) || '[]'); return { date: dateStr, intake: ls, protein_g_limit: null, sodium_mg_limit: null }; }catch(e){ return { date: dateStr, intake: [], protein_g_limit: null, sodium_mg_limit: null }; }
}
