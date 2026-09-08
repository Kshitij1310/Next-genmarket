import { apiFetch } from './api.js';

const normalizeWarehouses = (data) => {
  if (Array.isArray(data?.warehouses)) return data.warehouses;
  if (Array.isArray(data)) return data;
  return [];
};

const warehouseCodeOf = (item) =>
  item?.warehouse_code || item?.code || item?.id || item?.warehouseCode || null;

const getWarehouses = async () => {
  const data = await apiFetch('/api/inventory/warehouses');
  return normalizeWarehouses(data);
};

const getWarehouseRevenue = async (warehouseCode) =>
  apiFetch(`/api/orders/admin/warehouses/${encodeURIComponent(warehouseCode)}/revenue`);

const getOrdersForRevenue = async (warehouseCode) =>
  apiFetch(`/api/orders/admin/warehouses/${encodeURIComponent(warehouseCode)}/delivered-orders`);

const getRevenueForWarehouses = async (warehouses = []) => {
  const codes = warehouses.map((wh) => warehouseCodeOf(wh)).filter(Boolean);
  const results = await Promise.all(
    codes.map(async (code) => {
      try {
        const payload = await getWarehouseRevenue(code);
        return { ...payload, warehouse_code: payload?.warehouse_code || code };
      } catch (error) {
        return { warehouse_code: code, error: error.message || 'Failed to fetch revenue' };
      }
    }),
  );
  return results.filter(Boolean);
};

export const revenueService = {
  getWarehouses,
  getWarehouseRevenue,
  getOrdersForRevenue,
  getRevenueForWarehouses,
};
