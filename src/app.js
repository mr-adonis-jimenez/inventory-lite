/* Why: safer CSV/JSON, settings, stats, barcode scan, and robust flows. */
import { DB } from './db.js';

function uid() { return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()); }
function nowIso() { return new Date().toISOString(); }
function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c])); }
function sanitize(str) { return (str || '').trim(); }

function fmtMoney(n, cur='$') { const num=Number(n||0); return `${cur}${num.toFixed(2)}`; }
function fmtTime(iso) { return new Date(iso).toLocaleString(); }

function compare(a, b, key, dir) {
  const va = a[key]; const vb = b[key];
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  if (typeof va === 'number' && typeof vb === 'number') return dir * (va - vb);
  return dir * String(va).localeCompare(String(vb), undefined, { numeric: true });
}
function sortItems(items, sortKey) {
  const [key, order] = sortKey.split('_');
  const dir = order === 'desc' ? -1 : 1;
  const map = { qty: 'qty', name: 'name', updatedAt: 'updatedAt', cost:'cost' };
  const k = map[key] || 'updatedAt';
  return [...items].sort((a,b)=>compare(a,b,k,dir));
}
function applyFilters(items, query, loc, lowStockOnly, threshold) {
  const q = sanitize(query).toLowerCase();
  return items.filter(it => {
    const matchesQ = !q || (it.name.toLowerCase().includes(q) || String(it.sku||'').toLowerCase().includes(q));
    const matchesL = !loc || String(it.location||'') === loc;
    const matchesLow = !lowStockOnly || Number(it.qty||0) <= Number(threshold||0);
    return matchesQ && matchesL && matchesLow;
  });
}

function toRow(item, currency, isLow) {
  const lowClass = isLow ? 'low' : '';
  return `
  <tr data-id="${item.id}" class="${lowClass}">
    <td>${escapeHtml(item.name)}</td>
    <td>${escapeHtml(item.sku || '')}</td>
    <td class="num">${item.qty}</td>
    <td class="num">${fmtMoney(item.cost, currency)}</td>
    <td>${escapeHtml(item.location || '')}</td>
    <td>${fmtTime(item.updatedAt)}</td>
    <td>
      <button data-edit="${item.id}">Edit</button>
      <button class="danger" data-del="${item.id}">Delete</button>
    </td>
  </tr>`;
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}
function toCSV(items) {
  const headers = ['id','name','sku','qty','cost','location','updatedAt'];
  const lines = [headers.join(',')];
  for (const it of items) lines.push(headers.map(h => csvEscape(it[h])).join(','));
  const blob = new Blob(["\ufeff" + lines.join('\n')], { type: 'text/csv;charset=utf-8' }); // BOM for Excel
  return blob;
}
function detectDelimiter(text){ return (text.includes(';,') ? ',' : (text.split('\n')[0].includes(';') ? ';' : ',')); }
function parseCSV(text) {
  const delim = detectDelimiter(text);
  const rows = [];
  let i=0, field='', inQ=false, row=[];
  while (i < text.length) {
    const ch = text[i++];
    if (inQ) {
      if (ch === '"') { if (text[i] === '"') { field += '"'; i++; } else inQ=false; }
      else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === delim) { row.push(field); field=''; }
      else if (ch === '\n' || ch === '\r') {
        if (field!=='' || row.length) { row.push(field); rows.push(row); row=[]; field=''; }
        if (ch === '\r' && text[i] === '\n') i++;
      } else field += ch;
    }
  }
  if (field!=='' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map(h=>h.trim());
  const data = rows.slice(1);
  const idx = Object.fromEntries(header.map((h,i)=>[h, i]));
  const required = ['name','qty'];
  for (const r of required) if (!(r in idx)) throw new Error('CSV missing header: ' + r);
  const out = [];
  for (const r of data) {
    const obj = {
      id: r[idx.id] || uid(),
      name: sanitize(r[idx.name] || ''),
      sku: sanitize(idx.sku!=null ? r[idx.sku] : ''),
      qty: Number(idx.qty!=null ? r[idx.qty] : 0) || 0,
      cost: Number(idx.cost!=null ? r[idx.cost] : 0) || 0,
      location: sanitize(idx.location!=null ? r[idx.location] : ''),
      updatedAt: r[idx.updatedAt] || nowIso()
    };
    if (!obj.name) continue;
    if (obj.qty < 0) obj.qty = 0;
    out.push(obj);
  }
  return out;
}
function toJSON(items) { return new Blob([JSON.stringify(items, null, 2)], { type:'application/json' }); }
async function parseJSON(file) {
  const text = await file.text();
  const arr = JSON.parse(text);
  if (!Array.isArray(arr)) throw new Error('JSON must be an array of items');
  return arr.map(it => ({
    id: it.id || uid(),
    name: sanitize(it.name||''),
    sku: sanitize(it.sku||''),
    qty: Number(it.qty||0)||0,
    cost: Number(it.cost||0)||0,
    location: sanitize(it.location||''),
    updatedAt: it.updatedAt || nowIso()
  })).filter(it => it.name);
}

export function initApp(db, initialSettings) {
  const ui = window.__ui;
  let allItems = [];
  let filterQ = '';
  let filterLoc = '';
  let sortKey = 'updatedAt_desc';
  let lowOnly = false;

  // Settings with defaults
  let settings = Object.assign({ lowStockThreshold: 5, currency: '$', theme: 'dark', lastLocation:'' }, initialSettings || {});
  ui.applyTheme(settings.theme);

  async function refresh() {
    allItems = await db.all();
    paint();
    fillLocationFilter(allItems);
    updateSummary();
  }
  function fillLocationFilter(items) {
    const sel = ui.locationFilter;
    const selected = sel.value;
    const set = new Set(items.map(i=>i.location).filter(Boolean));
    sel.innerHTML = `<option value="">All locations</option>` + [...set].sort().map(l=>`<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
    if (selected && [...set].includes(selected)) sel.value = selected;
  }
  function updateSummary() {
    db.stats().then(s => {
      ui.sums.sumItems.textContent = s.items;
      ui.sums.sumQty.textContent = s.qty;
      ui.sums.sumValue.textContent = fmtMoney(s.value, settings.currency);
      ui.sums.sumLocs.textContent = s.locations;
    });
  }
  function paint() {
    const filtered = applyFilters(allItems, filterQ, filterLoc, lowOnly, settings.lowStockThreshold);
    const sorted = sortItems(filtered, sortKey);
    ui.rows.innerHTML = sorted.map(it => toRow(it, settings.currency, Number(it.qty||0) <= Number(settings.lowStockThreshold||0))).join('');
    ui.emptyState.classList.toggle('hidden', sorted.length !== 0);
  }
  function readForm() {
    const id = document.querySelector('#itemId').value || uid();
    const name = sanitize(document.querySelector('#name').value);
    const sku = sanitize(document.querySelector('#sku').value);
    const qty = Number(document.querySelector('#qty').value || '0');
    const cost = Number(document.querySelector('#cost').value || '0');
    const location = sanitize(document.querySelector('#location').value);
    return { id, name, sku, qty, cost, location, updatedAt: nowIso() };
  }
  function fillForm(item) {
    document.querySelector('#itemId').value = item?.id || '';
    document.querySelector('#name').value = item?.name || '';
    document.querySelector('#sku').value = item?.sku || '';
    document.querySelector('#qty').value = item?.qty ?? 0;
    document.querySelector('#cost').value = item?.cost ?? 0;
    document.querySelector('#location').value = item?.location || settings.lastLocation || '';
    document.querySelector('#dialogTitle').textContent = item ? 'Edit Item' : 'Add Item';
    document.querySelector('#formError').textContent = '';
    setTimeout(()=>document.querySelector('#name').focus(), 0);
  }
  function validate(item) {
    if (!item.name) return 'Name is required.';
    if (item.qty < 0) return 'Quantity cannot be negative.';
    if (item.cost < 0) return 'Cost cannot be negative.';
    return '';
  }

  // Events
  ui.addBtn.addEventListener('click', () => { fillForm(null); ui.dialog.showModal(); });

  ui.rows.addEventListener('click', async (e) => {
    const id = e.target.dataset.edit || e.target.dataset.del;
    if (!id) return;
    const item = allItems.find(i => i.id === id);
    if (!item) return;

    if (e.target.dataset.edit) {
      fillForm(item);
      ui.dialog.showModal();
    } else if (e.target.dataset.del) {
      await db.remove(id);
      ui.toast('Item deleted');
      refresh();
    }
  });

  ui.saveBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const item = readForm();
    const err = validate(item);
    if (err) { document.querySelector('#formError').textContent = err; return; }
    const existingSku = item.sku ? await db.findBySku(item.sku) : null;
    if (existingSku && existingSku.id !== item.id) ui.toast('Warning: duplicate SKU');
    await db.upsert(item);
    settings.lastLocation = item.location;
    await db.saveSettings(settings);
    ui.dialog.close();
    ui.toast('Saved');
    refresh();
  });

  ui.searchInput.addEventListener('input', (e) => { filterQ = e.target.value; paint(); });
  ui.sortSelect.addEventListener('change', (e) => { sortKey = e.target.value; paint(); });
  ui.locationFilter.addEventListener('change', (e) => { filterLoc = e.target.value; paint(); });
  ui.lowStockOnly.addEventListener('change', (e) => { lowOnly = e.target.checked; paint(); });

  ui.exportBtn.addEventListener('click', async () => {
    const blob = toCSV(await db.all());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `inventory-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  });

  ui.exportJsonBtn.addEventListener('click', async () => {
    const blob = toJSON(await db.all());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `inventory-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  });

  ui.importCsv.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const items = parseCSV(text);
      const chunk = 300;
      for (let i=0; i<items.length; i+=chunk) await db.bulkUpsert(items.slice(i, i+chunk));
      ui.toast(`Imported ${items.length} item(s)`);
      refresh();
    } catch (err) {
      ui.error('Import failed: ' + (err?.message || 'unknown error'));
    } finally {
      e.target.value = '';
    }
  });

  ui.importJson.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const items = await parseJSON(file);
      const chunk = 300;
      for (let i=0; i<items.length; i+=chunk) await db.bulkUpsert(items.slice(i, i+chunk));
      ui.toast(`Imported ${items.length} item(s)`);
      refresh();
    } catch (err) {
      ui.error('JSON import failed: ' + (err?.message || 'unknown error'));
    } finally {
      e.target.value = '';
    }
  });

  ui.clearBtn.addEventListener('click', async () => {
    const ok = confirm('This will permanently remove all items on this device.');
    if (!ok) return;
    await db.clear();
    ui.toast('Cleared');
    refresh();
  });

  ui.seedBtn.addEventListener('click', async () => {
    const sample = [
      { id: uid(), name:'USB-C Cable', sku:'USB-C-1M', qty:12, cost:3.5, location:'A1', updatedAt:nowIso() },
      { id: uid(), name:'HDMI Adapter', sku:'HDMI-ADPT', qty:3, cost:9.99, location:'A2', updatedAt:nowIso() },
      { id: uid(), name:'Notebook', sku:'NTBK-A5', qty:25, cost:1.2, location:'B1', updatedAt:nowIso() },
      { id: uid(), name:'Mouse', sku:'MSE-001', qty:2, cost:11, location:'A1', updatedAt:nowIso() }
    ];
    await db.bulkUpsert(sample);
    ui.toast('Sample data added');
    refresh();
  });

  // Settings dialog
  document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('threshold').value = settings.lowStockThreshold;
    document.getElementById('currency').value = settings.currency;
    document.getElementById('theme').value = settings.theme;
    ui.settingsDialog.showModal();
  });
  document.getElementById('saveSettings').addEventListener('click', async (e)=>{
    e.preventDefault();
    settings.lowStockThreshold = Number(document.getElementById('threshold').value || 0);
    settings.currency = sanitize(document.getElementById('currency').value || '$') || '$';
    settings.theme = document.getElementById('theme').value || 'dark';
    ui.applyTheme(settings.theme);
    await db.saveSettings(settings);
    ui.settingsDialog.close();
    ui.toast('Settings saved');
    paint(); updateSummary();
  });

  // Barcode scan (best-effort; secure contexts only)
  ui.scanBtn.addEventListener('click', async ()=>{
    if (!('BarcodeDetector' in window)) { ui.toast('Barcode scanning not supported'); return; }
    try {
      const detector = new window.BarcodeDetector({ formats: ['ean_13','ean_8','code_128','code_39','qr_code'] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = document.createElement('video'); video.srcObject = stream; await video.play();
      const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
      let tries = 0;
      const tick = async () => {
        if (video.videoWidth === 0 || video.videoHeight === 0) { if (++tries<30) return requestAnimationFrame(tick); }
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video,0,0); const bitmap = await createImageBitmap(canvas);
        const codes = await detector.detect(bitmap);
        if (codes.length) {
          document.getElementById('sku').value = codes[0].rawValue || codes[0].rawValue;
          stream.getTracks().forEach(t=>t.stop());
          ui.toast('Scanned');
        } else if (tries++ < 180) { requestAnimationFrame(tick); } else { stream.getTracks().forEach(t=>t.stop()); ui.toast('No code detected'); }
      };
      requestAnimationFrame(tick);
    } catch { ui.toast('Camera unavailable'); }
  });

  // Basic invariants check (console only)
  (function selfTest(){
    try {
      const csv = "id,name,sku,qty,cost,location,updatedAt\n,Pen,PEN,2,0.5,Desk,";
      const arr = parseCSV(csv);
      console.assert(arr.length===1 && arr[0].name==='Pen', 'CSV parse failed');
    } catch(e){ console.warn('Self-test: CSV parse error', e); }
  })();

  refresh();
}
