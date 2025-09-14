// Simple express server to serve static site and allow appending foods to food-db.json
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'food-db.json');

app.use(bodyParser.json({ limit: '2mb' }));
app.use(express.static(__dirname));

app.post('/api/foods', (req, res) => {
  const f = req.body;
  if(!f || !f.name) return res.status(400).json({ error: 'invalid' });
  // sanitize minimal fields
  const newFood = {
    id: f.id || ('s_' + Date.now()),
    name: String(f.name).trim(),
    cat: f.cat || 'อื่นๆ',
    protein: Number(f.protein) || 0,
    sodium: Number(f.sodium) || 0,
    _source: 'server'
  };
  fs.readFile(DATA_FILE, 'utf8', (err, data)=>{
    let arr = [];
    if(!err){
      try{ arr = JSON.parse(data); }catch(e){ arr = []; }
    }
    arr.push(newFood);
    fs.writeFile(DATA_FILE, JSON.stringify(arr, null, 2), 'utf8', (err2)=>{
      if(err2) return res.status(500).json({ error: 'write_failed' });
      res.json({ ok: true, item: newFood });
    });
  });
});

app.listen(PORT, ()=> console.log('Server started on', PORT));
