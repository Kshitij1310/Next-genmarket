// API base URL may differ from the host serving the frontend.  
// Vite exposes environment variables with a `VITE_` prefix; when the
// app is built/deployed you should set VITE_API_URL to the backend address
// (for example `https://api.myapp.com`).
//
// The hard‑coded fallback is only used during local development if the
// variable is missing.
export const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const TOKEN_KEY = 'authToken';

const getAuthToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (error) {
    return null;
  }
};

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

export const apiFetch = async (endpoint, options = {}) => {
  try {
    const authToken = getAuthToken();
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    
    // Only parse JSON if content-type is JSON
    let data;
    if (contentType.includes('application/json') && text) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = text;
      }
    } else {
      data = text;
    }

    if (!response.ok) {
      // Extract clean error message
      let errorMessage = 'Request failed';
      
      if (typeof data === 'object' && data.message) {
        errorMessage = data.message;
      } else if (typeof data === 'object' && data.detail) {
        errorMessage = data.detail;
      } else if (typeof data === 'string') {
        // Extract first line of error if it's HTML or long text
        const firstLine = data.split('\n')[0].trim();
        if (firstLine.length < 100 && !firstLine.includes('<')) {
          errorMessage = firstLine;
        } else {
          errorMessage = `${response.status} ${response.statusText}`;
        }
      }
      
      const error = new Error(errorMessage);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    // If network error (backend not running)
    if (error.message.includes('fetch')) {
      throw new Error('Backend server is not running. Please start the backend on port 8000.');
    }
    throw error;
  }
};

export const api = {
  signup: (payload) =>
    apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  login: (payload) =>
    apiFetch('/api/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getProducts: ({ page = 1, pageSize = 20 } = {}) =>
    apiFetch(`/api/products${buildQuery({ page, page_size: pageSize })}`),
  getProductBySku: (sku) => apiFetch(`/api/products/${encodeURIComponent(sku)}`),
  searchProducts: (query) => apiFetch(`/api/search${buildQuery({ q: query })}`),
  getWarehouses: () => apiFetch('/api/warehouses'),
  getInventoryWarehouses: () => apiFetch('/api/inventory/warehouses'),
  getInventoryByWarehouse: (warehouseCode) =>
    apiFetch(`/api/inventory/warehouse/${encodeURIComponent(warehouseCode)}`),
  getInventoryWarehouseProducts: (warehouseCode) =>
    apiFetch(`/api/inventory/warehouse/${encodeURIComponent(warehouseCode)}/products`),
  getInventoryBySku: (sku) => apiFetch(`/api/inventory/sku/${encodeURIComponent(sku)}`),
  createOrder: (payload) =>
    apiFetch('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getOrderById: (orderId) => apiFetch(`/api/orders/${encodeURIComponent(orderId)}`),
  getTrackingByShipmentId: (shipmentId) =>
    apiFetch(`/api/tracking/${encodeURIComponent(shipmentId)}`),
};
