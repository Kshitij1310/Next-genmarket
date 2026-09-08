import { apiFetch } from './api.js';

const buildQuery = (params = {}) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  });
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
};

export const inventoryService = {
  getWarehouses: async () => {
    const data = await apiFetch('/api/inventory/warehouses');
    const warehouses = Array.isArray(data?.warehouses)
      ? data.warehouses
      : Array.isArray(data)
        ? data
        : [];
    return { data, list: warehouses };
  },
  getWarehouseProducts: async (code) => {
    const data = await apiFetch(`/api/inventory/warehouse/${encodeURIComponent(code)}/products`);
    return { data, list: Array.isArray(data) ? data : [] };
  },
  searchSku: async (sku) => {
    const data = await apiFetch(`/api/inventory/sku/${encodeURIComponent(sku)}`);
    return { data, list: Array.isArray(data) ? data : [] };
  },
  getThresholds: async () => {
    const data = await apiFetch('/api/inventory/thresholds');
    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
    return { data, items };
  },
  getExpiryAlerts: async ({ warehouseCode, saleStatus } = {}) => {
    const params = {
      warehouse_code: warehouseCode,
      sale_status: saleStatus,
    };
    const data = await apiFetch(`/api/inventory/expiry-alerts${buildQuery(params)}`);
    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
    return { data, items };
  },
  triggerExpiryAlerts: async ({ warehouseCode, persistAlerts } = {}) => {
    const params = {
      warehouse_code: warehouseCode,
      persist_alerts: persistAlerts,
    };
    const data = await apiFetch(`/api/inventory/expiry-alerts/trigger${buildQuery(params)}`, {
      method: 'POST',
    });
    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
    return { data, items };
  },
  getWarehouseCapacity: async () => {
    const data = await apiFetch('/api/inventory/warehouse-capacity');
    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
    return { data, items };
  },

  // trigger recalculation of warehouse capacity on the backend
  // the dashboard relies on this to refresh utilization values
  recalcWarehouseCapacity: async () => {
    // backend expects a GET request; no payload required
    const data = await apiFetch('/api/inventory/warehouse-capacity/recalculate');
    // return whatever the API responds with so callers can handle it
    return data;
  },
};
