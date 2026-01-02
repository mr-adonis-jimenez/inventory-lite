/**
 * Local Vault - Lightning-fast inventory management system
 * @version 1.0.0
 * @license MIT
 */

class LocalVault {
  constructor(options = {}) {
    this.dbName = options.dbName || 'local-vault';
    this.version = options.version || 1;
    this.db = null;
    this.cache = new Map();
    this.cacheSize = options.cacheSize || 1000;
    this.eventListeners = new Map();
    
    // Configuration
    this.config = {
      enableSync: options.enableSync || false,
      indexFields: options.indexFields || ['sku', 'name', 'category'],
      alerts: {
        lowStockEnabled: options.lowStockEnabled !== false,
        checkInterval: options.checkInterval || 60000
      }
    };
    
    this.lowStockCheckInterval = null;
  }

  /**
   * Initialize the database
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        reject(new Error('Failed to open database'));
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        this._startLowStockMonitoring();
        resolve(this);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create items store
        if (!db.objectStoreNames.contains('items')) {
          const itemStore = db.createObjectStore('items', { keyPath: 'id', autoIncrement: false });
          itemStore.createIndex('sku', 'sku', { unique: true });
          itemStore.createIndex('name', 'name', { unique: false });
          itemStore.createIndex('category', 'category', { unique: false });
          itemStore.createIndex('quantity', 'quantity', { unique: false });
        }

        // Create transactions store
        if (!db.objectStoreNames.contains('transactions')) {
          const txStore = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: false });
          txStore.createIndex('itemId', 'itemId', { unique: false });
          txStore.createIndex('sku', 'sku', { unique: false });
          txStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Create categories store
        if (!db.objectStoreNames.contains('categories')) {
          const catStore = db.createObjectStore('categories', { keyPath: 'id', autoIncrement: false });
          catStore.createIndex('name', 'name', { unique: true });
          catStore.createIndex('parent', 'parent', { unique: false });
        }

        // Create metadata store
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Generate UUID
   */
  _generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Add item to cache
   */
  _addToCache(item) {
    if (this.cache.size >= this.cacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(item.sku, item);
  }

  /**
   * Get from cache
   */
  _getFromCache(sku) {
    return this.cache.get(sku);
  }

  /**
   * Clear cache
   */
  _clearCache() {
    this.cache.clear();
  }

  /**
   * Emit event
   */
  _emit(event, data) {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }

  /**
   * Subscribe to events
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  /**
   * Unsubscribe from events
   */
  off(event, callback) {
    if (!this.eventListeners.has(event)) return;
    const listeners = this.eventListeners.get(event);
    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  /**
   * Add a new item to inventory
   */
  async addItem(itemData) {
    if (!itemData.sku) {
      throw new Error('SKU is required');
    }
    if (!itemData.name) {
      throw new Error('Name is required');
    }

    const item = {
      id: this._generateId(),
      sku: itemData.sku,
      name: itemData.name,
      description: itemData.description || '',
      quantity: itemData.quantity || 0,
      price: itemData.price || 0,
      category: itemData.category || 'Uncategorized',
      lowStockThreshold: itemData.lowStockThreshold || 0,
      metadata: itemData.metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['items'], 'readwrite');
      const store = transaction.objectStore('items');
      const request = store.add(item);

      request.onsuccess = () => {
        this._addToCache(item);
        this._emit('item:added', item);
        resolve(item);
      };

      request.onerror = () => {
        reject(new Error(`Failed to add item: ${request.error.message}`));
      };
    });
  }

  /**
   * Get item by SKU
   */
  async getItem(sku) {
    // Check cache first
    const cached = this._getFromCache(sku);
    if (cached) {
      return cached;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['items'], 'readonly');
      const store = transaction.objectStore('items');
      const index = store.index('sku');
      const request = index.get(sku);

      request.onsuccess = () => {
        const item = request.result;
        if (item) {
          this._addToCache(item);
        }
        resolve(item || null);
      };

      request.onerror = () => {
        reject(new Error('Failed to get item'));
      };
    });
  }

  /**
   * Get item by ID
   */
  async getItemById(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['items'], 'readonly');
      const store = transaction.objectStore('items');
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(new Error('Failed to get item'));
      };
    });
  }

  /**
   * Update item
   */
  async updateItem(sku, updates) {
    const item = await this.getItem(sku);
    if (!item) {
      throw new Error(`Item with SKU ${sku} not found`);
    }

    const updatedItem = {
      ...item,
      ...updates,
      id: item.id, // Preserve ID
      sku: item.sku, // Preserve SKU
      createdAt: item.createdAt, // Preserve creation date
      updatedAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['items'], 'readwrite');
      const store = transaction.objectStore('items');
      const request = store.put(updatedItem);

      request.onsuccess = () => {
        this._addToCache(updatedItem);
        this._emit('item:updated', updatedItem);
        resolve(updatedItem);
      };

      request.onerror = () => {
        reject(new Error('Failed to update item'));
      };
    });
  }

  /**
   * Delete item
   */
  async deleteItem(sku) {
    const item = await this.getItem(sku);
    if (!item) {
      throw new Error(`Item with SKU ${sku} not found`);
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['items'], 'readwrite');
      const store = transaction.objectStore('items');
      const request = store.delete(item.id);

      request.onsuccess = () => {
        this.cache.delete(sku);
        this._emit('item:deleted', item);
        resolve(true);
      };

      request.onerror = () => {
        reject(new Error('Failed to delete item'));
      };
    });
  }

  /**
   * Get all items with optional filtering
   */
  async getAllItems(options = {}) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['items'], 'readonly');
      const store = transaction.objectStore('items');
      const request = store.getAll();

      request.onsuccess = () => {
        let items = request.result;

        // Filter by category
        if (options.category) {
          items = items.filter(item => item.category === options.category);
        }

        // Sort
        if (options.sortBy) {
          items.sort((a, b) => {
            const aVal = a[options.sortBy];
            const bVal = b[options.sortBy];
            const order = options.order === 'desc' ? -1 : 1;
            
            if (typeof aVal === 'string') {
              return order * aVal.localeCompare(bVal);
            }
            return order * (aVal - bVal);
          });
        }

        // Pagination
        if (options.offset !== undefined || options.limit !== undefined) {
          const offset = options.offset || 0;
          const limit = options.limit || items.length;
          items = items.slice(offset, offset + limit);
        }

        resolve(items);
      };

      request.onerror = () => {
        reject(new Error('Failed to get items'));
      };
    });
  }

  /**
   * Update quantity (add or subtract)
   */
  async updateQuantity(sku, delta, reason = '') {
    const item = await this.getItem(sku);
    if (!item) {
      throw new Error(`Item with SKU ${sku} not found`);
    }

    const previousQuantity = item.quantity;
    const newQuantity = previousQuantity + delta;

    if (newQuantity < 0) {
      throw new Error('Quantity cannot be negative');
    }

    // Update item quantity
    await this.updateItem(sku, { quantity: newQuantity });

    // Create transaction record
    const transaction = {
      id: this._generateId(),
      itemId: item.id,
      sku: item.sku,
      delta: delta,
      previousQuantity: previousQuantity,
      newQuantity: newQuantity,
      reason: reason,
      timestamp: new Date().toISOString()
    };

    await this._addTransaction(transaction);

    this._emit('quantity:changed', {
      item: { ...item, quantity: newQuantity },
      transaction
    });

    // Check for low stock
    if (newQuantity <= item.lowStockThreshold && newQuantity < previousQuantity) {
      this._emit('low:stock', { ...item, quantity: newQuantity });
    }

    return transaction;
  }

  /**
   * Set absolute quantity
   */
  async setQuantity(sku, quantity, reason = '') {
    const item = await this.getItem(sku);
    if (!item) {
      throw new Error(`Item with SKU ${sku} not found`);
    }

    const delta = quantity - item.quantity;
    return this.updateQuantity(sku, delta, reason);
  }

  /**
   * Add transaction record
   */
  async _addTransaction(transaction) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['transactions'], 'readwrite');
      const store = tx.objectStore('transactions');
      const request = store.add(transaction);

      request.onsuccess = () => resolve(transaction);
      request.onerror = () => reject(new Error('Failed to add transaction'));
    });
  }

  /**
   * Search items
   */
  async search(query, options = {}) {
    const fields = options.fields || ['name', 'sku', 'description'];
    const fuzzy = options.fuzzy !== false;
    const items = await this.getAllItems();

    const searchTerm = query.toLowerCase();

    return items.filter(item => {
      return fields.some(field => {
        const value = String(item[field] || '').toLowerCase();
        
        if (fuzzy) {
          // Simple fuzzy matching - check if all characters appear in order
          let searchIndex = 0;
          for (let i = 0; i < value.length && searchIndex < searchTerm.length; i++) {
            if (value[i] === searchTerm[searchIndex]) {
              searchIndex++;
            }
          }
          return searchIndex === searchTerm.length || value.includes(searchTerm);
        } else {
          return value.includes(searchTerm);
        }
      });
    });
  }

  /**
   * Filter by category
   */
  async filterByCategory(category) {
    return this.getAllItems({ category });
  }

  /**
   * Get low stock items
   */
  async getLowStockItems() {
    const items = await this.getAllItems();
    return items.filter(item => item.quantity <= item.lowStockThreshold);
  }

  /**
   * Start low stock monitoring
   */
  _startLowStockMonitoring() {
    if (!this.config.alerts.lowStockEnabled) return;

    this.lowStockCheckInterval = setInterval(async () => {
      try {
        const lowStockItems = await this.getLowStockItems();
        lowStockItems.forEach(item => {
          this._emit('low:stock', item);
        });
      } catch (error) {
        console.error('Error checking low stock:', error);
      }
    }, this.config.alerts.checkInterval);
  }

  /**
   * Stop low stock monitoring
   */
  _stopLowStockMonitoring() {
    if (this.lowStockCheckInterval) {
      clearInterval(this.lowStockCheckInterval);
      this.lowStockCheckInterval = null;
    }
  }

  /**
   * Add category
   */
  async addCategory(categoryData) {
    if (!categoryData.name) {
      throw new Error('Category name is required');
    }

    const category = {
      id: this._generateId(),
      name: categoryData.name,
      parent: categoryData.parent || null,
      description: categoryData.description || '',
      createdAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['categories'], 'readwrite');
      const store = transaction.objectStore('categories');
      const request = store.add(category);

      request.onsuccess = () => resolve(category);
      request.onerror = () => reject(new Error('Failed to add category'));
    });
  }

  /**
   * Get all categories
   */
  async getCategories() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['categories'], 'readonly');
      const store = transaction.objectStore('categories');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Failed to get categories'));
    });
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(sku = null, options = {}) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['transactions'], 'readonly');
      const store = transaction.objectStore('transactions');
      
      let request;
      if (sku) {
        const index = store.index('sku');
        request = index.getAll(sku);
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => {
        let transactions = request.result;

        // Filter by date range
        if (options.startDate || options.endDate) {
          transactions = transactions.filter(tx => {
            const txDate = new Date(tx.timestamp);
            if (options.startDate && txDate < options.startDate) return false;
            if (options.endDate && txDate > options.endDate) return false;
            return true;
          });
        }

        // Sort by timestamp (newest first)
        transactions.sort((a, b) => 
          new Date(b.timestamp) - new Date(a.timestamp)
        );

        // Limit results
        if (options.limit) {
          transactions = transactions.slice(0, options.limit);
        }

        resolve(transactions);
      };

      request.onerror = () => {
        reject(new Error('Failed to get transaction history'));
      };
    });
  }

  /**
   * Batch add items
   */
  async batchAdd(items) {
    const results = [];
    const errors = [];

    for (const itemData of items) {
      try {
        const item = await this.addItem(itemData);
        results.push(item);
      } catch (error) {
        errors.push({ item: itemData, error: error.message });
      }
    }

    return { results, errors };
  }

  /**
   * Batch update items
   */
  async batchUpdate(updates) {
    const results = [];
    const errors = [];

    for (const update of updates) {
      try {
        const item = await this.updateItem(update.sku, update.updates);
        results.push(item);
      } catch (error) {
        errors.push({ sku: update.sku, error: error.message });
      }
    }

    return { results, errors };
  }

  /**
   * Export data
   */
  async exportData(format = 'json') {
    const items = await this.getAllItems();
    const categories = await this.getCategories();
    const transactions = await this.getTransactionHistory();

    const data = {
      items,
      categories,
      transactions,
      exportDate: new Date().toISOString(),
      version: this.version
    };

    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else if (format === 'csv') {
      // Simple CSV export for items only
      const headers = ['SKU', 'Name', 'Quantity', 'Price', 'Category', 'Description'];
      const rows = items.map(item => [
        item.sku,
        item.name,
        item.quantity,
        item.price,
        item.category,
        item.description
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      return csv;
    }

    throw new Error('Unsupported format');
  }

  /**
   * Import data
   */
  async importData(data, format = 'json') {
    let parsedData;

    if (format === 'json') {
      parsedData = typeof data === 'string' ? JSON.parse(data) : data;
    } else if (format === 'csv') {
      // Simple CSV parsing for items
      const lines = data.split('\n');
      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
      
      parsedData = {
        items: lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.replace(/"/g, '').trim());
          return {
            sku: values[0],
            name: values[1],
            quantity: parseInt(values[2]) || 0,
            price: parseFloat(values[3]) || 0,
            category: values[4] || 'Uncategorized',
            description: values[5] || ''
          };
        }).filter(item => item.sku) // Filter out empty rows
      };
    } else {
      throw new Error('Unsupported format');
    }

    // Import items
    const itemResults = await this.batchAdd(parsedData.items || []);

    // Import categories if present
    let categoryResults = { results: [], errors: [] };
    if (parsedData.categories) {
      for (const cat of parsedData.categories) {
        try {
          const category = await this.addCategory(cat);
          categoryResults.results.push(category);
        } catch (error) {
          categoryResults.errors.push({ category: cat, error: error.message });
        }
      }
    }

    return {
      items: itemResults,
      categories: categoryResults,
      importDate: new Date().toISOString()
    };
  }

  /**
   * Get inventory statistics
   */
  async getStats() {
    const items = await this.getAllItems();
    const transactions = await this.getTransactionHistory();
    const lowStockItems = await this.getLowStockItems();

    const totalValue = items.reduce((sum, item) => 
      sum + (item.quantity * item.price), 0
    );

    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

    const categoryCounts = items.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {});

    return {
      totalProducts: items.length,
      totalItems: totalItems,
      totalValue: totalValue,
      lowStockCount: lowStockItems.length,
      categories: Object.keys(categoryCounts).length,
      categoryCounts: categoryCounts,
      transactionCount: transactions.length
    };
  }

  /**
   * Clear all data
   */
  async clearAll() {
    const stores = ['items', 'transactions', 'categories', 'metadata'];
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(stores, 'readwrite');
      
      let completed = 0;
      const checkComplete = () => {
        completed++;
        if (completed === stores.length) {
          this._clearCache();
          resolve(true);
        }
      };

      stores.forEach(storeName => {
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = checkComplete;
        request.onerror = () => reject(new Error(`Failed to clear ${storeName}`));
      });
    });
  }

  /**
   * Close database connection
   */
  close() {
    this._stopLowStockMonitoring();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this._clearCache();
  }

  /**
   * Delete database
   */
  static async deleteDatabase(dbName = 'local-vault') {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(new Error('Failed to delete database'));
    });
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LocalVault;
}

if (typeof window !== 'undefined') {
  window.LocalVault = LocalVault;
}

export default LocalVault;