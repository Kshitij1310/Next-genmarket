import { apiFetch } from './api.js';

export const dashboardService = {
  getProductsSummary: async () => {
    const data = await apiFetch('/api/products?page=1&page_size=1');
    const total = Number(data?.total ?? data?.totalCount ?? data?.count ?? 0);
    return { total: Number.isNaN(total) ? 0 : total };
  },
  getInventorySummary: async () => {
    const data = await apiFetch('/api/inventory/warehouses');
    const warehouses = Array.isArray(data?.warehouses) ? data.warehouses : [];
    const totalQuantity = warehouses.reduce((sum, warehouse) => {
      const items = Array.isArray(warehouse?.products) ? warehouse.products : [];
      return (
        sum +
        items.reduce((inner, item) => inner + Number(item?.quantity || 0), 0)
      );
    }, 0);
    return { totalWarehouses: warehouses.length, totalQuantity };
  },
  getOrdersSummary: async (ordersOrIds = []) => {
    if (!Array.isArray(ordersOrIds) || ordersOrIds.length === 0) {
      return { total: 0, recent: [] };
    }
    const orders = await Promise.all(
      ordersOrIds.map(async (item) => {
        const orderId =
          typeof item === 'string'
            ? item
            : item?.order_id ?? item?.orderId ?? item?.id;
        if (!orderId) return null;
        try {
          return await apiFetch(`/api/orders/${encodeURIComponent(orderId)}`);
        } catch (error) {
          return typeof item === 'object' ? item : null;
        }
      })
    );
    const filtered = orders.filter(Boolean);
    return { total: filtered.length, recent: filtered };
  },
  getAllOrders: async (ordersOrIds = []) => {
    if (!Array.isArray(ordersOrIds) || ordersOrIds.length === 0) {
      return [];
    }
    const orders = await Promise.all(
      ordersOrIds.map(async (item) => {
        const orderId =
          typeof item === 'string'
            ? item
            : item?.order_id ?? item?.orderId ?? item?.id;
        if (!orderId) return null;
        try {
          return await apiFetch(`/api/orders/${encodeURIComponent(orderId)}`);
        } catch (error) {
          return typeof item === 'object' ? item : null;
        }
      })
    );
    return orders.filter(Boolean);
  },
  getShipments: async (limit = 500) => {
    const data = await apiFetch(`/api/shipments?limit=${limit}`);
    const items = Array.isArray(data?.items) ? data.items : [];
    return items;
  },
};
