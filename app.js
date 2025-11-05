// Inventory Lite — Browser UI (Local mode + Sheets mode)
const API_URL = 'https://script.google.com/macros/s/AKfycbwEgw9t6PSZhIDPZQWHyK5qAEfOppecC--CHvs5Gn5xQOSH7xZH4qWfvfgUIDZmGWIn-g/exec';          // <-- paste Apps Script deployment URL
const TOKEN   = 'api_key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJpbnZlbnRvcnlfc2NvcGUiOiJhZG1pbiJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';   // <-- must match CONFIG.TOKEN on server

const MODE_KEY = 'inv_mode';
let MODE = localStorage.getItem(MODE_KEY) || 'local'; // 'local' | 'sheets'
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const headers = ['id','tag','type','model','serial','owner','location','status','purchase_date','warranty_end','notes'];

function setMode(m){
  MODE = m; localStorage.setItem(MODE_KEY, m);
  $('#mode-label').textContent = m === 'local' ? 'Local' : 'Sheets';
}
setMode(MODE);

// ------ Local store helpers ------
function getLocal(){
  return JSON.parse(localStorage.getItem('assets')||'[]');
}
function setLocal(arr){
  localStorage.setItem('assets', JSON.stringify(arr));
}

// ------ API helpers ------
async function apiList({query='', tag=''}={}){
  const url = new URL(API_URL);
  url.searchParams.set('token', TOKEN);
  if(query) url.searchParams.set('query', query);
  if(tag)   url.searchParams.set('tag', tag);
  const res = await fetch(url, {method:'GET'});
  const json = await res.json();
  if(!json.ok) throw new Error(json.error||'api_error');
  return json.items;
}
async function apiCreate(asset){
  const res = await fetch(API_URL, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body: JSON.stringify({action:'create', asset, token:TOKEN})
  });
  const json = await res.json();
  if(!json.ok) throw new Error(json.error||'api_error');
  return json.id;
}
async function apiUpdate(asset){
  const res = await fetch(API_URL, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body: JSON.stringify({action:'update', asset, token:TOKEN})
  });
  const json = await res.json();
  if(!json.ok) throw new Error(json.error||'api_error');
  return true;
}

// ------ UI logic ------
async function listRender(){
  const q = $('#search').value.trim();
  let items = [];
  if(MODE === 'local'){
    const qLower = q.toLowerCase();
    items = getLocal().filter(a => {
      if(!q) return true;
      // Search across relevant fields instead of stringifying entire object
      return (a.tag||'').toLowerCase().includes(qLower) ||
             (a.type||'').toLowerCase().includes(qLower) ||
             (a.model||'').toLowerCase().includes(qLower) ||
             (a.serial||'').toLowerCase().includes(qLower) ||
             (a.owner||'').toLowerCase().includes(qLower) ||
             (a.location||'').toLowerCase().includes(qLower) ||
             (a.status||'').toLowerCase().includes(qLower) ||
             (a.notes||'').toLowerCase().includes(qLower);
    });
  } else {
    try { items = await apiList({query:q}); } catch(e){ alert('API error: '+e.message); }
  }

  const tb = $('#grid tbody');
  const fragment = document.createDocumentFragment();
  
  items.forEach(a=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(a.tag||'')}</td>
      <td>${esc(a.type||'')}</td>
      <td>${esc(a.model||'')}</td>
      <td>${esc(a.serial||'')}</td>
      <td>${esc(a.owner||'')}</td>
      <td>${esc(a.location||'')}</td>
      <td>${esc(a.status||'')}</td>
      <td>${esc(a.warranty_end||'')}</td>
      <td>${esc(a.notes||'')}</td>
      <td>
        <button data-act="qr" data-tag="${esc(a.tag||'')}">QR</button>
        ${MODE==='local' ? `<button data-act="del" data-id="${esc(a.id||'')}">Delete</button>` : ''}
      </td>`;
    fragment.appendChild(tr);
  });
  
  // Clear and append all at once for better performance
  tb.innerHTML = '';
  tb.appendChild(fragment);
}

function collectAsset(){
  const asset = {};
  headers.forEach(h => asset[h] = '');
  asset.tag = $('#tag').value.trim();
  if(!asset.tag) { alert('Tag is required'); return null; }
  asset.type = $('#type').value.trim();
  asset.model = $('#model').value.trim();
  asset.serial = $('#serial').value.trim();
  asset.owner = $('#owner').value.trim();
  asset.location = $('#location').value.trim();
  asset.status = $('#status').value;
  asset.purchase_date = $('#purchase_date').value;
  asset.warranty_end = $('#warranty_end').value;
  asset.notes = $('#notes').value.trim();
  return asset;
}

$('#add').addEventListener('click', async ()=>{
  const asset = collectAsset(); if(!asset) return;
  try{
    if(MODE === 'local'){
      const arr = getLocal();
      asset.id = crypto.randomUUID();
      arr.push(asset); setLocal(arr);
    } else {
      // server will assign UUID if absent
      await apiCreate(asset);
    }
    clearAddForm();
    await listRender();
  }catch(e){ alert('Failed to add: '+e.message); }
});

function clearAddForm(){
  ['tag','type','model','serial','owner','location','purchase_date','warranty_end','notes'].forEach(id => { const el=$( '#'+id ); if(el) el.value=''; });
  $('#status').value = 'In Service';
  $('#qr').innerHTML = '';
}

// QR for tag as-you-type
let qrObj;
$('#tag').addEventListener('input', ()=>{
  const v = $('#tag').value.trim();
  const qrContainer = $('#qr');
  
  // Clear existing QR code
  qrContainer.innerHTML='';
  if(qrObj) qrObj.clear();
  qrObj = null;
  
  if(!v) return;
  qrObj = new QRCode(qrContainer, {text:v, width:96, height:96});
});

// Delete (local only) & show QR buttons
$('#grid').addEventListener('click', (e)=>{
  const btn = e.target.closest('button'); if(!btn) return;
  const act = btn.getAttribute('data-act');
  if(act === 'del' && MODE==='local'){
    const id = btn.getAttribute('data-id');
    const arr = getLocal().filter(a => a.id !== id);
    setLocal(arr); listRender();
  }
  if(act === 'qr'){
    const tag = btn.getAttribute('data-tag');
    if(tag){ $('#tag').value = tag; $('#tag').dispatchEvent(new Event('input')); window.scrollTo({top:0, behavior:'smooth'}); }
  }
});

// Search
let searchTimeout;
$('#search').addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(listRender, 300); // Debounce search by 300ms
});

// Mode toggle
$('#toggle-mode').addEventListener('click', async ()=>{
  setMode(MODE === 'local' ? 'sheets' : 'local');
  await listRender();
});

// Import/Export
$('#export-csv').addEventListener('click', ()=>{
  const items = MODE==='local' ? getLocal() : []; // export local set
  const csv = toCSV(items, headers);
  download('assets.csv', csv, 'text/csv');
});
$('#import-json').addEventListener('click', async ()=>{
  const text = prompt('Paste JSON array of assets'); if(!text) return;
  try {
    const arr = JSON.parse(text);
    if(!Array.isArray(arr)) throw new Error('Not an array');
    if(MODE==='local'){ setLocal(arr); await listRender(); }
    else alert('Import only supported in Local mode for demo');
  }catch(e){ alert('Import failed: '+e.message); }
});

// QR Scan
$('#scan').addEventListener('click', async ()=>{
  const video = $('#video');
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'environment' }});
    video.srcObject = stream; video.style.display='block'; await video.play();
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
    
    let lastScanTime = 0;
    const scanInterval = 250; // Scan every 250ms instead of every frame
    
    (function loop(){
      const now = Date.now();
      if(video.readyState === video.HAVE_ENOUGH_DATA && now - lastScanTime >= scanInterval){
        lastScanTime = now;
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, canvas.width, canvas.height);
        if(code && code.data){
          // Fill search by tag, stop stream
          $('#search').value = code.data;
          listRender();
          stream.getTracks().forEach(t=>t.stop());
          video.style.display='none';
          return;
        }
      }
      requestAnimationFrame(loop);
    })();
  }catch(e){ alert('Camera error: '+e.message); }
});

// Helpers
function esc(s){ return (s||'').replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function toCSV(items, cols){
  const head = cols.join(',');
  const rows = items.map(o => cols.map(k => csvCell(o[k])).join(','));
  return [head, ...rows].join('\n');
}
function csvCell(v){
  if(v==null) return '';
  const s=String(v).replace(/"/g,'""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}
function download(name, text, type){
  const a=document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type}));
  a.download = name; a.click();
}

// boot
listRender();
