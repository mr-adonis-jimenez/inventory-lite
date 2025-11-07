/* Why: wire DOM + expose UI bus; improve a11y & keyboard ergonomics. */
export function initUI(db, settings) {
  const $ = s => document.querySelector(s);

  const rows = $('#rows');
  const emptyState = $('#emptyState');
  const dialog = $('#itemDialog');
  const form = $('#itemForm');
  const toast = $('#toast');
  const banner = $('#banner');
  const settingsDialog = $('#settingsDialog');

  const addBtn = $('#addBtn');
  const exportBtn = $('#exportBtn');
  const exportJsonBtn = $('#exportJsonBtn');
  const importCsv = $('#importCsv');
  const importJson = $('#importJson');
  const clearBtn = $('#clearBtn');
  const seedBtn = $('#seedBtn');
  const settingsBtn = $('#settingsBtn');
  const saveBtn = $('#saveBtn');
  const searchInput = $('#searchInput');
  const sortSelect = $('#sortSelect');
  const locationFilter = $('#locationFilter');
  const lowStockOnly = $('#lowStockOnly');
  const scanBtn = $('#scanBtn');

  const sumItems = $('#sumItems');
  const sumQty = $('#sumQty');
  const sumValue = $('#sumValue');
  const sumLocs = $('#sumLocs');

  function showToast(msg, ms=1800) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(()=>toast.classList.remove('show'), ms);
  }
  function showError(msg) {
    banner.textContent = msg;
    banner.className = 'banner error';
    banner.classList.remove('hidden');
  }
  function clearError() { banner.classList.add('hidden'); }
  function applyTheme(theme){
    const root=document.documentElement;
    const resolve=(t)=>t==='system' ? (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light') : t;
    root.setAttribute('data-theme', resolve(theme||'dark'));
  }

  applyTheme(settings?.theme || 'dark');

  window.__ui = {
    addBtn, exportBtn, exportJsonBtn, importCsv, importJson, clearBtn, saveBtn, seedBtn, settingsBtn,
    searchInput, sortSelect, locationFilter, lowStockOnly, scanBtn,
    dialog, form, rows, emptyState, settingsDialog,
    toast: showToast, error: showError, clearError,
    sums: { sumItems, sumQty, sumValue, sumLocs },
    applyTheme
  };

  if (db instanceof Object && db.readonly) showError('Persistent storage is unavailable; running in memory only.');

  // Keyboard UX
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); searchInput.focus(); }
    if (e.key.toLowerCase() === 'a' && !dialog.open) addBtn.click();
    if (e.key.toLowerCase() === 'e' && !dialog.open) exportBtn.click();
  });
}
