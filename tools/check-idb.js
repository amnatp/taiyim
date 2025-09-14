const puppeteer = require('puppeteer');
(async ()=>{
  const url = 'http://127.0.0.1:8000/';
  const browser = await puppeteer.launch({headless:true, args:['--no-sandbox']});
  const page = await browser.newPage();
  await page.goto(url, {waitUntil:'networkidle2'});
  // Submit profile
  await page.evaluate(()=>{
    document.getElementById('p_name').value='AutoTest';
    document.getElementById('p_age').value='9';
    document.getElementById('p_weight').value='28';
    document.getElementById('p_ckd').value='2';
    document.getElementById('profileForm').dispatchEvent(new Event('submit',{bubbles:true}));
  });
  // Add a food
  await page.evaluate(()=>{
    document.getElementById('foodName').value='AutoSnack';
    document.getElementById('foodCat').value='อาหารว่าง';
    document.getElementById('foodProtein').value='1.5';
    document.getElementById('foodSodium').value='10';
    document.getElementById('addFoodForm').dispatchEvent(new Event('submit',{bubbles:true}));
  });
  // wait for async idb writes
  await page.waitForTimeout(800);
  // read IDB
  const profile = await page.evaluate(async ()=>{
    const open = indexedDB.open('ckd_kids_db');
    const db = await new Promise((res, rej)=>{ open.onsuccess = e=>res(e.target.result); open.onerror = e=>rej(e); });
    return await new Promise((res, rej)=>{
      const tx = db.transaction('kv','readonly'); const store = tx.objectStore('kv');
      const r = store.get('profile'); r.onsuccess = ()=>res(r.result ? JSON.parse(r.result) : null); r.onerror = ()=>rej(r.error);
    });
  });
  const foods = await page.evaluate(async ()=>{
    const open = indexedDB.open('ckd_kids_db');
    const db = await new Promise((res, rej)=>{ open.onsuccess = e=>res(e.target.result); open.onerror = e=>rej(e); });
    return await new Promise((res, rej)=>{
      const tx = db.transaction('kv','readonly'); const store = tx.objectStore('kv');
      const r = store.get('foods'); r.onsuccess = ()=>res(r.result ? JSON.parse(r.result) : null); r.onerror = ()=>rej(r.error);
    });
  });
  console.log('Profile from IDB:', profile);
  console.log('Foods length from IDB:', Array.isArray(foods)?foods.length:0);
  if(Array.isArray(foods)) console.log('Last food:', foods[foods.length-1]);
  await browser.close();
})();
