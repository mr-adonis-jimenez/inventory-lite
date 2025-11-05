/* Why: wire DOM + expose UI bus; improve a11y & keyboard ergonomics. */
export function initUI(db, settings) {
  // Tiny selector helper
  const $ = (s) => document.querySelector(s);

  // Cache DOM
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

  // Defensive: ensure required nodes exist to avoid null errors
  const requiredNodes = [
    rows, emptyState, dialog, form, toast, banner, addBtn, exportBtn,
    importCsv, clearBtn, saveBtn, searchInput, sortSelect, locationFilter
  ];
  if (requiredNodes.some((n) => !n)) {
    console.error('[ui] Missing required DOM nodes. Check index.html IDs.');
    return;
  }

  function showToast(msg, ms = 1800) {
    toast.textContent = String(msg || '');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), ms);
  }

  function showError(msg) {
    banner.textContent = String(msg || '');
    banner.className = 'banner error';
    banner.classList.remove('hidden');
  }

  function clearError() {
    banner.classList.add('hidden');
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    function resolve(t) {
      if (t === 'system') {
        try {
          return window.matchMedia &&
            window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
        } catch (_) {
          return 'dark';
        }
      }
      return t || 'dark';
    }
    root.setAttribute('data-theme', resolve(theme));
  }

  // Avoid optional chaining for wider compatibility
  const initialTheme = (settings && settings.theme) ? settings.theme : 'dark';
  applyTheme(initialTheme);

  // Expose a small UI “bus” for app.js
  window.__ui = {
    addBtn,
    exportBtn,
    exportJsonBtn,
    importCsv,
    importJson,
    clearBtn,
    saveBtn,
    seedBtn,
    settingsBtn,
    searchInput,
    sortSelect,
    locationFilter,
    lowStockOnly,
    scanBtn,
    dialog,
    form,
    rows,
    emptyState,
    settingsDialog,
    toast: showToast,
    error: showError,
    clearError,
    sums: { sumItems, sumQty, sumValue, sumLocs },
    applyTheme,
  };

  // Readonly banner if IDB is unavailable (MemoryDB)
  if (db && typeof db === 'object' && db.readonly) {
    showError('Persistent storage is unavailable; running in memory only.');
  }

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    // Focus search with '/'
    const activeEl = document.activeElement;
    const activeTag = activeEl && activeEl.tagName ? activeEl.tagName.toUpperCase() : '';
    if (e.key === '/' && activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
      e.preventDefault();
      if (searchInput) searchInput.focus();
      return;
    }
    // 'a' to add (if dialog not open)
    if (e.key && e.key.toLowerCase() === 'a' && (!dialog || !dialog.open)) {
      if (addBtn) addBtn.click();
      return;
    }
    // 'e' to export CSV (if dialog not open)
    if (e.key && e.key.toLowerCase() === 'e' && (!dialog || !dialog.open)) {
      if (exportBtn) exportBtn.click();
    }
  });
}

