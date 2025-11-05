/* Why: storage + settings in one place; schema migration-friendly. */
export class DB {
  static async open() {
    if (!('indexedDB' in window)) return new MemoryDB(true);
    return new IndexedDBImpl();
  }
  async all() { throw new Error('not implemented'); }
  async upsert(_) { throw new Error('not implemented'); }
  async bulkUpsert(_) { throw new Error('not implemented'); }
  async bulkRemove(_) { throw new Error('not implemented'); }
  async remove(_) { throw new Error('not implemented'); }
  async clear() { throw new Error('not implemented'); }
  async findBySku(_) { throw new Error('not implemented'); }
  async stats() { throw new Error('not implemented'); }
  async loadSettings() { throw new Error('not implemented'); }
  async saveSettings(_) { throw new Error('not implemented'); }
}

class IndexedDBImpl extends DB {
  constructor() {
    super();
    this.name = 'inventory-lite';
    this.version = 2; // v2: add settings store
    this.ready = this.#init();
  }
  async #init() {
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, this.version);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        if (e.oldVersion < 1) {
          const store = db.createObjectStore('items', { keyPath: 'id' });
          store.createIndex('name', 'name');
          store.createIndex('sku', 'sku'); // keep non-unique; we warn in UI
          store.createIndex('location', 'location');
          store.createIndex('updatedAt', 'updatedAt');
        }
        if (e.oldVersion < 2) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async #tx(storeMode='readonly', stores=['items']) {
    await this.ready;
    const tx = this.db.transaction(stores, storeMode);
    return stores.length === 1 ? tx.objectStore(stores[0]) : tx;
  }
  async all() {
    const s = await this.#tx();
    return new Promise((res, rej) => {
      const r = s.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error);
    });
  }
  async upsert(item) {
    const s = await this.#tx('readwrite');
    await new Promise((res, rej)=>{ const r=s.put(item); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });
  }
  async bulkUpsert(items) {
    const s = await this.#tx('readwrite');
    await new Promise((resolve, reject) => {
      let i = 0;
      const next = () => {
        if (i >= items.length) return resolve();
        const r = s.put(items[i++]); r.onsuccess = next; r.onerror = () => reject(r.error);
      };
      next();
    });
  }
  async bulkRemove(ids) {
    const s = await this.#tx('readwrite');
    await new Promise((resolve, reject) => {
      let i = 0;
      const next = () => {
        if (i >= ids.length) return resolve();
        const r = s.delete(ids[i++]); r.onsuccess = next; r.onerror = () => reject(r.error);
      };
      next();
    });
  }
  async remove(id) {
    const s = await this.#tx('readwrite');
    await new Promise((res, rej)=>{ const r=s.delete(id); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });
  }
  async clear() {
    const s = await this.#tx('readwrite');
    await new Promise((res, rej)=>{ const r=s.clear(); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });
  }
  async findBySku(sku) {
    const s = await this.#tx();
    const idx = s.index('sku');
    return new Promise((res, rej)=>{ const r=idx.get(sku); r.onsuccess=()=>res(r.result||null); r.onerror=()=>rej(r.error); });
  }
  async stats() {
    const items = await this.all();
    let qty=0, value=0;
    const locs = new Set();
    for (const it of items) { qty += Number(it.qty||0); value += Number(it.qty||0)*Number(it.cost||0); if (it.location) locs.add(it.location); }
    return { items: items.length, qty, value, locations: locs.size };
  }
  async loadSettings() {
    try {
      const s = await this.#tx('readonly', ['settings']);
      return await new Promise((res, rej)=>{
        const r = s.get('app'); r.onsuccess=()=>res(r.result?.value || null); r.onerror=()=>rej(r.error);
      });
    } catch { return null; }
  }
  async saveSettings(value) {
    const s = await this.#tx('readwrite', ['settings']);
    await new Promise((res, rej)=>{ const r=s.put({ key:'app', value }); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });
  }
}

/* Memory fallback for non-persistent contexts. */
class MemoryDB extends DB {
  constructor(readonly=false){ super(); this.readonly=readonly; this.map=new Map(); this.settings=null; }
  async all(){ return [...this.map.values()]; }
  async upsert(i){ if(this.readonly) throw new Error('readonly'); this.map.set(i.id, i); }
  async bulkUpsert(items){ if(this.readonly) throw new Error('readonly'); for(const it of items) this.map.set(it.id,it); }
  async bulkRemove(ids){ if(this.readonly) throw new Error('readonly'); for(const id of ids) this.map.delete(id); }
  async remove(id){ if(this.readonly) throw new Error('readonly'); this.map.delete(id); }
  async clear(){ if(this.readonly) throw new Error('readonly'); this.map.clear(); }
  async findBySku(sku){ for(const v of this.map.values()) if(v.sku===sku) return v; return null; }
  async stats(){ const items=[...this.map.values()]; let qty=0,value=0; const s=new Set(); for(const it of items){ qty+=+it.qty||0; value+=(+it.qty||0)*(+it.cost||0); if(it.location) s.add(it.location);} return {items:items.length, qty, value, locations:s.size}; }
  async loadSettings(){ return this.settings; }
  async saveSettings(v){ this.settings=v; }
}
