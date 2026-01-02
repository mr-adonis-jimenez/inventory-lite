const STORAGE_KEY = 'local_vault_inventory';

export function loadInventory() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function saveInventory(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}
