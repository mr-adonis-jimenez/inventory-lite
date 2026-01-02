import { loadInventory, saveInventory } from './storage.js';

export class LocalVault {
  constructor() {
    this.items = loadInventory();
  }

  addItem(item) {
    this.items.push({
      id: crypto.randomUUID(),
      name: item.name,
      quantity: Number(item.quantity),
      location: item.location || 'N/A',
      updatedAt: new Date().toISOString()
    });
    this.persist();
  }

  updateQuantity(id, quantity) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    item.quantity = Number(quantity);
    item.updatedAt = new Date().toISOString();
    this.persist();
  }

  removeItem(id) {
    this.items = this.items.filter(i => i.id !== id);
    this.persist();
  }

  listItems() {
    return [...this.items];
  }

  persist() {
    saveInventory(this.items);
  }
}
