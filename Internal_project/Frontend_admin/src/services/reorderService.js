import { apiFetch } from './api.js';
import { inventoryService } from './inventoryService.js';

export const reorderService = {
  runReorder: () =>
    apiFetch('/api/reorder/run', {
      method: 'POST',
    }),

  getLowStockItems: () =>
    apiFetch('/api/reorder/low-stock'),

  getAiOrders: () =>
    apiFetch('/api/reorder/ai-orders'),

  getAlerts: () =>
    apiFetch('/api/reorder/alerts'),

  getAllWarehouses: async () => {
    try {
      const response = await apiFetch('/api/inventory/warehouses');
      const warehouses = Array.isArray(response?.warehouses) ? response.warehouses : [];
      return warehouses;
    } catch (error) {
      console.error('Failed to fetch warehouses:', error);
      return [];
    }
  },

  getAllCategories: async () => {
    try {
      const response = await apiFetch('/api/inventory/warehouses');
      const warehouses = Array.isArray(response?.warehouses) ? response.warehouses : [];
      
      // Extract unique categories from all inventory items across all warehouses
      const categoriesSet = new Set();
      warehouses.forEach((warehouse) => {
        const products = Array.isArray(warehouse?.products) ? warehouse.products : [];
        products.forEach((product) => {
          const category = product?.category;
          if (category && String(category).trim()) {
            categoriesSet.add(String(category).trim());
          }
        });
      });
      
      return Array.from(categoriesSet).sort();
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      return [];
    }
  },

  // Stock Health Overview data fetching methods
  getWarehouseStockData: async (warehouseCode) => {
    try {
      const { list } = await inventoryService.getWarehouseProducts(warehouseCode);
      return Array.isArray(list) ? list : [];
    } catch (error) {
      console.error('Failed to fetch warehouse stock data:', error);
      return [];
    }
  },

  searchStockBySku: async (sku) => {
    try {
      const { list } = await inventoryService.searchSku(sku);
      return Array.isArray(list) ? list : [];
    } catch (error) {
      console.error('Failed to search stock by SKU:', error);
      return [];
    }
  },

  getAllStockData: async () => {
    try {
      const response = await apiFetch('/api/inventory/warehouses');
      const warehouses = Array.isArray(response?.warehouses) ? response.warehouses : [];
      
      // Flatten all products from all warehouses
      const allProducts = [];
      warehouses.forEach((warehouse) => {
        const products = Array.isArray(warehouse?.products) ? warehouse.products : [];
        products.forEach((product) => {
          // ensure warehouse_code is carried through so the table can render every row uniquely
          allProducts.push({
            ...product,
            warehouse_code: product?.warehouse_code || warehouse.warehouse_code,
          });
        });
      });
      
      return allProducts;
    } catch (error) {
      console.error('Failed to fetch all stock data:', error);
      return [];
    }
  },
};
